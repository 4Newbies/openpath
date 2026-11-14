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

// ---- server speech-to-text ----------------------------------------------------
// Records a short clip with MediaRecorder and posts it to the API
// (POST /v1/speech/transcribe), which passes it to the provider the server
// names in GET /v1/speech/capabilities. Recording ends when the learner presses
// "Stop listening", or after maxSeconds. The clip is only kept in memory until
// it has been sent.

const MEDIA_ERRORS = {
  NotAllowedError: 'permission',
  SecurityError: 'permission',
  NotFoundError: 'no_microphone',
  OverconstrainedError: 'no_microphone',
};

// What MediaRecorder can make, in order of preference (Safari only does mp4).
const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];

/** 16-bit mono PCM WAV from samples in [-1, 1]. */
export function encodeWav(samples, rate) {
  const view = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const ascii = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}

/**
 * The recording as 16 kHz mono WAV, which every provider takes (Azure only
 * takes WAV or Ogg; Safari records mp4). Rejects when the browser can't decode
 * it; the caller then sends the recording as it is.
 */
export async function toWav(blob, { win = globalThis, rate = 16000, maxSeconds = 30 } = {}) {
  const Offline = win.OfflineAudioContext || win.webkitOfflineAudioContext;
  if (!Offline) throw new Error('no OfflineAudioContext');
  const ctx = new Offline(1, 1, rate); // decodeAudioData resamples to the context's rate
  const bytes = await blob.arrayBuffer();
  const decoded = await new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(bytes, resolve, reject); // older Safari: callbacks only
    p?.then?.(resolve, reject);
  });
  const length = Math.min(decoded.length, Math.round(rate * maxSeconds));
  const mono = new Float32Array(length);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i] / decoded.numberOfChannels;
  }
  return encodeWav(mono, rate);
}

/**
 * Voice provider that records in the browser and transcribes on the server.
 * listen(lang, { onRecorded }) -> Promise<string>; onRecorded() is called when
 * recording has ended and the clip is being sent. stop() ends recording and
 * sends what was said; cancel() throws it away without sending anything.
 */
