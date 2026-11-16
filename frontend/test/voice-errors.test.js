import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetProviders, setVoiceProvider } from '../src/providers.js';
import { createBrowserVoice, createServerVoice } from '../src/voice.js';
import { $, $$, button, mount, wait } from './helpers.js';

// A fake SpeechRecognition that fails with the given error event.
function recognitionFailingWith(error, seen = {}) {
  return class {
    start() {
      seen.lang = this.lang;
      setTimeout(() => {
        if (error) this.onerror?.({ error });
        this.onend?.();
      });
    }
    stop() {}
  };
}

describe('browser recogniser errors', () => {
  it.each([
    ['language-not-supported', 'language'],
    ['not-allowed', 'permission'],
    ['audio-capture', 'no_microphone'],
    ['network', 'offline'],
    ['no-speech', 'no_speech'],
    ['bad-grammar', 'failed'],
  ])('%s -> %s', async (error, code) => {
    const win = { SpeechRecognition: recognitionFailingWith(error), navigator: { onLine: true }, isSecureContext: true };
    await expect(createBrowserVoice(win).listen('en')).rejects.toMatchObject({ code });
  });

  it('on a page that is not secure (http on a LAN address) says so instead of "blocked"', async () => {
    const win = { SpeechRecognition: recognitionFailingWith('not-allowed'), navigator: { onLine: true }, isSecureContext: false };
    await expect(createBrowserVoice(win).listen('en')).rejects.toMatchObject({ code: 'insecure' });
  });

  it('asks for Arabic with a region (Chrome may refuse "ar" alone)', async () => {
    const seen = {};
    const win = { SpeechRecognition: recognitionFailingWith('no-speech', seen), navigator: { onLine: true }, isSecureContext: true };
    await createBrowserVoice(win).listen('ar').catch(() => {});
    expect(seen.lang).toBe('ar-EG');
  });

  it('server recording: no microphone access on an insecure page, and an unsupported language', async () => {
    const insecure = createServerVoice({ api: {}, win: { navigator: { onLine: true }, isSecureContext: false, MediaRecorder: class {} } });
    await expect(insecure.listen('am')).rejects.toMatchObject({ code: 'insecure' });
  });
});

describe('consent after "No, I will type"', () => {
  const flow = { version: '1', flowId: 'consent', title: { en: 'C' }, questions: [{ id: 'name', type: 'text', label: { en: 'Name' } }] };
  beforeEach(() => {
    localStorage.clear();
    setVoiceProvider({ isAvailable: () => true, listen: async () => 'Hana', stop() {} });
  });
  afterEach(() => {
    resetProviders();
    document.body.textContent = '';
    vi.restoreAllMocks();
  });

  it('is asked once; saying no hides the mic, and choosing voice again in Settings asks again', async () => {
    const el = await mount(flow, {}, { prefs: { chosen: true, voice: true } });
    button(el, 'Speak your answer').click();
    expect($(el, '.op-consent')).not.toBeNull();
    button(el, 'No, I will type').click();
    expect($(el, '.op-mic')).toBeNull();

    button(el, 'Settings').click();
    expect($(el, '.op-helpers input[value=voice]').checked).toBe(true);
    button(el, 'Continue with these helpers').click();
    button(el, 'Speak your answer').click();
    expect($(el, '.op-consent')).not.toBeNull();
    button(el, 'Allow').click();
    await wait(20);
    expect($(el, 'input').value).toBe('Hana');

    // Allowed once: the next time there is no question.
    $(el, 'input').value = '';
    button(el, 'Speak your answer').click();
    expect($(el, '.op-consent')).toBeNull();
    await wait(20);
    expect($(el, 'input').value).toBe('Hana');
    expect($$(el, '.op-consent')).toHaveLength(0);
  });
});
