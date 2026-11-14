// The learner's helper choices. All helpers are OFF until the learner turns
// them on. Saved per website (not per question file), so the "How do you
// want to use this?" step is only shown once.

export const PREFS_KEY = 'openpath:prefs';
export const HELPERS = ['readAloud', 'voice', 'simple', 'largerText', 'highContrast'];

// Answers of an access question (setsPreference: "access") that switch a helper.
export const ACCESS_TO_HELPER = {
  'read-aloud': 'readAloud',
  'voice-input': 'voice',
  'simple-words': 'simple',
  'larger-text': 'largerText',
  'high-contrast': 'highContrast',
};

export function defaultPrefs() {
  return {
    chosen: false, // has the learner answered "How do you want to use this?"
    readAloud: false,
    voice: false,
    simple: false,
    largerText: false,
    highContrast: false,
    voiceConsent: null, // null = not asked yet, 'allow' or 'deny'
    lang: null, // language chosen in the switcher (only used when the host offers it)
  };
}

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadPrefs(store = storage()) {
  try {
    const saved = JSON.parse(store?.getItem(PREFS_KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return defaultPrefs();
    const out = defaultPrefs();
    for (const k of [...HELPERS, 'chosen']) out[k] = saved[k] === true;
    if (saved.voiceConsent === 'allow' || saved.voiceConsent === 'deny') out.voiceConsent = saved.voiceConsent;
    if (typeof saved.lang === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(saved.lang)) out.lang = saved.lang;
    return out;
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(prefs, store = storage()) {
  try {
    store?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* blocked or full: keep working in memory */
  }
}

/** Access-question answer values for the helpers that are on. */
export function helpersToAccess(prefs, question) {
  const allowed = new Set(question.options.map((o) => o.value));
  return Object.entries(ACCESS_TO_HELPER)
    .filter(([value, helper]) => prefs[helper] && allowed.has(value))
    .map(([value]) => value);
}
