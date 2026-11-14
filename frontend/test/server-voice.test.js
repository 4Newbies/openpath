// Server speech-to-text as a voice provider: which provider a language gets,
// the recorder, and the form with a fake API and a fake MediaRecorder.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../lang/en.json';
import am from '../lang/am.json';
import { canRecord, resetProviders, serverLang, setVoiceProvider, speechServerFrom, voiceKind } from '../src/providers.js';
import { createServerVoice, encodeWav, toWav } from '../src/voice.js';
import { $, active, heading, langFile, wait } from './helpers.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** A fake microphone and MediaRecorder. stop() delivers `chunks`. */
function fakeMedia({ error, chunks = [new Blob(['opus-bytes'], { type: 'audio/webm' })] } = {}) {
  const tracks = [{ stop: vi.fn() }];
  const recorders = [];
  class MediaRecorder {
    static isTypeSupported = (t) => t === 'audio/webm;codecs=opus';
    constructor(stream, opts) {
      this.mimeType = opts?.mimeType ?? '';
      this.state = 'inactive';
      recorders.push(this);
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      setTimeout(() => {
        for (const data of chunks) this.ondataavailable?.({ data });
        this.onstop?.();
      }, 0);
    }
  }
  const getUserMedia = vi.fn(async () => {
    if (error) throw Object.assign(new Error(error), { name: error });
    return { getTracks: () => tracks };
  });
  const win = { MediaRecorder, navigator: { onLine: true, mediaDevices: { getUserMedia } }, setTimeout, clearTimeout };
  return { win, tracks, recorders, getUserMedia };
}

const fakeApi = (reply = { text: ' Hana Tesfaye ' }) => ({
  transcribe: vi.fn(async () => {
    if (reply instanceof Error) throw reply;
    return reply;
  }),
});

afterEach(() => resetProviders());

// ---- choosing a provider per language -------------------------------------------

describe('voice provider per language', () => {
  const server = { api: {}, label: 'Addis Scribe', languages: ['am'], maxSeconds: 30 };
  const recorder = { MediaRecorder: class {}, navigator: { mediaDevices: { getUserMedia() {} } } };
  const recogniser = { webkitSpeechRecognition: class {} };

  it('uses the server when it transcribes the language, else the browser, else none', () => {
    expect(voiceKind('am', server, { ...recorder, ...recogniser })).toBe('server');
    expect(voiceKind('am-ET', server, recorder)).toBe('server');
    expect(voiceKind('en', server, { ...recorder, ...recogniser })).toBe('browser');
    expect(voiceKind('en', server, recorder)).toBeNull();
    expect(voiceKind('am', null, recorder)).toBeNull();
    // The server is no use if this browser can't record.
    expect(voiceKind('am', server, recogniser)).toBe('browser');
    expect(voiceKind('am', server, {})).toBeNull();
  });

  it('a provider registered by the host page always wins', () => {
    setVoiceProvider({ isAvailable: () => true, listen: async () => 'x', stop() {} });
    expect(voiceKind('am', server, {})).toBe('host');
  });

  it('checks the capabilities the server sends', () => {
    const api = {};
    expect(speechServerFrom({ label: 'Addis Scribe', languages: ['am', 'not a code', 7], maxSeconds: 30 }, api)).toEqual({ api, label: 'Addis Scribe', languages: ['am'], maxSeconds: 30 });
    expect(speechServerFrom({ label: null, languages: [] }, api)).toBeNull(); // SPEECH_PROVIDER=none
    expect(speechServerFrom({ label: '', languages: ['am'] }, api)).toBeNull(); // nobody to name in the consent
    expect(speechServerFrom({ label: 'X', languages: ['am'], maxSeconds: 600 }, api).maxSeconds).toBe(30);
    expect(serverLang('am-ET', { languages: ['am'] })).toBe('am');
    expect(canRecord({})).toBe(false);
  });
});

// ---- the recorder -------------------------------------------------------------------

