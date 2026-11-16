// Read-aloud and voice-input providers. Hosts can replace either one:
//   OpenPath.setSpeechProvider({ speak, stop, isAvailable })
//   OpenPath.setVoiceProvider({ listen, stop, isAvailable })
// Without a host voice provider, voice input uses the API's speech-to-text
// when the server offers the form's language, otherwise the browser's own
// recogniser, otherwise none (no mic button).
// Nothing here runs until a learner turns the matching helper on.

import { createBrowserSpeech } from './speech.js';

let speech = null;
let voice = null;

function check(provider, methods, name) {
  const missing = methods.filter((m) => typeof provider?.[m] !== 'function');
  if (missing.length) throw new TypeError(`[openpath] ${name} needs these functions: ${missing.join(', ')}`);
  return provider;
}

export function setSpeechProvider(provider) {
  speech = provider === null ? null : check(provider, ['speak', 'stop', 'isAvailable'], 'setSpeechProvider');
}

export function setVoiceProvider(provider) {
  voice = provider === null ? null : check(provider, ['listen', 'stop', 'isAvailable'], 'setVoiceProvider');
}

export function getSpeech() {
  return (speech ??= createBrowserSpeech());
}

/** Can this browser record audio to send to the server? */
export function canRecord(win = globalThis) {
  return Boolean(win.MediaRecorder && win.navigator?.mediaDevices?.getUserMedia);
}

/**
 * The API's speech capabilities (GET /v1/speech/capabilities) as
 * { api, label, languages, maxSeconds }, or null when it transcribes nothing.
 * The label names where the audio goes, for the consent question.
 */
export function speechServerFrom(caps, api) {
  const languages = Array.isArray(caps?.languages) ? caps.languages.filter((l) => typeof l === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(l)) : [];
  const label = typeof caps?.label === 'string' ? caps.label.trim().slice(0, 100) : '';
  if (!api || !languages.length || !label) return null;
  const maxSeconds = Number.isFinite(caps.maxSeconds) && caps.maxSeconds > 0 ? Math.min(30, caps.maxSeconds) : 30;
  return { api, label, languages, maxSeconds };
}

/** The language code the server transcribes for `lang` ("am-ET" -> "am"), or null. */
export function serverLang(lang, server) {
  const langs = Array.isArray(server?.languages) ? server.languages : [];
  if (!lang) return null;
  if (langs.includes(lang)) return lang;
  const base = lang.split('-')[0];
  return langs.includes(base) ? base : null;
}

/**
 * Which voice input to use for `lang`, cheaply (doesn't load the voice code):
 *   'host'    a provider the host page registered (always wins)
 *   'server'  the API transcribes this language (GET /v1/speech/capabilities)
 *   'browser' the browser's own SpeechRecognition
 *   null      none: the mic is hidden
 * `server` is { api, languages, label } or null.
 */
export function voiceKind(lang, server = null, win = globalThis) {
  if (voice) return voice.isAvailable(lang) ? 'host' : null;
  if (server?.api && serverLang(lang, server) && canRecord(win)) return 'server';
  if (win.SpeechRecognition || win.webkitSpeechRecognition) return 'browser';
  return null;
}

export function voiceAvailable(lang, server = null, win = globalThis) {
  return voiceKind(lang, server, win) !== null;
}

/** The voice code: loaded only when a learner who chose voice needs it. */
export const loadVoiceModule = () => import('./voice.js');

let browserVoice = null;

/** The voice provider for voiceKind(); the browser and server ones are created on first use. */
export async function getVoice(kind = 'browser', server = null) {
  if (voice) return voice;
  const mod = await loadVoiceModule();
  if (kind === 'server') return mod.createServerVoice({ api: server.api, maxSeconds: server.maxSeconds });
  return (browserVoice ??= mod.createBrowserVoice());
}

/** Tests only. */
export function resetProviders() {
  speech = null;
  voice = null;
  browserVoice = null;
}
