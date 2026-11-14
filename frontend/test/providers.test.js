import { describe, expect, it, vi } from 'vitest';
import { createBrowserSpeech } from '../src/speech.js';
import { createBrowserVoice, matchSpoken } from '../src/voice.js';

// ---- fakes ------------------------------------------------------------------

function fakeSpeechWindow({ voices = [{ lang: 'en-US', name: 'En' }], audioFails = false, withAudio = true } = {}) {
  const spoken = [];
  const played = [];
  let listeners = {};
  const synth = {
    getVoices: () => voices,
    speak: vi.fn((u) => {
      spoken.push({ text: u.text, lang: u.lang });
      setTimeout(() => u.onend?.(), 0);
    }),
    cancel: vi.fn(),
    addEventListener: (name, fn) => (listeners[name] = fn),
  };
  class Audio {
    constructor() {
      this.handlers = {};
      played.push(this);
    }
    addEventListener(n, fn) {
      this.handlers[n] = fn;
    }
    play() {
      setTimeout(() => (audioFails ? this.handlers.error?.() : this.handlers.ended?.()), 0);
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    removeAttribute() {}
  }
  class SpeechSynthesisUtterance {
    constructor(text) {
      this.text = text;
    }
  }
  const win = { speechSynthesis: synth, SpeechSynthesisUtterance, ...(withAudio ? { Audio } : {}) };
  return { win, synth, spoken, played, fire: (n) => listeners[n]?.() };
}

function fakeRecognitionWindow(behaviour, { onLine = true } = {}) {
  const made = [];
  class Recognition {
    constructor() {
      made.push(this);
    }
    start() {
      setTimeout(() => behaviour(this), 0);
    }
    stop() {
      setTimeout(() => this.onend?.(), 0);
    }
  }
  return { win: { webkitSpeechRecognition: Recognition, navigator: { onLine } }, made };
}

const said = (rec, text) => {
  rec.onresult?.({ results: [[{ transcript: text }]] });
  rec.onend?.();
};

// ---- read-aloud fallback chain ----------------------------------------------

describe('read-aloud provider: audio -> browser voice -> unavailable', () => {
  it('plays the audio file for this language and does not synthesize', async () => {
    const f = fakeSpeechWindow();
    const speech = createBrowserSpeech(f.win);
    await speech.speak('Hello', 'en', { audioUrl: '/a/q1.mp3' });
    expect(f.played).toHaveLength(1);
    expect(f.played[0].src).toBe('/a/q1.mp3');
    expect(f.synth.speak).not.toHaveBeenCalled();
  });

  it('creates the audio element only when asked to speak (files load only when needed)', () => {
    const f = fakeSpeechWindow();
    const speech = createBrowserSpeech(f.win);
    expect(speech.isAvailable('en', { audioUrl: '/a/q1.mp3' })).toBe(true);
    expect(f.played).toHaveLength(0);
  });

  it('falls back to a browser voice for the language when the audio fails', async () => {
    const f = fakeSpeechWindow({ audioFails: true });
    await createBrowserSpeech(f.win).speak('Hello', 'en', { audioUrl: '/missing.mp3' });
    expect(f.spoken).toEqual([{ text: 'Hello', lang: 'en-US' }]);
  });

  it('uses a voice only for the same language, otherwise it is not available', async () => {
    const f = fakeSpeechWindow({ voices: [{ lang: 'en-GB' }] });
    const speech = createBrowserSpeech(f.win);
    expect(speech.isAvailable('en')).toBe(true);
    expect(speech.isAvailable('am')).toBe(false);
    expect(speech.isAvailable('am', { audioUrl: '/am.mp3' })).toBe(true);
    await expect(speech.speak('ሰላም', 'am')).rejects.toThrow('unavailable');
  });

  it('is not available at all without speechSynthesis or audio', () => {
    const speech = createBrowserSpeech({});
    expect(speech.isAvailable('en')).toBe(false);
    expect(speech.isAvailable('en', { audioUrl: '/a.mp3' })).toBe(false);
  });

  it('stop() cancels speech and the speak() promise settles', async () => {
    const f = fakeSpeechWindow();
    f.synth.speak = vi.fn(); // never ends by itself
    const speech = createBrowserSpeech(f.win);
    const p = speech.speak('Long text', 'en');
    speech.stop();
    await expect(p).resolves.toBeUndefined();
    expect(f.synth.cancel).toHaveBeenCalled();
  });

  it('whenReady() waits for late voices', async () => {
    const f = fakeSpeechWindow({ voices: [] });
    let done = false;
    createBrowserSpeech(f.win).whenReady(5000).then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    f.fire('voiceschanged');
    await new Promise((r) => setTimeout(r, 0));
    expect(done).toBe(true);
  });
});

// ---- voice input -------------------------------------------------------------

describe('voice provider: browser SpeechRecognition', () => {
  it('is unavailable without SpeechRecognition', () => {
    expect(createBrowserVoice({}).isAvailable()).toBe(false);
  });

  it('returns what was said, using a locale for the language', async () => {
    const f = fakeRecognitionWindow((rec) => said(rec, 'Hana Tesfaye'));
    const voice = createBrowserVoice(f.win);
    expect(voice.isAvailable()).toBe(true);
    await expect(voice.listen('am')).resolves.toBe('Hana Tesfaye');
    expect(f.made[0].lang).toBe('am-ET');
  });

  it.each([
    ['not-allowed', 'permission'],
    ['service-not-allowed', 'permission'],
    ['no-speech', 'no_speech'],
    ['network', 'offline'],
    ['audio-capture', 'no_microphone'],
    ['something-else', 'failed'],
  ])('maps the browser error %s to %s', async (browserError, code) => {
    const f = fakeRecognitionWindow((rec) => {
      rec.onerror?.({ error: browserError });
      rec.onend?.();
    });
    await expect(createBrowserVoice(f.win).listen('en')).rejects.toMatchObject({ code });
  });

  it('reports offline before starting when the browser is offline', async () => {
    const f = fakeRecognitionWindow(() => {}, { onLine: false });
    await expect(createBrowserVoice(f.win).listen('en')).rejects.toMatchObject({ code: 'offline' });
    expect(f.made).toHaveLength(0);
  });

  it('treats an end without words as "no speech" and a stop by the learner as "aborted"', async () => {
    const silent = fakeRecognitionWindow((rec) => rec.onend?.());
    await expect(createBrowserVoice(silent.win).listen('en')).rejects.toMatchObject({ code: 'no_speech' });

    const waiting = fakeRecognitionWindow(() => {});
    const voice = createBrowserVoice(waiting.win);
    const p = voice.listen('en');
    await new Promise((r) => setTimeout(r, 0));
    voice.stop();
    await expect(p).rejects.toMatchObject({ code: 'aborted' });
  });
});

describe('matching spoken words to options', () => {
  const single = {
    type: 'single',
    options: [
      { value: 'en', label: { en: 'English' } },
      { value: 'am', label: { en: 'Amharic (አማርኛ)' } },
      { value: 'kebele-id', label: { en: 'Kebele ID' } },
      { value: 'refer-me', label: { en: "I don't have a document. Please refer me." }, simple: { en: 'I have no ID. Please help me.' } },
    ],
  };

  it('matches labels, parts of labels, Amharic text and simple labels', () => {
    expect(matchSpoken(single, 'English')).toBe('en');
    expect(matchSpoken(single, 'I speak amharic')).toBe('am');
    expect(matchSpoken(single, 'አማርኛ')).toBe('am');
    expect(matchSpoken(single, 'kebele id please')).toBe('kebele-id');
    expect(matchSpoken(single, 'I have no ID. Please help me')).toBe('refer-me');
  });

  it('returns nothing when it does not match', () => {
    expect(matchSpoken(single, 'banana')).toBeUndefined();
    expect(matchSpoken(single, '')).toBeUndefined();
  });

  it('matches several options for multi questions', () => {
    const multi = { type: 'multi', options: [{ value: 'a', label: { en: 'Larger text' } }, { value: 'b', label: { en: 'High contrast' } }, { value: 'c', label: { en: 'Screen reader' } }] };
    expect(matchSpoken(multi, 'larger text and high contrast')).toEqual(['a', 'b']);
    expect(matchSpoken(multi, 'nothing')).toBeUndefined();
  });

  it('understands yes and no in English and Amharic', () => {
    const yn = { type: 'yesno' };
    expect(matchSpoken(yn, 'yes please')).toBe(true);
    expect(matchSpoken(yn, 'አዎ')).toBe(true);
    expect(matchSpoken(yn, 'no')).toBe(false);
    expect(matchSpoken(yn, 'አይ')).toBe(false);
    expect(matchSpoken(yn, 'maybe')).toBeUndefined();
    expect(matchSpoken(yn, 'yes no')).toBeUndefined();
  });
});