describe('createServerVoice', () => {
  it('records until stop(), then sends the clip and resolves with the text', async () => {
    const m = fakeMedia();
    const api = fakeApi();
    const onRecorded = vi.fn();
    const voice = createServerVoice({ api, win: m.win });
    const heard = voice.listen('am', { onRecorded });
    await tick();
    expect(m.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(m.recorders[0].state).toBe('recording');
    expect(api.transcribe).not.toHaveBeenCalled();
    voice.stop();
    expect(await heard).toBe('Hana Tesfaye');
    expect(onRecorded).toHaveBeenCalledOnce();
    expect(m.tracks[0].stop).toHaveBeenCalled(); // microphone released
    const [audio, lang] = api.transcribe.mock.calls[0];
    expect(lang).toBe('am');
    expect(audio.type).toBe('audio/webm'); // could not convert to WAV here: sent as recorded
    expect(audio.size).toBe('opus-bytes'.length);
  });

  it('stops by itself after maxSeconds', async () => {
    const m = fakeMedia();
    const api = fakeApi({ text: 'long answer' });
    const voice = createServerVoice({ api, win: m.win, maxSeconds: 0.02 });
    expect(await voice.listen('en')).toBe('long answer');
  });

  it('cancel() throws the recording away: nothing is sent', async () => {
    const m = fakeMedia();
    const api = fakeApi();
    const voice = createServerVoice({ api, win: m.win });
    const heard = voice.listen('am');
    await tick();
    voice.cancel();
    await expect(heard).rejects.toMatchObject({ code: 'aborted' });
    expect(api.transcribe).not.toHaveBeenCalled();
    expect(m.tracks[0].stop).toHaveBeenCalled();
  });

  it.each([
    ['NotAllowedError', 'permission'],
    ['NotFoundError', 'no_microphone'],
    ['AbortError', 'failed'],
  ])('a microphone %s becomes %s', async (error, code) => {
    const voice = createServerVoice({ api: fakeApi(), win: fakeMedia({ error }).win });
    await expect(voice.listen('am')).rejects.toMatchObject({ code });
  });

  it.each([
    [Object.assign(new Error('x'), { status: 0 }), 'offline'],
    [Object.assign(new Error('x'), { status: 429 }), 'busy'],
    [Object.assign(new Error('x'), { status: 502 }), 'failed'],
  ])('a server error becomes a voice error (%#)', async (err, code) => {
    const m = fakeMedia();
    const voice = createServerVoice({ api: fakeApi(err), win: m.win });
    const heard = voice.listen('am');
    await tick();
    voice.stop();
    await expect(heard).rejects.toMatchObject({ code });
  });

  it('empty text or an empty recording means nothing was heard', async () => {
    let m = fakeMedia();
    let voice = createServerVoice({ api: fakeApi({ text: '  ' }), win: m.win });
    let heard = voice.listen('am');
    await tick();
    voice.stop();
    await expect(heard).rejects.toMatchObject({ code: 'no_speech' });

    m = fakeMedia({ chunks: [] });
    const api = fakeApi();
    voice = createServerVoice({ api, win: m.win });
    heard = voice.listen('am');
    await tick();
    voice.stop();
    await expect(heard).rejects.toMatchObject({ code: 'no_speech' });
    expect(api.transcribe).not.toHaveBeenCalled();
  });

  it('converts to 16 kHz mono WAV when the browser can decode the recording', async () => {
    const m = fakeMedia();
    const left = new Float32Array([0.5, -0.5, 1]);
    const right = new Float32Array([0.5, 0.5, -1]);
    m.win.OfflineAudioContext = class {
      decodeAudioData() {
        return Promise.resolve({ length: 3, numberOfChannels: 2, getChannelData: (c) => (c ? right : left) });
      }
    };
    const api = fakeApi();
    const voice = createServerVoice({ api, win: m.win });
    const heard = voice.listen('am');
    await tick();
    voice.stop();
    await heard;
    const [audio] = api.transcribe.mock.calls[0];
    expect(audio.type).toBe('audio/wav');
    const view = new DataView(await audio.arrayBuffer());
    expect(view.getUint32(24, true)).toBe(16000); // sample rate
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect([0, 1, 2].map((i) => view.getInt16(44 + i * 2, true))).toEqual([Math.trunc(0.5 * 0x7fff), 0, 0]);
  });

  it('encodeWav writes a valid header', async () => {
    const wav = encodeWav(new Float32Array(16000), 16000);
    const bytes = new Uint8Array(await wav.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
    expect(bytes.length).toBe(44 + 32000);
    await expect(toWav(wav, { win: {} })).rejects.toThrow(); // no OfflineAudioContext: caller sends as is
  });
});

// ---- the form with a fake API ------------------------------------------------------

const flow = {
  version: '1',
  flowId: 'sv',
  title: { en: 'Voice', am: 'ድምፅ' },
  questions: [
    { id: 'name', type: 'text', required: true, voice: true, label: { en: 'What is your full name?', am: 'ሙሉ ስምዎ ማን ነው?' } },
    { id: 'city', type: 'text', label: { en: 'Your city', am: 'ከተማዎ' } },
  ],
};

let media;
let requests;
let capabilities;
let transcribeReply;

function serve() {
  const json = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
  return vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/q.json')) return json(structuredClone(flow));
    const pack = langFile(u);
    if (pack) return pack;
    if (!u.startsWith('http://api.test/v1/')) throw new Error(`unexpected fetch ${u}`);
    const path = u.slice('http://api.test/v1'.length);
    requests.push({ method: init.method ?? 'GET', path, headers: init.headers, body: init.body });
    if (path === '/speech/capabilities') return json(capabilities);
    if (path.startsWith('/speech/transcribe')) return transcribeReply;
    if (path === '/health') return json({ ok: true });
    return json({});
  });
}

