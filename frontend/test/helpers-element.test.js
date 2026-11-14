import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetProviders, setSpeechProvider, setVoiceProvider } from '../src/providers.js';
import { $, $$, active, button, heading, mount, pick, type, wait } from './helpers.js';

const flow = {
  version: '1',
  flowId: 'helpers',
  title: { en: 'Helpers' },
  questions: [
    { id: 'intro', type: 'info', label: { en: 'Welcome' }, simple: { en: 'Hello' }, hint: { en: 'No time limit.' } },
    {
      id: 'access',
      type: 'multi',
      setsPreference: 'access',
      label: { en: 'What helps you?' },
      options: [
        { value: 'larger-text', label: { en: 'Larger text' } },
        { value: 'simple-words', label: { en: 'Simpler words' } },
        { value: 'screen-reader', label: { en: 'Screen reader' } },
      ],
    },
    {
      id: 'name',
      type: 'text',
      required: true,
      voice: true,
      icon: 'person',
      label: { en: 'What is your full name?' },
      simple: { en: 'Your name' },
      hint: { en: 'Full name' },
      audio: { en: '/audio/name.mp3' },
    },
    {
      id: 'lang',
      type: 'single',
      required: true,
      voice: true,
      label: { en: 'Which language do you prefer?' },
      simple: { en: 'Which language?' },
      options: [{ value: 'en', label: { en: 'English' } }, { value: 'am', label: { en: 'Amharic' } }],
    },
    { id: 'ok', type: 'yesno', voice: true, label: { en: 'Is this right?' } },
    { id: 'note', type: 'text', label: { en: 'Note (no voice)' } },
  ],
};

const PREFS = 'openpath:prefs';
const savedPrefs = () => JSON.parse(localStorage.getItem(PREFS));
const next = (el) => button(el, 'Next').click();
const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeSpeech(available = true) {
  let end;
  return {
    isAvailable: vi.fn(() => available),
    speak: vi.fn(() => new Promise((r) => (end = r))),
    stop: vi.fn(() => end?.()),
  };
}

function fakeVoice(result) {
  return {
    isAvailable: vi.fn(() => true),
    listen: vi.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result))),
    stop: vi.fn(),
  };
}
const voiceError = (code) => Object.assign(new Error(code), { code });

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.textContent = '';
  resetProviders();
  vi.restoreAllMocks();
});

// ---- 1. "How do you want to use this?" ----------------------------------------

describe('first step: how do you want to use this?', () => {
  it('shows first, with "Continue with my device\'s own tools" as the first control', async () => {
    const el = await mount(flow, {}, { prefs: null });
    expect(heading(el)).toBe('How do you want to use this?');
    const controls = $$(el, 'button, input');
    expect(controls[0].textContent).toBe("Continue with my device's own tools");
    // Voice is not offered: jsdom has no SpeechRecognition. Read-aloud is,
    // because a question in this flow has an English audio file.
    const labels = $$(el, '.op-helpers label').map((l) => l.textContent);
    expect(labels).toEqual(['Read questions to me', 'Simple words', 'Bigger text', 'High contrast', 'Dark colours']);
  });

  it('does not offer read-aloud when there is no voice and no audio file', async () => {
    const noAudio = structuredClone(flow);
    delete noAudio.questions[2].audio;
    const el = await mount(noAudio, {}, { prefs: null });
    expect($$(el, '.op-helpers label').map((l) => l.textContent)).toEqual(['Simple words', 'Bigger text', 'High contrast', 'Dark colours']);
  });

  it('device tools: turns every helper off, saves the choice and is skipped next time', async () => {
    const el = await mount(flow, {}, { prefs: null });
    button(el, "Continue with my device's own tools").click();
    expect(heading(el)).toContain('Welcome');
    expect(active(el)).toBe($(el, 'h2'));
    expect(savedPrefs()).toMatchObject({ chosen: true, readAloud: false, voice: false, simple: false, largerText: false, highContrast: false });
    el.remove();
    const again = await mount(flow, {}, { prefs: undefined });
    expect(heading(again)).toContain('Welcome');
  });

  it('saves chosen helpers and applies them', async () => {
    setSpeechProvider(fakeSpeech());
    setVoiceProvider(fakeVoice('x'));
    const el = await mount(flow, {}, { prefs: null });
    expect($$(el, '.op-helpers label').map((l) => l.textContent)).toEqual([
      'Read questions to me', 'I want to speak my answers', 'Simple words', 'Bigger text', 'High contrast', 'Dark colours',
    ]);
    for (const v of ['simple', 'largerText']) pick($(el, `.op-helpers input[value=${v}]`));
    button(el, 'Continue with these helpers').click();
    expect(savedPrefs()).toMatchObject({ chosen: true, simple: true, largerText: true, readAloud: false, voice: false });
    expect($(el, '.op-root').hasAttribute('data-larger-text')).toBe(true);
    expect(heading(el)).toContain('Hello'); // simple words
  });

  it('previews bigger text and high contrast as soon as they are ticked', async () => {
    const el = await mount(flow, {}, { prefs: null });
    pick($(el, '.op-helpers input[value=highContrast]'));
    $(el, '.op-helpers input[value=highContrast]').dispatchEvent(new Event('change'));
    expect($(el, '.op-root').hasAttribute('data-high-contrast')).toBe(true);
  });

  it('has a Settings button on every step that reopens it and returns to the same step', async () => {
    const el = await mount(flow);
    next(el);
    next(el);
    expect(heading(el)).toContain('full name');
    button(el, 'Settings').click();
    expect(heading(el)).toBe('How do you want to use this?');
    expect(active(el)).toBe($(el, 'h2'));
    button(el, "Continue with my device's own tools").click();
    expect(heading(el)).toContain('full name');
  });

  it('keeps an access question in step with the helpers', async () => {
    const el = await mount(flow, {}, { prefs: null });
    pick($(el, '.op-helpers input[value=largerText]'));
    button(el, 'Continue with these helpers').click();
    next(el);
    expect($(el, 'input[value=larger-text]').checked).toBe(true);
    pick($(el, 'input[value=simple-words]'));
    $(el, 'input[value=simple-words]').dispatchEvent(new Event('change'));
    expect(savedPrefs().simple).toBe(true);
  });
});