export function createServerVoice({ api, win = globalThis, maxSeconds = 30 } = {}) {
  let active = null;
  const stopTracks = (stream) => stream?.getTracks?.().forEach((t) => t.stop());

  async function record(me, lang, onRecorded) {
    let stream;
    try {
      stream = await win.navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      throw voiceError(MEDIA_ERRORS[e?.name] ?? 'failed');
    }
    if (me.cancelled) {
      stopTracks(stream);
      throw voiceError('aborted');
    }

    const type = RECORDER_TYPES.find((t) => win.MediaRecorder.isTypeSupported?.(t));
    let chunks = [];
    let timer;
    try {
      const recorder = new win.MediaRecorder(stream, type ? { mimeType: type } : undefined);
      me.recorder = recorder;
      recorder.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
      const stopped = new Promise((resolve) => (recorder.onstop = resolve));
      recorder.start();
      timer = win.setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), maxSeconds * 1000);
      await stopped;
    } catch {
      throw voiceError('failed');
    } finally {
      win.clearTimeout(timer);
      stopTracks(stream); // the microphone light goes off as soon as recording ends
    }
    if (me.cancelled) {
      chunks = [];
      throw voiceError('aborted');
    }
    const mime = String(me.recorder.mimeType || type || chunks[0]?.type || 'audio/webm').split(';')[0];
    let audio = new Blob(chunks, { type: mime });
    chunks = [];
    if (!audio.size) {
      throw voiceError('no_speech');
    }
    onRecorded?.();
    try {
      audio = await toWav(audio, { win, maxSeconds });
    } catch {
      /* send the recording as it is */
    }
    if (me.cancelled) throw voiceError('aborted');

    me.controller = new AbortController();
    let reply;
    try {
      reply = await api.transcribe(audio, lang, { signal: me.controller.signal });
    } catch (e) {
      if (me.cancelled || e?.name === 'AbortError') throw voiceError('aborted');
      if (e?.status === 0) throw voiceError('offline');
      if (e?.status === 429) throw voiceError('busy');
      throw voiceError('failed');
    } finally {
      audio = null;
    }
    const text = String(reply?.text ?? '').trim();
    if (!text) throw voiceError('no_speech');
    return text;
  }

  return {
    isAvailable: () => Boolean(win.MediaRecorder && win.navigator?.mediaDevices?.getUserMedia),

    async listen(lang, { onRecorded } = {}) {
      if (win.navigator && win.navigator.onLine === false) throw voiceError('offline');
      const me = { cancelled: false, recorder: null, controller: null };
      active = me;
      try {
        return await record(me, lang, onRecorded);
      } finally {
        if (active === me) active = null;
      }
    },

    /** End recording; listen() then sends the clip and settles with the text. */
    stop() {
      if (active?.recorder?.state === 'recording') active.recorder.stop();
      else if (active && !active.recorder) this.cancel(); // still asking for the microphone
    },

    /** Throw the recording away: nothing is sent (or the upload is cancelled). */
    cancel() {
      if (!active) return;
      active.cancelled = true;
      if (active.recorder?.state === 'recording') active.recorder.stop();
      active.controller?.abort();
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


function candidates(option) {
  // Option text in every language the question file has, so an answer in
  // another language still matches.
  const texts = [...Object.values(option.label ?? {}), ...Object.values(option.simple ?? {}), option.value.replace(/[-_]/g, ' ')];
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
 * `words` holds the yes/no words from the language packs (voiceYes, voiceNo).
 */
export function matchSpoken(question, transcript, words = {}) {
  const said = norm(transcript);
  if (!said) return undefined;
  if (question.type === 'yesno') {
    const YES = (words.yes ?? []).map(norm);
    const NO = (words.no ?? []).map(norm);
    const yes = said.split(' ').some((w) => YES.includes(w));
    const no = said.split(' ').some((w) => NO.includes(w));
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

// ---- matching a spoken day, month or year (date lists) ---------------------------

// Amharic letters that sound the same are written in several ways (ኅዳር, ህዳር,
// ሕዳር; ሠ/ሰ; ዐ/አ; ፀ/ጸ). Fold them to one spelling before comparing.
const ETHIOPIC_SAME_SOUND = [
  [0x1210, 0x1200], // ሐ -> ሀ
  [0x1280, 0x1200], // ኀ -> ሀ
  [0x1220, 0x1230], // ሠ -> ሰ
  [0x12d0, 0x12a0], // ዐ -> አ
  [0x1340, 0x1338], // ፀ -> ጸ
];
export function foldEthiopic(s) {
  return String(s).replace(/[\u1200-\u137f]/g, (ch) => {
    const c = ch.codePointAt(0);
    for (const [from, to] of ETHIOPIC_SAME_SOUND) if (c >= from && c < from + 8) return String.fromCodePoint(to + (c - from));
    return ch;
  });
}

/** Arabic-Indic and Ethiopic digits as 0-9 (Ethiopic ፩-፱ and ፲-፴ are added up, e.g. ፳፭ = 25). */
export function westernDigits(s) {
  return String(s)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u1369-\u1374]+/g, (run) => {
      let n = 0;
      for (const ch of run) {
        const c = ch.charCodeAt(0);
        n += c <= 0x1371 ? c - 0x1368 : (c - 0x1371) * 10;
      }
      return ` ${n} `;
    });
}

const dateNorm = (s) => norm(foldEthiopic(westernDigits(s)));

/**
 * What was said for one date list -> a number, or undefined.
 *   min, max:     the allowed range (day 1-30, month 1-13, year 1892-2019 ...)
 *   months:       for the month list, [[names...], ...] per month (current
 *                 language, English and Amharic spellings)
 *   numberWords:  ["one", "two", ...] for 1, 2, ... in the current language
 * Digits win ("5", "1993", "፭"), then month names, then number words
 * (the longest match, so "twenty one" is 21, not 1).
 */
export function matchDatePart(transcript, { min, max, months = [], numberWords = [] }) {
  const said = dateNorm(transcript);
  if (!said) return undefined;
  const inRange = (n) => Number.isInteger(n) && n >= min && n <= max;
  for (const d of said.match(/\d+/g) ?? []) if (inRange(Number(d))) return Number(d);
  const padded = ` ${said} `;
  let best;
  months.forEach((names, i) => {
    for (const name of names) {
      const n = dateNorm(name);
      if (n && (said === n || padded.includes(` ${n} `)) && (!best || n.length > best.len)) best = { value: i + 1, len: n.length };
    }
  });
  if (best && inRange(best.value)) return best.value;
  best = undefined;
  numberWords.forEach((word, i) => {
    const n = dateNorm(word);
    if (n && padded.includes(` ${n} `) && inRange(i + 1) && (!best || n.length > best.len)) best = { value: i + 1, len: n.length };
  });
  return best?.value;
}