async function mountAt(lang, prefs) {
  localStorage.setItem('openpath:prefs', JSON.stringify(prefs));
  localStorage.setItem('openpath:sv', JSON.stringify({ flowVersion: '1', step: 'name', answers: {} }));
  globalThis.fetch = serve();
  const el = document.createElement('openpath-flow');
  el.setAttribute('questions', '/q.json');
  el.setAttribute('api', 'http://api.test');
  el.setAttribute('lang', lang);
  document.body.append(el);
  await el.ready;
  return el;
}

const on = (extra = {}) => ({ chosen: true, voice: true, ...extra });
const savedPrefs = () => JSON.parse(localStorage.getItem('openpath:prefs'));
const transcribeCalls = () => requests.filter((r) => r.path.startsWith('/speech/transcribe'));
const settle = async () => {
  for (let i = 0; i < 6; i++) await tick();
};

describe('the form with server speech-to-text', () => {
  beforeAll(() => import('../src/voice.js'));
  beforeEach(() => {
    localStorage.clear();
    requests = [];
    capabilities = { label: 'Fake Speech Ltd', languages: ['en', 'am'], formats: ['audio/webm', 'audio/wav'], maxSeconds: 30, maxBytes: 1048576 };
    transcribeReply = { ok: true, status: 200, json: async () => ({ text: 'Hana Tesfaye' }) };
    media = fakeMedia();
    globalThis.MediaRecorder = media.win.MediaRecorder;
    Object.defineProperty(navigator, 'mediaDevices', { value: media.win.navigator.mediaDevices, configurable: true });
  });
  afterEach(() => {
    document.body.textContent = '';
    delete globalThis.MediaRecorder;
    delete navigator.mediaDevices;
    delete globalThis.webkitSpeechRecognition;
    vi.restoreAllMocks();
  });

  it('asks consent naming the provider the server returned, then records, sends, and fills the field', async () => {
    const el = await mountAt('en', on());
    expect(requests.some((r) => r.path === '/speech/capabilities')).toBe(true);
    $(el, '.op-mic').click();
    const consent = en.strings.consentServer.replace('{provider}', 'Fake Speech Ltd');
    expect($(el, '.op-consent-text').textContent).toBe(consent);
    expect(active(el)).toBe($(el, '.op-consent-text'));
    [...el.shadowRoot.querySelectorAll('button')].find((b) => b.textContent === 'Allow').click();
    expect(savedPrefs()).toMatchObject({ voiceConsent: 'allow', voiceConsentFor: 'server:Fake Speech Ltd' });
    await settle();
    expect(media.getUserMedia).toHaveBeenCalled();
    expect($(el, '.op-mic').textContent).toBe('Stop listening');
    await wait();
    expect($(el, '[aria-live]').textContent).toBe(en.strings.listeningServer);
    expect(transcribeCalls()).toHaveLength(0); // nothing is sent while recording

    $(el, '.op-mic').click(); // "Stop listening": send what was said
    await settle();
    const [call] = transcribeCalls();
    expect(call).toMatchObject({ method: 'POST', path: '/speech/transcribe?lang=en', headers: { 'Content-Type': 'audio/webm' } });
    expect(call.body).toBeInstanceOf(Blob);
    expect($(el, 'input').value).toBe('Hana Tesfaye');
    expect(active(el)).toBe($(el, 'input'));
    expect($(el, '.op-voice-status').textContent).toBe('You said: Hana Tesfaye. Edit it or press Next.');
    expect(heading(el)).toBe('What is your full name?'); // never moves on by itself
    expect($(el, '.op-mic').textContent).toBe('Speak your answer');
  });

  it('names the provider in Amharic too, and sends lang=am', async () => {
    capabilities = { ...capabilities, label: 'Addis Scribe', languages: ['am'] };
    const el = await mountAt('am', on());
    $(el, '.op-mic').click();
    expect($(el, '.op-consent-text').textContent).toBe(am.strings.consentServer.replace('{provider}', 'Addis Scribe'));
    $(el, '.op-consent .op-primary').click();
    await settle();
    $(el, '.op-mic').click();
    await settle();
    expect(transcribeCalls()[0].path).toBe('/speech/transcribe?lang=am');
  });

  it('a "yes" for the browser service is not a "yes" for the server provider', async () => {
    const el = await mountAt('en', on({ voiceConsent: 'allow' })); // given earlier, for Google
    $(el, '.op-mic').click();
    expect($(el, '.op-consent-text').textContent).toContain('Fake Speech Ltd');
    expect(media.getUserMedia).not.toHaveBeenCalled();
  });

  it('uses the browser recogniser for a language the server does not do, and hides the mic when there is none', async () => {
    capabilities = { ...capabilities, languages: ['am'] };
    let el = await mountAt('en', on());
    expect($(el, '.op-mic')).toBeNull(); // no SpeechRecognition in jsdom
    el.remove();

    globalThis.webkitSpeechRecognition = class {};
    el = await mountAt('en', on());
    $(el, '.op-mic').click();
    expect($(el, '.op-consent-text').textContent).toBe(en.strings.consentText); // names the browser's service
  });

  it('Escape while recording throws the recording away: nothing is sent', async () => {
    const el = await mountAt('en', on({ voiceConsent: 'allow', voiceConsentFor: 'server:Fake Speech Ltd' }));
    $(el, '.op-mic').click();
    await settle();
    expect(media.recorders[0].state).toBe('recording');
    $(el, '.op-root').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(transcribeCalls()).toHaveLength(0);
    expect(media.tracks[0].stop).toHaveBeenCalled();
    expect($(el, 'input').value).toBe('');
  });

  it('says so clearly when the server is busy, and typing still works', async () => {
    transcribeReply = { ok: false, status: 429, json: async () => ({ error: { code: 'rate_limited', message: 'x' } }) };
    const el = await mountAt('en', on({ voiceConsent: 'allow', voiceConsentFor: 'server:Fake Speech Ltd' }));
    $(el, '.op-mic').click();
    await settle();
    $(el, '.op-mic').click();
    await settle();
    expect($(el, '.op-voice-status').textContent).toBe(en.strings.voice_busy);
    expect($(el, 'input').value).toBe('');
    expect($(el, '.op-mic').textContent).toBe('Speak your answer');
  });

  it('offers voice on the first screen when only the server can do it', async () => {
    localStorage.setItem('openpath:prefs', 'null');
    globalThis.fetch = serve();
    const el = document.createElement('openpath-flow');
    el.setAttribute('questions', '/q.json');
    el.setAttribute('api', 'http://api.test');
    document.body.append(el);
    await el.ready;
    const labels = [...el.shadowRoot.querySelectorAll('.op-helpers label')].map((l) => l.textContent);
    expect(labels).toContain(en.strings.helperVoice);
  });
});