// ---- the "all off" rule --------------------------------------------------------

describe('with every helper off', () => {
  it('shows no Listen or mic buttons and never speaks or listens', async () => {
    const speech = fakeSpeech();
    const voice = fakeVoice('Hana');
    setSpeechProvider(speech);
    setVoiceProvider(voice);
    const el = await mount(flow);
    next(el);
    next(el);
    await tick();
    expect($(el, '.op-listen')).toBeNull();
    expect($(el, '.op-mic')).toBeNull();
    expect($(el, 'svg')).toBeNull(); // icons only in simple words mode
    expect(speech.speak).not.toHaveBeenCalled();
    expect(voice.listen).not.toHaveBeenCalled();
    expect(heading(el)).toBe('What is your full name?');
  });
});

// ---- 2. simple words -------------------------------------------------------------

describe('simple words mode', () => {
  it('uses simple text, shows the decorative icon and short errors', async () => {
    const el = await mount(flow, {}, { prefs: { chosen: true, simple: true } });
    expect(heading(el)).toBe('Hello');
    next(el);
    button(el, 'Skip').click(); // simple "Skip this question"
    expect(heading(el)).toContain('Your name');
    const svg = $(el, 'h2 svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    next(el);
    expect($(el, '.op-error').textContent).toContain('Please write an answer.');
  });

  it('has simple Amharic interface text', async () => {
    const el = await mount(flow, { lang: 'am' }, { prefs: { chosen: true, simple: true } });
    expect($(el, '.op-root').getAttribute('lang')).toBe('am');
    expect(button(el, 'ቀጣይ')).toBeTruthy();
    // The question file has no Amharic yet, so its text is marked as English.
    expect($(el, 'h2 span[lang=en]').textContent).toBe('Hello');
    button(el, 'ቀጣይ').click();
    button(el, 'ዝለል').click();
    button(el, 'ቀጣይ').click();
    expect($(el, '.op-error').textContent).toContain('እባክዎ መልስ ይጻፉ።');
  });

  it('uses simple review strings', async () => {
    localStorage.setItem('openpath:helpers', JSON.stringify({ flowVersion: '1', step: 'review', answers: { name: 'Hana', lang: 'am' } }));
    const el = await mount(flow, {}, { prefs: { chosen: true, simple: true } });
    const edits = $$(el, '.op-review-action button').map((b) => b.textContent);
    expect(edits).toContain('Change Your name');
    expect(button(el, 'Send')).toBeTruthy();
    expect($$(el, '.op-review-item dt').map((d) => d.textContent)).toContain('Which language?');
  });
});

// ---- 3. read-aloud ----------------------------------------------------------------

describe('read-aloud', () => {
  const on = { chosen: true, readAloud: true };

  it('is hidden when no provider can speak this language', async () => {
    setSpeechProvider(fakeSpeech(false));
    const el = await mount(flow, {}, { prefs: on });
    expect($(el, '.op-listen')).toBeNull();
  });

  it('does not speak on page load, but reads each step once when the learner moves to it', async () => {
    const speech = fakeSpeech();
    setSpeechProvider(speech);
    const el = await mount(flow, {}, { prefs: on });
    await tick();
    expect(speech.speak).not.toHaveBeenCalled();
    expect(button(el, 'Listen')).toBeTruthy();
    next(el);
    await tick();
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.speak.mock.calls[0][0]).toBe('What helps you? Choices: Larger text, Simpler words, Screen reader');
  });

  it('Listen reads the question, hint and options, with the audio file for this language', async () => {
    const speech = fakeSpeech();
    setSpeechProvider(speech);
    localStorage.setItem('openpath:helpers', JSON.stringify({ flowVersion: '1', step: 'name', answers: {} }));
    const el = await mount(flow, {}, { prefs: on });
    button(el, 'Listen').click();
    await tick();
    const [text, lang, opts] = speech.speak.mock.calls[0];
    expect(text).toContain('What is your full name?');
    expect(text).toContain('Full name');
    expect(lang).toBe('en');
    expect(opts).toEqual({ audioUrl: '/audio/name.mp3' });
    expect(button(el, 'Stop')).toBeTruthy(); // label changes while reading
    button(el, 'Stop').click();
    expect(speech.stop).toHaveBeenCalled();
    await tick();
    expect(button(el, 'Listen')).toBeTruthy();
  });

  it('Escape stops speech, and speech stops on every step change', async () => {
    const speech = fakeSpeech();
    setSpeechProvider(speech);
    const el = await mount(flow, {}, { prefs: on });
    button(el, 'Listen').click();
    await tick();
    $(el, '.op-root').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(speech.stop).toHaveBeenCalledTimes(1);
    button(el, 'Listen').click();
    await tick();
    next(el);
    expect(speech.stop).toHaveBeenCalledTimes(2);
  });
});

