// Answers kept on this device so the learner doesn't type them twice
// (WCAG 3.3.7 Redundant Entry). Only answers to questions marked
// "reuse": true are kept, after the learner has sent the form, and the done
// screen says so with a "Forget them" button. Another flow's question with
// "prefillFrom": "<flowId>.<questionId>" starts with that answer.

export const PROFILE_KEY = 'openpath:profile';

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadProfile(store = storage()) {
  try {
    const saved = JSON.parse(store?.getItem(PROFILE_KEY) ?? 'null');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

export function saveProfile(entries, store = storage()) {
  try {
    store?.setItem(PROFILE_KEY, JSON.stringify({ ...loadProfile(store), ...entries }));
    return true;
  } catch {
    return false;
  }
}

export function forgetProfile(store = storage()) {
  try {
    store?.removeItem(PROFILE_KEY);
  } catch {
    /* ignore */
  }
}

/** An earlier answer for "<flowId>.<questionId>": kept after sending, or still in progress. */
export function earlierAnswer(source, store = storage()) {
  const [flowId, questionId] = source.split('.');
  const kept = loadProfile(store)[source];
  if (kept !== undefined) return kept;
  try {
    return JSON.parse(store?.getItem(`openpath:${flowId}`) ?? 'null')?.answers?.[questionId];
  } catch {
    return undefined;
  }
}
