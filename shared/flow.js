// Shared rules for OpenPath question files and answers.
// Used unchanged by the browser tag (frontend/) and the API (backend/), so
// both sides agree on what a valid file and a valid answer are.
// Plain ES module, no dependencies (shared/ethiopian.js is ours).

import { ethiopianToIso, isValidEthiopianDate } from './ethiopian.js';

export const QUESTION_TYPES = ['text', 'phone', 'date', 'single', 'multi', 'yesno', 'info'];
export const CALENDARS = ['gregorian', 'ethiopian'];

const ID_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const FLOW_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const OPTION_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
// Language codes in question files and sessions: "en", "am", "ar", "pt-BR" ...
export const LANG_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
const DEFAULT_MAX_LENGTH = 500;
const QUESTION_KEYS = new Set([
  'id', 'type', 'label', 'simple', 'hint', 'icon', 'required', 'voice', 'options',
  'showIf', 'autocomplete', 'maxLength', 'multiline', 'private', 'setsPreference', 'audio', 'calendar',
]);
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
    else if (seen.has(q.id)) errors.push(`${where} id is used twice`);

    if (!QUESTION_TYPES.includes(q.type)) errors.push(`${where}.type must be one of ${QUESTION_TYPES.join(', ')}`);
    checkLocalized(q.label, `${where}.label`, errors, { required: true });
    checkLocalized(q.simple, `${where}.simple`, errors);
    checkLocalized(q.hint, `${where}.hint`, errors);

    for (const b of ['required', 'voice', 'multiline', 'private']) {
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
 * An Ethiopian-calendar date answer is stored as
 *   { "date": "2001-03-27", "ethiopian": { "year": 1993, "month": 7, "day": 18 } }
 * The ISO Gregorian date and the original Ethiopian date must agree.
 */
function ethiopianDateError(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'invalid_type';
  if (!isValidEthiopianDate(value.ethiopian)) return 'invalid_date';
  if (typeof value.date !== 'string' || value.date !== ethiopianToIso(value.ethiopian)) return 'calendar_mismatch';
  return dateError(value.date);
}

/** True for an Ethiopian date answer with nothing chosen yet. */
function emptyEthiopian(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const e = value.ethiopian;
  return !value.date && (!e || ['year', 'month', 'day'].every((k) => e[k] === undefined || e[k] === null || e[k] === ''));
}

function dateError(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return 'invalid_date';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return 'invalid_date';
  if (y < 1900) return 'invalid_date';
  if (dt.getTime() > Date.now()) return 'future_date';
  return null;
}

/**
 * Check one answer. Returns null when fine, otherwise an error code:
 * required, invalid_type, too_long, invalid_phone, invalid_date,
 * future_date, calendar_mismatch, invalid_option, not_answerable.
 * Required-ness is only checked when `checkRequired` is true (on Next and
 * on submit), so progress can be saved half-done.
 */
export function validateAnswer(question, value, { checkRequired = true } = {}) {
  if (question.type === 'info') return value === undefined || value === null ? null : 'not_answerable';
  if (isEmpty(value) || (question.calendar === 'ethiopian' && emptyEthiopian(value))) {
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
      if (!/^\+?[0-9\s().-]+$/.test(value.trim())) return 'invalid_phone';
      const digits = value.replace(/\D/g, '').length;
      return digits >= 7 && digits <= 15 ? null : 'invalid_phone';
    }
    case 'date':
      if (question.calendar === 'ethiopian') return ethiopianDateError(value);
      return typeof value === 'string' ? dateError(value.trim()) : 'invalid_type';
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

/** The answer as stored: trimmed text; only the known fields of a date object. */
function cleanValue(q, value) {
  if (typeof value === 'string') return value.trim();
  if (q.type === 'date' && q.calendar === 'ethiopian') {
    if (emptyEthiopian(value)) return undefined;
    const { year, month, day } = value.ethiopian;
    return { date: value.date, ethiopian: { year, month, day } };
  }
  return value;
}

/**
 * Check a whole answer set against a flow.
 * mode "save":   unknown ids and bad formats are errors; missing answers are fine.
 * mode "submit": also every visible required question must be answered.
 * Returns { errors: [{ field, code }], clean } where `clean` holds only the
 * answers to visible questions (hidden ones are dropped on submit).
 */
export function validateAnswers(flow, answers, { mode = 'save' } = {}) {
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
    const code = validateAnswer(q, has ? answers[q.id] : undefined, { checkRequired: mode === 'submit' });
    if (code) errors.push({ field: q.id, code });
    else if (has && !isEmpty(answers[q.id]) && q.type !== 'info') {
      const value = cleanValue(q, answers[q.id]);
      if (value !== undefined) clean[q.id] = value;
    }
  }
  return { errors, clean };
}
