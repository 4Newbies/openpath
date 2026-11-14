// Voice input. Imported only when a learner who chose "I want to speak my
// answers" needs it (a separate chunk in an ES build; inlined into the
// single-file IIFE build, but nothing runs until then).
//
// Provider interface (hosts can register their own, see providers.js):
//   listen(lang) -> Promise<string>  (rejects with an Error whose .code is
//                   permission | no_speech | offline | no_microphone | aborted | failed)
//   stop()        -> stop listening; listen() then settles
//   isAvailable() -> boolean

const LOCALES = { en: 'en-US', am: 'am-ET' };

export function voiceError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

const ERROR_CODES = {
  'not-allowed': 'permission',
  'service-not-allowed': 'permission',
  'no-speech': 'no_speech',
  network: 'offline',
  'audio-capture': 'no_microphone',
  aborted: 'aborted',
};

export function createBrowserVoice(win = globalThis) {
  const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
  let active = null;

  return {
    isAvailable: () => Boolean(Recognition),

    listen(lang) {
      return new Promise((resolve, reject) => {
        if (!Recognition) return reject(voiceError('failed'));
        if (win.navigator && win.navigator.onLine === false) return reject(voiceError('offline'));
        const rec = new Recognition();
        rec.lang = LOCALES[lang] || lang;
        rec.interimResults = false;
        rec.continuous = false;
        rec.maxAlternatives = 1;
        let text = '';
        let error = null;
        const me = { rec, stoppedByUser: false };
        active = me;
        rec.onresult = (e) => {
          text = Array.from(e.results)
            .map((r) => r[0]?.transcript ?? '')
            .join(' ')
            .trim();
        };
        rec.onerror = (e) => {
          error = ERROR_CODES[e.error] || 'failed';
        };
        rec.onend = () => {
          if (active === me) active = null;
          if (text) resolve(text);
          else if (me.stoppedByUser) reject(voiceError('aborted'));
          else reject(voiceError(error || 'no_speech'));
        };
        try {
          rec.start();
        } catch {
          active = null;
          reject(voiceError('failed'));
        }
      });
    },

    stop() {
      if (!active) return;
      active.stoppedByUser = true;
      active.rec.stop();
    },
  };
}

// ---- matching spoken words to options ---------------------------------------

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const YES = ['yes', 'yeah', 'yep', 'yup', 'sure', 'correct', 'አዎ', 'አዎን', 'እሺ'];
const NO = ['no', 'nope', 'not', 'አይ', 'አይደለም', 'የለም'];

function candidates(option) {
  const texts = [option.label?.en, option.label?.am, option.simple?.en, option.simple?.am, option.value.replace(/[-_]/g, ' ')];
  const out = new Set();
  for (const t of texts) {
    if (!t) continue;
    out.add(norm(t));
    // "Amharic (አማርኛ)" also matches "Amharic" and "አማርኛ" on their own.
    for (const part of String(t).split(/[()]/)) if (norm(part).length > 1) out.add(norm(part));
  }
  return [...out].filter(Boolean);
}

function score(said, option) {
  const padded = ` ${said} `;
  let best = 0;
  for (const c of candidates(option)) {
    if (said === c) best = Math.max(best, 3);
    else if (padded.includes(` ${c} `)) best = Math.max(best, 2 + c.length / 1000);
    else if (said.length >= 3 && c.includes(said)) best = Math.max(best, 1);
  }
  return best;
}

/**
 * Turn what the learner said into an answer for a choice question.
 * single -> option value, multi -> [values], yesno -> true/false;
 * undefined when nothing matches (the answer is left empty).
 */
export function matchSpoken(question, transcript) {
  const said = norm(transcript);
  if (!said) return undefined;
  if (question.type === 'yesno') {
    const words = said.split(' ');
    const yes = words.some((w) => YES.includes(w));
    const no = words.some((w) => NO.includes(w));
    return yes === no ? undefined : yes;
  }
  const scored = (question.options ?? []).map((o) => ({ value: o.value, s: score(said, o) })).filter((x) => x.s > 0);
  if (question.type === 'multi') {
    const strong = scored.filter((x) => x.s >= 2);
    const picked = strong.length ? strong : scored.slice().sort((a, b) => b.s - a.s).slice(0, 1);
    const values = question.options.map((o) => o.value).filter((v) => picked.some((x) => x.value === v));
    return values.length ? values : undefined;
  }
  scored.sort((a, b) => b.s - a.s);
  if (!scored.length || (scored[1] && scored[1].s === scored[0].s)) return undefined; // nothing, or a tie
  return scored[0].value;
}
