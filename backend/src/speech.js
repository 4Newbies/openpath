// Server-side speech-to-text (optional). SPEECH_PROVIDER picks one:
//   none        (default) the API offers no speech; the form uses the browser's own recogniser
//   addis       Addis Scribe (Amharic)
//   azure       Microsoft Azure Speech, short-audio REST API
//   selfhosted  your own OpenAI-compatible Whisper server (POST /v1/audio/transcriptions)
//
// Keys come only from the environment. Audio is held in memory for one
// request, forwarded to the provider, and dropped: it is never written to
// disk, the database or a log, and neither is the text that comes back.
//
// Provider interface (tests use a fake one):
//   { id, label, languages: string[], accepts: string[],
//     transcribe({ audio: Buffer, mime, lang, signal }) -> Promise<{ text }> }
//   transcribe() rejects with a SpeechError on failure.

export const MAX_SECONDS = 30;
export const AUDIO_TYPES = ['audio/wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];

export class SpeechError extends Error {
  /** code: provider_error | provider_rejected | timeout. status: the provider's HTTP status, if any. */
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// Speech locales for the form's language codes; override with "code=locale"
// in SPEECH_LANGUAGES (e.g. "ar=ar-SA").
const LOCALES = { en: 'en-US', am: 'am-ET', ar: 'ar-EG', om: 'om-ET', ti: 'ti-ET', so: 'so-SO', sw: 'sw-KE', fr: 'fr-FR' };

/** "am,en,ar=ar-SA" -> { am: 'am-ET', en: 'en-US', ar: 'ar-SA' } */
export function parseLanguages(raw, fallback) {
  const out = {};
  for (const part of String(raw || fallback).split(',')) {
    const [code, locale] = part.split('=').map((s) => s.trim());
    if (!code) continue;
    if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(code)) throw new Error(`SPEECH_LANGUAGES: "${code}" is not a language code`);
    out[code] = locale || LOCALES[code] || code;
  }
  return out;
}

const DEFAULT_LANGUAGES = { addis: 'am', azure: 'am,en,ar', selfhosted: 'am,en,ar' };
const DEFAULT_LABELS = { addis: 'Addis Scribe', azure: 'Microsoft Azure Speech' };

/** Speech settings from the environment (part of loadConfig). Throws on a broken setup. */
export function loadSpeechConfig(env = process.env) {
  const provider = (env.SPEECH_PROVIDER || 'none').trim().toLowerCase();
  if (!['none', 'addis', 'azure', 'selfhosted'].includes(provider)) {
    throw new Error('SPEECH_PROVIDER must be none, addis, azure or selfhosted');
  }
  const int = (name, fallback) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative whole number`);
    return n;
  };
  const config = {
    provider,
    // 30 s of 16 kHz mono 16-bit WAV is 960 KB; compressed audio is far smaller.
    maxBytes: int('SPEECH_MAX_BYTES', 1024 * 1024),
    timeoutMs: int('SPEECH_TIMEOUT_MS', 15000),
    rateLimitMax: int('SPEECH_RATE_LIMIT_MAX', 300),
  };
  if (provider === 'none') return config;

  const need = (name) => {
    const v = (env[name] || '').trim();
    if (!v) throw new Error(`SPEECH_PROVIDER=${provider} needs ${name}`);
    return v;
  };
  config.languages = parseLanguages(env.SPEECH_LANGUAGES, DEFAULT_LANGUAGES[provider]);
  if (provider === 'addis') {
    config.url = need('ADDIS_SCRIBE_API_URL');
    config.key = need('ADDIS_SCRIBE_API_KEY');
  } else if (provider === 'azure') {
    config.key = need('AZURE_SPEECH_KEY');
    config.region = need('AZURE_SPEECH_REGION');
    if (!/^[a-z0-9]+$/.test(config.region)) throw new Error('AZURE_SPEECH_REGION must be a region name such as eastus');
  } else {
    config.url = need('SPEECH_SELFHOSTED_URL');
    config.key = (env.SPEECH_SELFHOSTED_API_KEY || '').trim();
    config.model = (env.SPEECH_SELFHOSTED_MODEL || 'whisper-1').trim();
  }
  if (config.url) {
    let u;
    try {
      u = new URL(config.url);
    } catch {
      throw new Error(`The URL for SPEECH_PROVIDER=${provider} is not a valid URL`);
    }
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error(`The URL for SPEECH_PROVIDER=${provider} must be http(s)`);
  }
  // The name learners see in the consent question: where their voice goes.
  // A self-hosted server is named by its host unless a label is set.
  config.label = (env.SPEECH_PROVIDER_LABEL || '').trim() || DEFAULT_LABELS[provider] || new URL(config.url).host;
  return config;
}

async function postAudio(fetchImpl, url, init, signal) {
  let res;
  try {
    res = await fetchImpl(url, { ...init, signal, redirect: 'error' });
  } catch (e) {
    throw new SpeechError(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'provider_error');
  }
  // 4xx from the provider usually means the audio or language was refused.
  if (!res.ok) throw new SpeechError(res.status >= 400 && res.status < 500 && ![401, 403, 429].includes(res.status) ? 'provider_rejected' : 'provider_error', res.status);
  try {
    return await res.json();
  } catch {
    throw new SpeechError('provider_error', res.status);
  }
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** Build the provider from loadSpeechConfig(); null when SPEECH_PROVIDER=none. */
export function createSpeechProvider(config, { fetchImpl = globalThis.fetch } = {}) {
  if (!config || config.provider === 'none') return null;
  const base = { id: config.provider, label: config.label, languages: Object.keys(config.languages) };
  const locale = (lang) => config.languages[lang];

  if (config.provider === 'addis') {
    // As in server/src/services/voice/addisScribeSTT.js: the raw audio as the
    // body, the key as a Bearer token, the language model in a header.
    return {
      ...base,
      accepts: AUDIO_TYPES,
      async transcribe({ audio, mime, lang, signal }) {
        const body = await postAudio(
          fetchImpl,
          config.url,
          { method: 'POST', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': mime, 'X-Language-Model': locale(lang) }, body: audio },
          signal,
        );
        return { text: text(body?.transcription ?? body?.text) };
      },
    };
  }

  if (config.provider === 'azure') {
    // Same key header and regional host as the Azure TTS call in server/, but
    // the speech-to-text short-audio endpoint (WAV/PCM or Ogg/Opus, up to 60 s).
    const CONTENT_TYPES = { 'audio/wav': 'audio/wav; codecs=audio/pcm; samplerate=16000', 'audio/ogg': 'audio/ogg; codecs=opus' };
    return {
      ...base,
      accepts: Object.keys(CONTENT_TYPES),
      async transcribe({ audio, mime, lang, signal }) {
        const url = `https://${config.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(locale(lang))}&format=simple&profanity=raw`;
        const body = await postAudio(
          fetchImpl,
          url,
          { method: 'POST', headers: { 'Ocp-Apim-Subscription-Key': config.key, 'Content-Type': CONTENT_TYPES[mime], Accept: 'application/json' }, body: audio },
          signal,
        );
        // NoMatch / InitialSilenceTimeout: nothing was heard.
        return { text: body?.RecognitionStatus === 'Success' ? text(body.DisplayText) : '' };
      },
    };
  }

  // Self-hosted, OpenAI-compatible (faster-whisper-server, whisper.cpp server, LocalAI, vLLM ...).
  const endpoint = config.url.replace(/\/+$/, '').replace(/\/v1(\/audio\/transcriptions)?$/, '') + '/v1/audio/transcriptions';
  const EXT = { 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3' };
  return {
    ...base,
    accepts: AUDIO_TYPES,
    async transcribe({ audio, mime, lang, signal }) {
      const form = new FormData();
      form.append('file', new Blob([audio], { type: mime }), `clip.${EXT[mime]}`);
      form.append('model', config.model);
      // Whisper takes ISO 639-1 codes ("am", "en"), not locales.
      form.append('language', lang.split('-')[0]);
      form.append('response_format', 'json');
      const headers = config.key ? { Authorization: `Bearer ${config.key}` } : {};
      const body = await postAudio(fetchImpl, endpoint, { method: 'POST', headers, body: form }, signal);
      return { text: text(body?.text) };
    },
  };
}

/** Seconds of audio in a PCM WAV file, or null when it isn't one we can read. */
export function wavSeconds(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;
  let byteRate = 0;
  for (let at = 12; at + 8 <= buf.length; ) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'fmt ' && at + 20 <= buf.length) byteRate = buf.readUInt32LE(at + 16);
    if (id === 'data') return byteRate > 0 ? Math.min(size, buf.length - at - 8) / byteRate : null;
    at += 8 + size + (size % 2);
  }
  return null;
}
