// Server speech-to-text: the endpoints with a fake provider, and the real
// providers' requests with a fake fetch (no network, no keys).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { loadFlows } from '../src/flows.js';
import { createSpeechProvider, loadSpeechConfig, parseLanguages, SpeechError, wavSeconds } from '../src/speech.js';
import { createMemoryStore } from '../src/store/memory.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const flows = loadFlows(path.resolve(here, '../../frontend/public/questions'));

/** A 16 kHz mono 16-bit PCM WAV of `seconds` of silence. */
function wav(seconds) {
  const rate = 16000;
  const data = Math.round(seconds * rate) * 2;
  const b = Buffer.alloc(44 + data);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + data, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(data, 40);
  return b;
}

function fakeProvider(result = { text: ' ሰላም ' }) {
  return {
    id: 'fake',
    label: 'Fake Speech Ltd',
    languages: ['am', 'en'],
    accepts: ['audio/wav', 'audio/webm'],
    transcribe: vi.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

function appWith(speech, { env = {}, log } = {}) {
  const config = { ...loadConfig(env), corsOrigins: ['http://allowed.test'], rateLimitMax: 10_000 };
  const logs = log ?? { error: vi.fn(), warn: vi.fn(), log: vi.fn() };
  return { app: createApp({ store: createMemoryStore(), flows, config, log: logs, speech }), logs };
}

const send = (app, body, { lang = 'am', type = 'audio/wav' } = {}) =>
  request(app).post(`/v1/speech/transcribe${lang === null ? '' : `?lang=${lang}`}`).set('Content-Type', type).send(body);

describe('GET /v1/speech/capabilities', () => {
  it('says nothing is available by default (SPEECH_PROVIDER=none)', async () => {
    const { app } = appWith(undefined);
    const res = await request(app).get('/v1/speech/capabilities').expect(200);
    expect(res.body).toEqual({ label: null, languages: [], formats: [], maxSeconds: 30, maxBytes: 1048576 });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('names the provider and its languages', async () => {
    const { app } = appWith(fakeProvider());
    const res = await request(app).get('/v1/speech/capabilities').expect(200);
    expect(res.body).toMatchObject({ label: 'Fake Speech Ltd', languages: ['am', 'en'], formats: ['audio/wav', 'audio/webm'], maxSeconds: 30 });
  });
});

describe('POST /v1/speech/transcribe', () => {
  it('returns { text } from the provider, with the audio and language passed through', async () => {
    const speech = fakeProvider();
    const { app } = appWith(speech);
    const clip = wav(2);
    const res = await send(app, clip).expect(200);
    expect(res.body).toEqual({ text: 'ሰላም' });
    const [{ audio, mime, lang, signal }] = speech.transcribe.mock.calls[0];
    expect(Buffer.compare(audio, clip)).toBe(0);
    expect(mime).toBe('audio/wav');
    expect(lang).toBe('am');
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('accepts a codec parameter in the content type', async () => {
    const speech = fakeProvider({ text: 'hello' });
    const { app } = appWith(speech);
    await send(app, Buffer.from('webm-bytes'), { lang: 'en', type: 'audio/webm;codecs=opus' }).expect(200, { text: 'hello' });
    expect(speech.transcribe.mock.calls[0][0].mime).toBe('audio/webm');
  });

  it('is off (404 speech_off) when no provider is set', async () => {
    const { app } = appWith(null);
    const res = await send(app, wav(1)).expect(404);
    expect(res.body.error.code).toBe('speech_off');
  });

  it.each([
    ['no language', null, 'audio/wav', 400, 'invalid_lang'],
    ['a bad language code', 'French', 'audio/wav', 400, 'invalid_lang'],
    ['a language the provider cannot do', 'ar', 'audio/wav', 400, 'unsupported_language'],
    ['a format the provider does not take', 'am', 'audio/ogg', 415, 'unsupported_media_type'],
    ['something that is not audio', 'am', 'text/plain', 415, 'unsupported_media_type'],
  ])('rejects %s', async (_, lang, type, status, code) => {
    const speech = fakeProvider();
    const { app } = appWith(speech);
    const res = await send(app, wav(1), { lang, type }).expect(status);
    expect(res.body.error.code).toBe(code);
    expect(speech.transcribe).not.toHaveBeenCalled();
  });

  it('rejects JSON instead of audio', async () => {
    const { app } = appWith(fakeProvider());
    const res = await request(app).post('/v1/speech/transcribe?lang=am').send({ audio: 'x' }).expect(415);
    expect(res.body.error.code).toBe('unsupported_media_type');
  });

  it('rejects an empty body and a broken WAV', async () => {
    const { app } = appWith(fakeProvider());
    expect((await send(app, Buffer.alloc(0)).expect(400)).body.error.code).toBe('empty_audio');
    expect((await send(app, Buffer.from('not a wav file')).expect(400)).body.error.code).toBe('invalid_audio');
  });

  it('rejects clips over 30 seconds and bodies over the size limit', async () => {
    const speech = fakeProvider();
    const { app } = appWith(speech, { env: { SPEECH_MAX_BYTES: String(2 * 1024 * 1024) } });
    await send(app, wav(30)).expect(200);
    expect((await send(app, wav(31)).expect(413)).body.error.code).toBe('audio_too_long');

    const small = appWith(fakeProvider(), { env: { SPEECH_MAX_BYTES: '50000' } });
    expect((await send(small.app, wav(2)).expect(413)).body.error.code).toBe('payload_too_large');
  });

  it.each([
    ['timeout', 504, 'speech_timeout'],
    ['provider_rejected', 422, 'speech_rejected'],
    ['provider_error', 502, 'speech_failed'],
  ])('maps a provider %s to %i %s', async (code, status, apiCode) => {
    const { app } = appWith(fakeProvider(new SpeechError(code, 500)));
    expect((await send(app, wav(1)).expect(status)).body.error.code).toBe(apiCode);
  });

  it('never logs the audio or the text, even when the provider fails', async () => {
    const secret = 'Hana Tesfaye 0911234567';
    const clip = wav(1);
    clip.write('SECRETAUDIO', 44);
    const failing = fakeProvider(Object.assign(new SpeechError('provider_error', 500), { detail: secret }));
    const all = [];
    const log = Object.fromEntries(['error', 'warn', 'log', 'info'].map((k) => [k, (...a) => all.push(a.map(String).join(' '))]));
    const spies = ['log', 'warn', 'error', 'info'].map((k) => vi.spyOn(console, k).mockImplementation((...a) => all.push(a.map(String).join(' '))));
    try {
      const ok = appWith(fakeProvider({ text: secret }), { log });
      await send(ok.app, clip).expect(200);
      const bad = appWith(failing, { log });
      await send(bad.app, clip).expect(502);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    const logged = all.join('\n');
    expect(logged).toContain('speech provider "fake" failed: provider_error (HTTP 500)');
    expect(logged).not.toContain('Hana');
    expect(logged).not.toContain('SECRETAUDIO');
    expect(logged).not.toContain('RIFF');
  });

  it('has its own rate limit per IP address', async () => {
    const { app } = appWith(fakeProvider({ text: 'ok' }), { env: { SPEECH_RATE_LIMIT_MAX: '2' } });
    await send(app, wav(1)).expect(200);
    await send(app, wav(1)).expect(200);
    const res = await send(app, wav(1)).expect(429);
    expect(res.body.error.code).toBe('rate_limited');
    // The rest of the API is not affected.
    await request(app).get('/v1/health').expect(200);
  });
});

// ---- configuration ----------------------------------------------------------

describe('SPEECH_PROVIDER configuration', () => {
  it('defaults to none', () => {
    expect(loadSpeechConfig({}).provider).toBe('none');
    expect(createSpeechProvider(loadSpeechConfig({}))).toBeNull();
  });

  it.each([
    [{ SPEECH_PROVIDER: 'google' }, 'must be none, addis, azure or selfhosted'],
    [{ SPEECH_PROVIDER: 'addis', ADDIS_SCRIBE_API_URL: 'https://a.example' }, 'needs ADDIS_SCRIBE_API_KEY'],
    [{ SPEECH_PROVIDER: 'azure', AZURE_SPEECH_KEY: 'k' }, 'needs AZURE_SPEECH_REGION'],
    [{ SPEECH_PROVIDER: 'azure', AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'east us/x' }, 'must be a region name'],
    [{ SPEECH_PROVIDER: 'selfhosted' }, 'needs SPEECH_SELFHOSTED_URL'],
    [{ SPEECH_PROVIDER: 'selfhosted', SPEECH_SELFHOSTED_URL: 'file:///etc/passwd' }, 'must be http(s)'],
    [{ SPEECH_PROVIDER: 'selfhosted', SPEECH_SELFHOSTED_URL: 'http://w', SPEECH_LANGUAGES: 'Amharic' }, 'not a language code'],
  ])('refuses to start with a broken setup: %o', (env, message) => {
    expect(() => loadSpeechConfig(env)).toThrow(message);
  });

  it('labels: a fixed name for services, the host for a self-hosted server, or SPEECH_PROVIDER_LABEL', () => {
    expect(loadSpeechConfig({ SPEECH_PROVIDER: 'azure', AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'eastus' }).label).toBe('Microsoft Azure Speech');
    expect(loadSpeechConfig({ SPEECH_PROVIDER: 'selfhosted', SPEECH_SELFHOSTED_URL: 'https://stt.example.org:9000' }).label).toBe('stt.example.org:9000');
    expect(loadSpeechConfig({ SPEECH_PROVIDER: 'selfhosted', SPEECH_SELFHOSTED_URL: 'http://10.0.0.5', SPEECH_PROVIDER_LABEL: 'the ALX speech server' }).label).toBe('the ALX speech server');
  });

  it('parses SPEECH_LANGUAGES with optional locales', () => {
    expect(parseLanguages('am, en ,ar=ar-SA')).toEqual({ am: 'am-ET', en: 'en-US', ar: 'ar-SA' });
    expect(parseLanguages('', 'am')).toEqual({ am: 'am-ET' });
  });

  it('measures WAV length', () => {
    expect(wavSeconds(wav(2.5))).toBeCloseTo(2.5);
    expect(wavSeconds(Buffer.from('nope'))).toBeNull();
  });
});

// ---- the real providers' requests (fake fetch) --------------------------------

function fakeFetch(reply = { text: 'ok' }, status = 200) {
  return vi.fn(async () => ({ ok: status < 400, status, json: async () => reply }));
}
const clip = wav(1);

describe('providers', () => {
  it('addis: raw audio, Bearer key and language model header, as in server/', async () => {
    const fetchImpl = fakeFetch({ transcription: ' ሰላም ' });
    const p = createSpeechProvider(loadSpeechConfig({ SPEECH_PROVIDER: 'addis', ADDIS_SCRIBE_API_URL: 'https://addis.example/v1/transcribe', ADDIS_SCRIBE_API_KEY: 'k-addis' }), { fetchImpl });
    expect(p.languages).toEqual(['am']);
    expect(await p.transcribe({ audio: clip, mime: 'audio/wav', lang: 'am' })).toEqual({ text: 'ሰላም' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://addis.example/v1/transcribe');
    expect(init).toMatchObject({ method: 'POST', redirect: 'error', body: clip });
    expect(init.headers).toEqual({ Authorization: 'Bearer k-addis', 'Content-Type': 'audio/wav', 'X-Language-Model': 'am-ET' });
  });

  it('azure: short-audio REST endpoint for the region and locale', async () => {
    const fetchImpl = fakeFetch({ RecognitionStatus: 'Success', DisplayText: 'Hello.' });
    const p = createSpeechProvider(loadSpeechConfig({ SPEECH_PROVIDER: 'azure', AZURE_SPEECH_KEY: 'k-az', AZURE_SPEECH_REGION: 'westeurope' }), { fetchImpl });
    expect(p.accepts).toEqual(['audio/wav', 'audio/ogg']);
    expect(await p.transcribe({ audio: clip, mime: 'audio/wav', lang: 'en' })).toEqual({ text: 'Hello.' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://westeurope.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple&profanity=raw');
    expect(init.headers['Ocp-Apim-Subscription-Key']).toBe('k-az');
    expect(init.headers['Content-Type']).toBe('audio/wav; codecs=audio/pcm; samplerate=16000');
  });

  it('azure: nothing heard gives empty text', async () => {
    const p = createSpeechProvider(loadSpeechConfig({ SPEECH_PROVIDER: 'azure', AZURE_SPEECH_KEY: 'k', AZURE_SPEECH_REGION: 'eastus' }), {
      fetchImpl: fakeFetch({ RecognitionStatus: 'InitialSilenceTimeout' }),
    });
    expect(await p.transcribe({ audio: clip, mime: 'audio/wav', lang: 'am' })).toEqual({ text: '' });
  });

  it('selfhosted: OpenAI-compatible multipart upload with model and ISO language', async () => {
    const fetchImpl = fakeFetch({ text: 'selam' });
    const p = createSpeechProvider(
      loadSpeechConfig({ SPEECH_PROVIDER: 'selfhosted', SPEECH_SELFHOSTED_URL: 'http://whisper.local:8000/v1', SPEECH_SELFHOSTED_MODEL: 'large-v3', SPEECH_SELFHOSTED_API_KEY: 'k-self' }),
      { fetchImpl },
    );
    expect(await p.transcribe({ audio: clip, mime: 'audio/webm', lang: 'am' })).toEqual({ text: 'selam' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://whisper.local:8000/v1/audio/transcriptions');
    expect(init.headers).toEqual({ Authorization: 'Bearer k-self' });
    const form = init.body;
    expect(form.get('model')).toBe('large-v3');
    expect(form.get('language')).toBe('am');
    expect(form.get('file').name).toBe('clip.webm');
    expect(form.get('file').size).toBe(clip.length);
  });

  it('turns provider failures into SpeechErrors without the response body', async () => {
    const cfg = loadSpeechConfig({ SPEECH_PROVIDER: 'selfhosted', SPEECH_SELFHOSTED_URL: 'http://w' });
    const reject = (fetchImpl) => createSpeechProvider(cfg, { fetchImpl }).transcribe({ audio: clip, mime: 'audio/wav', lang: 'en' });
    await expect(reject(fakeFetch({ error: 'bad audio' }, 400))).rejects.toMatchObject({ code: 'provider_rejected', status: 400 });
    await expect(reject(fakeFetch({}, 401))).rejects.toMatchObject({ code: 'provider_error', status: 401 });
    await expect(reject(fakeFetch({}, 503))).rejects.toMatchObject({ code: 'provider_error', status: 503 });
    await expect(reject(vi.fn(async () => Promise.reject(Object.assign(new Error('t'), { name: 'TimeoutError' }))))).rejects.toMatchObject({ code: 'timeout' });
    await expect(reject(vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))))).rejects.toMatchObject({ code: 'provider_error' });
  });
});
