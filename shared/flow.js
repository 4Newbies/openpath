// Shared rules for OpenPath question files and answers.
// Used unchanged by the browser tag (frontend/) and the API (backend/), so
// both sides agree on what a valid file and a valid answer are.
// Plain ES module, no dependencies (shared/ethiopian.js is ours).

import { ethiopianToIso, isValidEthiopianDate } from './ethiopian.js';

export const QUESTION_TYPES = ['text', 'phone', 'date', 'single', 'multi', 'yesno', 'info'];
export const CALENDARS = ['gregorian', 'ethiopian'];

/**
 * Phone settings per country ("country" on a phone question, default ET).
 * To add a country, add one entry: the calling code, the trunk prefix used
 * in local numbers, the national number pattern (without trunk prefix) and
 * an example in local format for the error message.
 * "country": "any" keeps the old free format (7 to 15 digits, stored as typed).
 */
export const PHONE_COUNTRIES = {
  // Ethiopian mobile numbers: 09... (Ethio telecom) and 07... (Safaricom).
  ET: { callingCode: '251', trunk: '0', national: /^[79]\d{8}$/, example: '0911 234 567', groups: [3, 3, 3] },
};
export const DEFAULT_PHONE_COUNTRY = 'ET';
export const phoneCountry = (q) => q.country ?? DEFAULT_PHONE_COUNTRY;

/**
 * A phone number in any accepted form -> international format, or null.
 * For the country (ET): 0911 234 567, 911 234 567, +251 911 234 567,
 * 00251..., 251... -> "+251911234567" (must be a valid number there).
 * Any other country: + and 8 to 15 digits -> "+447700900123".
 */
export function normalizePhone(value, country = DEFAULT_PHONE_COUNTRY) {
  const c = PHONE_COUNTRIES[country];
  if (!c || typeof value !== 'string') return null;
  const compact = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  const cc = c.callingCode;
  let national;
  if (compact.startsWith('+')) {
    if (!compact.startsWith(`+${cc}`)) return /^\+\d{8,15}$/.test(compact) ? compact : null;
    national = compact.slice(cc.length + 1);
  } else if (compact.startsWith(`00${cc}`)) national = compact.slice(cc.length + 2);
  else if (compact.startsWith(cc) && compact.length > cc.length + 8) national = compact.slice(cc.length);
  else national = compact;
  if (c.trunk && national.startsWith(c.trunk)) national = national.slice(c.trunk.length); // 0911... or +251 0911...
  return c.national.test(national) ? `+${cc}${national}` : null;
}

/** "+251911234567" -> "+251 911 234 567" for reading back to the learner. */
export function formatPhone(e164, country = DEFAULT_PHONE_COUNTRY) {
  const c = PHONE_COUNTRIES[country];
  const prefix = c && `+${c.callingCode}`;
  if (!c || typeof e164 !== 'string' || !e164.startsWith(prefix)) return e164;
  let rest = e164.slice(prefix.length);
  const parts = [];
  for (const n of c.groups) {
    parts.push(rest.slice(0, n));
    rest = rest.slice(n);
  }
  if (rest) parts.push(rest);
  return [prefix, ...parts.filter(Boolean)].join(' ');
}

