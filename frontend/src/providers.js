// Read-aloud and voice-input providers. Hosts can replace either one:
//   OpenPath.setSpeechProvider({ speak, stop, isAvailable })
//   OpenPath.setVoiceProvider({ listen, stop, isAvailable })
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

export function voiceAvailable() {
  return Boolean(voice?.isAvailable());
}

export async function getVoice() {
  return voice;
}

/** Tests only. */
export function resetProviders() {
  speech = null;
  voice = null;
}