// ---- 4. voice input -----------------------------------------------------------------

describe('voice input', () => {
  // The element imports the voice code on first use; load it once up front so
  // each test can wait a fixed couple of ticks.
  beforeAll(() => import('../src/voice.js'));
  const on = (extra = {}) => ({ chosen: true, voice: true, ...extra });
  const at = (step) => localStorage.setItem('openpath:helpers', JSON.stringify({ flowVersion: '1', step, answers: {} }));

  it('is hidden when the browser cannot do it, and on questions without voice: true', async () => {
    at('name');
    let el = await mount(flow, {}, { prefs: on() });
    expect($(el, '.op-mic')).toBeNull(); // jsdom has no SpeechRecognition
    el.remove();
    setVoiceProvider(fakeVoice('x'));
    at('note');
    el = await mount(flow, {}, { prefs: on({ voiceConsent: 'allow' }) });
    expect($(el, '.op-mic')).toBeNull();
  });

  it('asks for consent first; "No, I will type" is remembered and hides the mic', async () => {
    const voice = fakeVoice('Hana');
    setVoiceProvider(voice);
    at('name');
    const el = await mount(flow, {}, { prefs: on() });
    const mic = button(el, 'Speak your answer');
    expect(mic.hasAttribute('aria-pressed')).toBe(false);
    mic.click();
    expect(active(el).textContent).toBe("Your voice is sent over the internet to your browser's speech service (Google, if you use Chrome) to turn it into text. Allow?");
    expect($(el, '.op-consent').getAttribute('role')).toBe('group');
    button(el, 'No, I will type').click();
    expect(savedPrefs().voiceConsent).toBe('deny');
    expect($(el, '.op-mic')).toBeNull();
    expect(active(el)).toBe($(el, 'input'));
    expect(voice.listen).not.toHaveBeenCalled();
  });

  it('after Allow: listens, fills the field, announces and focuses it, and does not move on', async () => {
    const voice = fakeVoice('Hana Tesfaye');
    setVoiceProvider(voice);
    at('name');
    const el = await mount(flow, {}, { prefs: on() });
    button(el, 'Speak your answer').click();
    button(el, 'Allow').click();
    expect(savedPrefs().voiceConsent).toBe('allow');
    await tick();
    await tick();
    expect(voice.listen.mock.calls[0][0]).toBe('en');
    expect($(el, 'input').value).toBe('Hana Tesfaye');
    expect(active(el)).toBe($(el, 'input'));
    expect($(el, '.op-voice-status').textContent).toBe('You said: Hana Tesfaye. Edit it or press Next.');
    await wait();
    expect($(el, '[aria-live]').textContent).toBe('You said: Hana Tesfaye. Edit it or press Next.');
    expect(heading(el)).toContain('full name'); // never auto-advances
    expect(JSON.parse(localStorage.getItem('openpath:helpers')).answers.name).toBe('Hana Tesfaye');
  });

  it('says "Stop listening" while listening (no aria-pressed), and announces it', async () => {
    let finish;
    setVoiceProvider({ isAvailable: () => true, listen: () => new Promise((r) => (finish = r)), stop: vi.fn() });
    at('name');
    const el = await mount(flow, {}, { prefs: on({ voiceConsent: 'allow' }) });
    button(el, 'Speak your answer').click();
    await tick();
    const mic = $(el, '.op-mic');
    expect(mic.textContent).toBe('Stop listening');
    expect(mic.hasAttribute('aria-pressed')).toBe(false);
    await wait();
    expect($(el, '[aria-live]').textContent).toBe('Listening');
    finish('Hana');
    await tick();
    expect(mic.textContent).toBe('Speak your answer');
  });

  it('matches spoken words to an option, and says so when nothing matches', async () => {
    setVoiceProvider(fakeVoice('Amharic please'));
    at('lang');
    let el = await mount(flow, {}, { prefs: on({ voiceConsent: 'allow' }) });
    button(el, 'Speak your answer').click();
    await tick();
    await tick();
    expect($(el, 'input[value=am]').checked).toBe(true);
    expect(active(el)).toBe($(el, 'input[value=am]'));
    expect($(el, '.op-voice-status').textContent).toBe('You said: Amharic please. Chosen: Amharic. Change it or press Next.');
    el.remove();

    resetProviders();
    setVoiceProvider(fakeVoice('banana'));
    localStorage.removeItem('openpath:helpers');
    at('lang');
    el = await mount(flow, {}, { prefs: on({ voiceConsent: 'allow' }) });
    button(el, 'Speak your answer').click();
    await tick();
    await tick();
    expect($$(el, 'input[type=radio]').some((r) => r.checked)).toBe(false);
    expect($(el, '.op-voice-status').textContent).toContain('That does not match an answer');
  });

  it.each([
    ['permission', 'The microphone is blocked'],
    ['no_speech', 'I did not hear anything'],
    ['offline', 'needs an internet connection'],
  ])('explains the %s error clearly', async (code, text) => {
    setVoiceProvider(fakeVoice(voiceError(code)));
    at('name');
    const el = await mount(flow, {}, { prefs: on({ voiceConsent: 'allow' }) });
    button(el, 'Speak your answer').click();
    await tick();
    await tick();
    expect($(el, '.op-voice-status').textContent).toContain(text);
    expect($(el, '.op-mic').textContent).toBe('Speak your answer');
    expect($(el, 'input')).not.toBeNull(); // typing still works
  });

  it('Escape stops listening and announces "Stopped"', async () => {
    const stop = vi.fn();
    setVoiceProvider({ isAvailable: () => true, listen: () => new Promise(() => {}), stop });
    at('name');
    const el = await mount(flow, {}, { prefs: on({ voiceConsent: 'allow' }) });
    button(el, 'Speak your answer').click();
    await tick();
    $(el, '.op-root').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(stop).toHaveBeenCalled();
    await wait();
    expect($(el, '[aria-live]').textContent).toBe('Stopped');
  });
});

