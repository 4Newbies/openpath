// Interface text. Amharic comes in a later step; every key falls back to English.

const en = {
  loading: 'Loading questions…',
  stepOf: 'Step {n} of {total}',
  optional: '(optional)',
  next: 'Next',
  back: 'Back',
  skip: 'Skip this question',
  reviewTitle: 'Check your answers',
  reviewIntro: 'Check your answers before you send them. Use Edit to change an answer.',
  edit: 'Edit',
  editHidden: ' your answer to: {q}',
  notAnswered: 'Not answered',
  submit: 'Send my answers',
  submitting: 'Sending your answers…',
  saved: 'Saved.',
  savedLocal: 'Saved on this device. We could not reach the server, but your answers are safe here.',
  doneTitle: 'Thank you. Your answers have been sent.',
  doneBody: 'You can close this page now.',
  yes: 'Yes',
  no: 'No',
  day: 'Day',
  month: 'Month',
  year: 'Year',
  errorPrefix: 'Error: ',
  submitFailed: 'We could not send your answers. They are still saved on this device. Please try again.',
  fixBeforeSubmit: 'One answer needs to be fixed before you can send.',
  errors: {
    required_text: 'Please type an answer to this question.',
    required_single: 'Please choose one answer.',
    required_multi: 'Please choose at least one answer.',
    too_long: 'Your answer is too long. Please use {max} characters or fewer.',
    invalid_phone: 'This does not look like a phone number. Use numbers, spaces and +, for example 0911 234 567.',
    invalid_date: 'Please enter a real date with day, month and year, for example 27 3 2001.',
    future_date: 'The date cannot be in the future.',
    invalid_option: 'Please choose one of the answers shown.',
    invalid_type: 'Please check this answer and try again.',
  },
};

const catalogs = { en, am: {} };

function lookup(catalog, key) {
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), catalog);
}

export function t(lang, key, vars = {}) {
  const raw = lookup(catalogs[lang] ?? {}, key) ?? lookup(en, key) ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Plain-language message for an answer error code from shared/flow.js. */
export function errorMessage(lang, question, code) {
  if (code === 'required') {
    const kind = question.type === 'multi' ? 'multi' : ['single', 'yesno'].includes(question.type) ? 'single' : 'text';
    return t(lang, `errors.required_${kind}`);
  }
  return t(lang, `errors.${code}`, { max: question.maxLength ?? 500 });
}

/**
 * Pick text for the current language from a { en, am } object.
 * Returns { text, lang } where lang is the language actually used, so the
 * element can carry the right lang attribute when we fall back to English.
 */
export function pick(localized, lang) {
  if (!localized) return { text: '', lang };
  if (localized[lang]) return { text: localized[lang], lang };
  return { text: localized.en ?? '', lang: 'en' };
}