const ID_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
// The form's own screens use these step names, so questions can't.
const RESERVED_IDS = ['setup', 'review', 'done', 'queued'];
const FLOW_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OPTION_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
// Language codes in question files and sessions: "en", "am", "ar", "pt-BR" ...
export const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const DEFAULT_MAX_LENGTH = 500;
const QUESTION_KEYS = new Set([
  'id', 'type', 'label', 'simple', 'hint', 'icon', 'required', 'voice', 'options',
  'showIf', 'autocomplete', 'maxLength', 'multiline', 'private', 'setsPreference', 'audio', 'calendar', 'country',
  'prefillFrom', 'reuse',
]);
// "prefillFrom": "<flowId>.<questionId>" (or a list of them, tried in order).
const PREFILL_RE = /^[a-z0-9][a-z0-9-]{0,63}\.[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
// Audio file URLs: http(s) or a relative path; never javascript:, data: or other schemes.
const AUDIO_URL_RE = /^(https?:\/\/\S+|(?![a-zA-Z][a-zA-Z0-9+.-]*:)(?!\/\/)\S+)$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkLocalized(value, path, errors, { required = false } = {}) {
  if (value === undefined) {
    if (required) errors.push(`${path} is missing`);
    return;
  }
  if (!isObj(value)) {
    errors.push(`${path} must be an object like { "en": "..." }`);
    return;
  }
  if (typeof value.en !== 'string' || value.en.trim() === '') {
    errors.push(`${path}.en must be a non-empty string`);
  }
  for (const [k, v] of Object.entries(value)) {
    if (!LANG_RE.test(k)) errors.push(`${path}.${k} is not a language code (use codes like en, am, ar)`);
    else if (typeof v !== 'string' || v.trim() === '') errors.push(`${path}.${k} must be a non-empty string`);
  }
}

/**
 * Check a parsed question file. Returns a list of readable problems; an
 * empty list means the file is valid. Mirrors shared/questions.schema.json
 * plus cross-field rules a schema can't express (unique ids, showIf order).
 */
export function validateFlow(flow) {
  const errors = [];
  if (!isObj(flow)) return ['The question file must be a JSON object'];

  if (typeof flow.version !== 'string' || flow.version === '') errors.push('version must be a non-empty string');
  if (typeof flow.flowId !== 'string' || !FLOW_ID_RE.test(flow.flowId)) {
    errors.push('flowId must be lowercase letters, digits and dashes');
  }
  checkLocalized(flow.title, 'title', errors, { required: true });
  for (const k of Object.keys(flow)) {
    if (!['$schema', 'version', 'flowId', 'title', 'questions'].includes(k)) errors.push(`unknown top-level field "${k}"`);
  }

  if (!Array.isArray(flow.questions) || flow.questions.length === 0) {
    errors.push('questions must be a non-empty array');
    return errors;
  }

  const seen = new Map(); // id -> question, in order
  flow.questions.forEach((q, i) => {
    const p = `questions[${i}]`;
    if (!isObj(q)) {
      errors.push(`${p} must be an object`);
      return;
    }
    const where = typeof q.id === 'string' ? `${p} ("${q.id}")` : p;
    for (const k of Object.keys(q)) if (!QUESTION_KEYS.has(k)) errors.push(`${where} has unknown field "${k}"`);

    if (typeof q.id !== 'string' || !ID_RE.test(q.id)) errors.push(`${p}.id must start with a letter and use only letters, digits and _`);
    else if (RESERVED_IDS.includes(q.id)) errors.push(`${where} id "${q.id}" is the name of one of the form's own screens; choose another`);
    else if (seen.has(q.id)) errors.push(`${where} id is used twice`);

    if (!QUESTION_TYPES.includes(q.type)) errors.push(`${where}.type must be one of ${QUESTION_TYPES.join(', ')}`);
    checkLocalized(q.label, `${where}.label`, errors, { required: true });
    checkLocalized(q.simple, `${where}.simple`, errors);
    checkLocalized(q.hint, `${where}.hint`, errors);

    if (q.prefillFrom !== undefined) {
      const list = [].concat(q.prefillFrom);
      if (!list.length || list.some((p) => typeof p !== 'string' || !PREFILL_RE.test(p))) {
        errors.push(`${where}.prefillFrom must be "flowId.questionId" or a list of them`);
      }
      if (q.private) errors.push(`${where} is private and cannot be prefilled`);
    }
    if (q.reuse === true && q.private) errors.push(`${where} is private and cannot be kept for reuse`);
    for (const b of ['required', 'voice', 'multiline', 'private', 'reuse']) {
      if (q[b] !== undefined && typeof q[b] !== 'boolean') errors.push(`${where}.${b} must be true or false`);
    }
    if (q.type === 'info' && q.required !== undefined) errors.push(`${where} is an info screen and cannot be required`);
    if (q.icon !== undefined && (typeof q.icon !== 'string' || !/^[a-z0-9-]{1,32}$/.test(q.icon))) {
      errors.push(`${where}.icon must be a short lowercase name`);
    }
    if (q.autocomplete !== undefined && (typeof q.autocomplete !== 'string' || !/^[a-z0-9 -]{1,64}$/.test(q.autocomplete))) {
      errors.push(`${where}.autocomplete must be an HTML autocomplete token`);
    }
    if (q.audio !== undefined) {
      if (!isObj(q.audio) || Object.keys(q.audio).length === 0) {
        errors.push(`${where}.audio must be an object like { "en": "audio/q1.mp3" }`);
      } else {
        for (const [k, v] of Object.entries(q.audio)) {
          if (!LANG_RE.test(k)) errors.push(`${where}.audio.${k} is not a language code (use codes like en, am, ar)`);
          else if (typeof v !== 'string' || !AUDIO_URL_RE.test(v)) errors.push(`${where}.audio.${k} must be an http(s) URL or a relative path`);
        }
      }
    }
    if (q.maxLength !== undefined && !(Number.isInteger(q.maxLength) && q.maxLength >= 1 && q.maxLength <= 2000)) {
      errors.push(`${where}.maxLength must be a whole number from 1 to 2000`);
    }
    if (q.multiline !== undefined && q.type !== 'text') errors.push(`${where}.multiline only applies to text questions`);
    if (q.country !== undefined) {
      if (q.type !== 'phone') errors.push(`${where}.country only applies to phone questions`);
      else if (q.country !== 'any' && !PHONE_COUNTRIES[q.country]) {
        errors.push(`${where}.country must be one of ${[...Object.keys(PHONE_COUNTRIES), 'any'].join(', ')}`);
      }
    }
    if (q.calendar !== undefined) {
      if (q.type !== 'date') errors.push(`${where}.calendar only applies to date questions`);
      else if (!CALENDARS.includes(q.calendar)) errors.push(`${where}.calendar must be "gregorian" or "ethiopian"`);
    }
    if (q.setsPreference !== undefined && !(q.setsPreference === 'access' && q.type === 'multi')) {
      errors.push(`${where}.setsPreference must be "access" on a multi question`);
    }

    const needsOptions = q.type === 'single' || q.type === 'multi';
    if (needsOptions) {
      if (!Array.isArray(q.options) || q.options.length === 0) {
        errors.push(`${where} needs a non-empty options list`);
      } else {
        const values = new Set();
        q.options.forEach((o, j) => {
          const op = `${where}.options[${j}]`;
          if (!isObj(o)) return errors.push(`${op} must be an object`);
          for (const k of Object.keys(o)) if (!['value', 'label', 'simple', 'hint'].includes(k)) errors.push(`${op} has unknown field "${k}"`);
          if (typeof o.value !== 'string' || !OPTION_RE.test(o.value)) errors.push(`${op}.value must be lowercase letters, digits, _ or -`);
          else if (values.has(o.value)) errors.push(`${op}.value "${o.value}" is used twice`);
          else values.add(o.value);
          checkLocalized(o.label, `${op}.label`, errors, { required: true });
          checkLocalized(o.simple, `${op}.simple`, errors);
          checkLocalized(o.hint, `${op}.hint`, errors);
        });
      }
    } else if (q.options !== undefined) {
      errors.push(`${where} is a ${q.type} question and cannot have options`);
    }

    if (q.showIf !== undefined) {
      const s = q.showIf;
      if (!isObj(s) || typeof s.id !== 'string' || !['string', 'boolean'].includes(typeof s.equals)) {
        errors.push(`${where}.showIf must be { "id": "...", "equals": "..." }`);
      } else if (!seen.has(s.id)) {
        errors.push(`${where}.showIf refers to "${s.id}", which must be an earlier question`);
      } else {
        const target = seen.get(s.id);
        if (target.type === 'info') errors.push(`${where}.showIf cannot depend on an info screen`);
        if (Array.isArray(target.options) && typeof s.equals === 'string' && !target.options.some((o) => o.value === s.equals)) {
          errors.push(`${where}.showIf.equals "${s.equals}" is not an option of "${s.id}"`);
        }
      }
    }

    if (typeof q.id === 'string' && !seen.has(q.id)) seen.set(q.id, q);
  });

  return errors;
}

/** True when the value counts as "no answer". */
export function isEmpty(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** Does this question show, given the answers so far? */
export function isVisible(question, answers, flow) {
  const s = question.showIf;
  if (!s) return true;
  // A question hidden because its parent is hidden must stay hidden.
  if (flow) {
    const parent = flow.questions.find((q) => q.id === s.id);
    if (parent && !isVisible(parent, answers, flow)) return false;
  }
  const v = answers?.[s.id];
  if (Array.isArray(v)) return v.includes(s.equals);
  return v === s.equals;
}

/** Questions that currently show, in order. */
export function visibleQuestions(flow, answers) {
  return flow.questions.filter((q) => isVisible(q, answers, flow));
}

/**
 * Date answers are stored as the ISO Gregorian date plus the calendar the
 * learner used (the question's "calendar" is only the starting choice; the
 * learner can switch):
 *   { "date": "2001-03-27", "calendar": "gregorian" }
 *   { "date": "2001-03-27", "calendar": "ethiopian", "ethiopian": { "year": 1993, "month": 7, "day": 18 } }
 * For Ethiopian dates the ISO date and the Ethiopian date must agree.
 * A plain "2001-03-27" is still accepted as a Gregorian date.
 */
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The calendar a date answer was given in. */
export function answerCalendar(value) {
  if (!isPlainObject(value)) return 'gregorian';
  return value.calendar ?? (value.ethiopian ? 'ethiopian' : 'gregorian');
}

function dateAnswerError(value, today) {
  if (typeof value === 'string') return dateError(value.trim(), today);
  if (!isPlainObject(value)) return 'invalid_type';
  const calendar = answerCalendar(value);
  if (!CALENDARS.includes(calendar)) return 'invalid_type';
  if (calendar === 'gregorian') return typeof value.date === 'string' ? dateError(value.date.trim(), today) : 'invalid_date';
  if (!isValidEthiopianDate(value.ethiopian)) return 'invalid_date';
  if (typeof value.date !== 'string' || value.date !== ethiopianToIso(value.ethiopian)) return 'calendar_mismatch';
  return dateError(value.date, today);
}

/** True for a date answer object with nothing filled in yet (maybe only a calendar choice). */
function emptyDateObject(value) {
  if (!isPlainObject(value)) return false;
  const e = value.ethiopian;
  const blank = (v) => v === undefined || v === null || v === '';
  return (blank(value.date) || String(value.date).trim() === '') && (!e || ['year', 'month', 'day'].every((k) => blank(e[k])));
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Today as "YYYY-MM-DD" in this device's own time zone. */
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * The latest date that is "today" somewhere on Earth (UTC+14). The API uses
 * it: it can't know the learner's time zone, so it only rejects dates that
 * are in the future everywhere.
 */
export function latestToday(now = new Date()) {
  return new Date(now.getTime() + 14 * 3600 * 1000).toISOString().slice(0, 10);
}

function dateError(value, today = localToday()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return 'invalid_date';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return 'invalid_date';
  if (y < 1900) return 'invalid_date';
  if (value > today) return 'future_date'; // ISO dates compare as text
  return null;
}

/**
 * Check one answer. Returns null when fine, otherwise an error code:
 * required, invalid_type, too_long, invalid_phone, invalid_date,
 * future_date, calendar_mismatch, invalid_option, not_answerable.
 * Required-ness is only checked when `checkRequired` is true (on Next and
 * on submit), so progress can be saved half-done. `today` ("YYYY-MM-DD",
 * default: today in this device's time zone) is the latest allowed date.
 */
export function validateAnswer(question, value, { checkRequired = true, today = localToday() } = {}) {
  if (question.type === 'info') return value === undefined || value === null ? null : 'not_answerable';
  if (isEmpty(value) || (question.type === 'date' && emptyDateObject(value))) {
    return checkRequired && question.required ? 'required' : null;
  }

  switch (question.type) {
    case 'text': {
      if (typeof value !== 'string') return 'invalid_type';
      if (value.trim().length > (question.maxLength ?? DEFAULT_MAX_LENGTH)) return 'too_long';
      return null;
    }
    case 'phone': {
      if (typeof value !== 'string') return 'invalid_type';
      if (phoneCountry(question) !== 'any') return normalizePhone(value, phoneCountry(question)) ? null : 'invalid_phone';
      if (!/^\+?[0-9\s().-]+$/.test(value.trim())) return 'invalid_phone';
      const digits = value.replace(/\D/g, '').length;
      return digits >= 7 && digits <= 15 ? null : 'invalid_phone';
    }
    case 'date':
      return dateAnswerError(value, today);
    case 'single':
      if (typeof value !== 'string') return 'invalid_type';
      return question.options.some((o) => o.value === value) ? null : 'invalid_option';
    case 'multi': {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) return 'invalid_type';
      if (new Set(value).size !== value.length) return 'invalid_option';
      return value.every((v) => question.options.some((o) => o.value === v)) ? null : 'invalid_option';
    }
    case 'yesno':
      return typeof value === 'boolean' ? null : 'invalid_type';
    default:
      return 'invalid_type';
  }
}

/**
 * The answer as stored: trimmed text, phone numbers in international format
 * (+251911234567), only the known fields of a date object. Only call it for
 * answers that passed validateAnswer.
 */
export function cleanAnswer(q, value) {
  if (q.type === 'phone' && phoneCountry(q) !== 'any' && typeof value === 'string') {
    return normalizePhone(value, phoneCountry(q)) ?? value.trim();
  }
  if (q.type === 'date') {
    if (typeof value === 'string') return { date: value.trim(), calendar: 'gregorian' };
    if (emptyDateObject(value)) return undefined;
    if (answerCalendar(value) === 'gregorian') return { date: value.date.trim(), calendar: 'gregorian' };
    const { year, month, day } = value.ethiopian;
    return { date: value.date, calendar: 'ethiopian', ethiopian: { year, month, day } };
  }
  if (typeof value === 'string') return value.trim();
  return value;
}

/**
 * Check a whole answer set against a flow.
 * mode "save":   unknown ids and bad formats are errors; missing answers are fine.
 * mode "submit": also every visible required question must be answered.
 * Returns { errors: [{ field, code }], clean } where `clean` holds only the
 * answers to visible questions (hidden ones are dropped on submit).
 */
export function validateAnswers(flow, answers, { mode = 'save', today = localToday() } = {}) {
  const errors = [];
  if (!isObj(answers)) return { errors: [{ field: null, code: 'invalid_type' }], clean: {} };
  const byId = new Map(flow.questions.map((q) => [q.id, q]));
  for (const id of Object.keys(answers)) {
    if (!byId.has(id)) errors.push({ field: id, code: 'unknown_question' });
  }
  const clean = {};
  for (const q of flow.questions) {
    const has = Object.prototype.hasOwnProperty.call(answers, q.id);
    const visible = isVisible(q, answers, flow);
    if (mode === 'submit' && !visible) continue;
    const code = validateAnswer(q, has ? answers[q.id] : undefined, { checkRequired: mode === 'submit', today });
    if (code) errors.push({ field: q.id, code });
    else if (has && !isEmpty(answers[q.id]) && q.type !== 'info') {
      const value = cleanAnswer(q, answers[q.id]);
      if (value !== undefined) clean[q.id] = value;
    }
  }
  return { errors, clean };
}