describe('voice consent text', () => {
  it.each([
    ['en', false, "Your voice is sent over the internet to your browser's speech service (Google, if you use Chrome) to turn it into text. Allow?"],
    ['en', true, 'Your voice goes over the internet to a speech service (Google, if you use Chrome) to make text. Is that OK?'],
    ['am', false, 'ድምፅዎ ወደ ጽሑፍ እንዲቀየር በኢንተርኔት ወደ አሳሽዎ የንግግር አገልግሎት ይላካል (Chromeን ከተጠቀሙ ወደ Google)። ይፈቅዳሉ?'],
    ['am', true, 'ድምፅዎ ጽሑፍ እንዲሆን በኢንተርኔት ወደ የንግግር አገልግሎት ይሄዳል (Chromeን ከተጠቀሙ Google)። ይስማማሉ?'],
  ])('lang=%s simple=%s says it goes over the internet and names Google', async (lang, simple, text) => {
    setVoiceProvider(fakeVoice('x'));
    localStorage.setItem('openpath:helpers', JSON.stringify({ flowVersion: '1', step: 'name', answers: {} }));
    const el = await mount(flow, { lang }, { prefs: { chosen: true, voice: true, simple } });
    $(el, '.op-mic').click();
    expect($(el, '.op-consent-text').textContent).toBe(text);
  });
});
