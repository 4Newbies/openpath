// Answers kept on this device so the learner doesn't type them twice
// (WCAG 3.3.7 Redundant Entry). Nothing is kept by default: many learners
// use a shared or public computer. After sending, the done screen asks
// whether to remember answers to questions marked "reuse": true (default:
// no), and Settings has "Forget my details". Another flow's question with
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

/** Remove only these "<flowId>.<questionId>" entries; forget everything when none are left. */
export function forgetEntries(keys, store = storage()) {
  const rest = loadProfile(store);
  for (const k of keys) delete rest[k];
  if (Object.keys(rest).length === 0) return forgetProfile(store);
  try {
    store?.setItem(PROFILE_KEY, JSON.stringify(rest));
  } catch {
    /* ignore */
  }
}

export function hasProfile(store = storage()) {
  return Object.keys(loadProfile(store)).length > 0;
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
