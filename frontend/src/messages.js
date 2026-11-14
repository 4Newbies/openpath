// Interface text in English and Amharic, each with a "simple words" version.
// Lookup order: simple mode -> [lang simple, lang, en simple, en];
// normal mode -> [lang, en]. Question text comes from the question file.

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
  settings: 'Settings',
  setupTitle: 'How do you want to use this?',
  setupIntro:
    "You can use your phone or computer's own tools, like a screen reader, voice typing or switch access. Or turn on helpers below. You can change this at any time with the Settings button.",
  useDeviceTools: "Continue with my device's own tools",
  helpersLegend: 'Or choose helpers',
  helperReadAloud: 'Read questions to me',
  helperVoice: 'I want to speak my answers',
  helperSimple: 'Simple words',
  helperLarger: 'Bigger text',
  helperContrast: 'High contrast',
  continueWithHelpers: 'Continue with these helpers',
  listen: 'Listen',
  stopReading: 'Stop',
  choices: 'Choices:',
  speakAnswer: 'Speak your answer',
  stopListening: 'Stop listening',
  listening: 'Listening',
  stopped: 'Stopped',
  youSaid: 'You said: {text}. Edit it or press Next.',
  youSaidChoice: 'You said: {text}. Chosen: {option}. Change it or press Next.',
  noMatch: 'You said: {text}. That does not match an answer, so nothing was chosen. Please choose an answer.',
  consentText: "Your voice is sent to your browser's speech service to turn it into text. Allow?",
  consentAllow: 'Allow',
  consentDeny: 'No, I will type',
  voiceDenied: 'OK. You can type your answers.',
  voice_permission: 'The microphone is blocked. Please type your answer, or allow the microphone in your browser settings.',
  voice_no_speech: 'I did not hear anything. Try again, or type your answer.',
  voice_offline: 'Voice input needs an internet connection. Please type your answer.',
  voice_no_microphone: 'No microphone was found. Please type your answer.',
  voice_failed: 'Voice input did not work. Please type your answer.',
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

const enSimple = {
  skip: 'Skip',
  reviewIntro: 'Are these right? Press Change to fix one.',
  edit: 'Change',
  editHidden: ' {q}',
  notAnswered: 'No answer',
  submit: 'Send',
  submitting: 'Sending…',
  savedLocal: 'Saved on this phone.',
  doneTitle: 'Thank you! We got your answers.',
  submitFailed: 'Could not send. Please try again.',
  fixBeforeSubmit: 'Please fix one answer first.',
  setupIntro: 'You can use your own phone tools. Or pick helpers below. You can change this later in Settings.',
  useDeviceTools: 'Use my own phone tools',
  helpersLegend: 'Or pick helpers',
  continueWithHelpers: 'Go on with these helpers',
  youSaid: 'You said: {text}. Fix it or press Next.',
  youSaidChoice: 'You said: {text}. We picked: {option}. Change it or press Next.',
  noMatch: 'You said: {text}. We could not find that answer. Please pick one.',
  consentText: 'Your browser sends your voice to a speech service to make text. Is that OK?',
  consentAllow: 'Yes, OK',
  voiceDenied: 'OK. Please type.',
  voice_permission: 'The microphone is off. Please type, or turn it on in your browser.',
  voice_no_speech: 'We did not hear you. Try again, or type.',
  voice_offline: 'You need internet for this. Please type.',
  voice_no_microphone: 'No microphone found. Please type.',
  voice_failed: 'This did not work. Please type.',
  errors: {
    required_text: 'Please write an answer.',
    required_single: 'Please pick one.',
    required_multi: 'Please pick one or more.',
    too_long: 'Too long. Use {max} letters or less.',
    invalid_phone: 'Please check the phone number.',
    invalid_date: 'Please check the date.',
    future_date: 'This date has not come yet.',
    invalid_option: 'Please pick from the list.',
    invalid_type: 'Please check this answer.',
  },
};

// Amharic. Needs review by a native speaker before production use.
const am = {
  loading: 'ጥያቄዎችን በመጫን ላይ…',
  stepOf: 'ደረጃ {n} ከ{total}',
  optional: '(አማራጭ)',
  next: 'ቀጣይ',
  back: 'ተመለስ',
  skip: 'ይህን ጥያቄ ዝለል',
  reviewTitle: 'መልሶችዎን ያረጋግጡ',
  reviewIntro: 'ከመላክዎ በፊት መልሶችዎን ያረጋግጡ። መልስ ለመቀየር «አስተካክል»ን ይጫኑ።',
  edit: 'አስተካክል',
  editHidden: ' መልስዎን ለ፦ {q}',
  notAnswered: 'አልተመለሰም',
  submit: 'መልሶቼን ላክ',
  submitting: 'መልሶችዎን በመላክ ላይ…',
  saved: 'ተቀምጧል።',
  savedLocal: 'በዚህ መሣሪያ ላይ ተቀምጧል። ከአገልጋዩ ጋር መገናኘት አልተቻለም፤ ግን መልሶችዎ እዚህ ደህና ናቸው።',
  doneTitle: 'እናመሰግናለን። መልሶችዎ ተልከዋል።',
  doneBody: 'አሁን ይህን ገጽ መዝጋት ይችላሉ።',
  yes: 'አዎ',
  no: 'አይ',
  day: 'ቀን',
  month: 'ወር',
  year: 'ዓመት',
  errorPrefix: 'ስህተት፦ ',
  submitFailed: 'መልሶችዎን መላክ አልተቻለም። አሁንም በዚህ መሣሪያ ላይ ተቀምጠዋል። እባክዎ እንደገና ይሞክሩ።',
  fixBeforeSubmit: 'ከመላክዎ በፊት አንድ መልስ መስተካከል አለበት።',
  settings: 'ቅንብሮች',
  setupTitle: 'ይህን እንዴት መጠቀም ይፈልጋሉ?',
  setupIntro:
    'የስልክዎን ወይም የኮምፒውተርዎን የራሱን መሣሪያዎች መጠቀም ይችላሉ፤ ለምሳሌ ስክሪን አንባቢ፣ በድምፅ መጻፍ ወይም ስዊች። ወይም ከታች ረዳቶችን ያብሩ። ይህን በማንኛውም ጊዜ በ«ቅንብሮች» ቁልፍ መቀየር ይችላሉ።',
  useDeviceTools: 'በመሣሪያዬ የራሱ መሣሪያዎች ቀጥል',
  helpersLegend: 'ወይም ረዳቶችን ይምረጡ',
  helperReadAloud: 'ጥያቄዎችን አንብብልኝ',
  helperVoice: 'መልሶቼን በድምፅ መናገር እፈልጋለሁ',
  helperSimple: 'ቀላል ቃላት',
  helperLarger: 'ትልቅ ጽሑፍ',
  helperContrast: 'ከፍተኛ ንፅፅር',
  continueWithHelpers: 'በእነዚህ ረዳቶች ቀጥል',
  listen: 'አዳምጥ',
  stopReading: 'አቁም',
  choices: 'ምርጫዎች፦',
  speakAnswer: 'መልስዎን ይናገሩ',
  stopListening: 'ማዳመጥ አቁም',
  listening: 'በማዳመጥ ላይ',
  stopped: 'ቆሟል',
  youSaid: 'ያሉት፦ {text}። ያስተካክሉት ወይም «ቀጣይ»ን ይጫኑ።',
  youSaidChoice: 'ያሉት፦ {text}። የተመረጠው፦ {option}። ይቀይሩት ወይም «ቀጣይ»ን ይጫኑ።',
  noMatch: 'ያሉት፦ {text}። ይህ ከማንኛውም መልስ ጋር አይመሳሰልም፤ ስለዚህ ምንም አልተመረጠም። እባክዎ መልስ ይምረጡ።',
  consentText: 'ድምፅዎ ወደ ጽሑፍ እንዲቀየር ወደ አሳሽዎ የንግግር አገልግሎት ይላካል። ይፈቅዳሉ?',
  consentAllow: 'ፍቀድ',
  consentDeny: 'አይ፣ እጽፋለሁ',
  voiceDenied: 'እሺ። መልሶችዎን መጻፍ ይችላሉ።',
  voice_permission: 'ማይክሮፎኑ ታግዷል። እባክዎ መልስዎን ይጻፉ፤ ወይም በአሳሽዎ ቅንብሮች ማይክሮፎኑን ይፍቀዱ።',
  voice_no_speech: 'ምንም አልሰማሁም። እንደገና ይሞክሩ ወይም መልስዎን ይጻፉ።',
  voice_offline: 'በድምፅ ለመመለስ የኢንተርኔት ግንኙነት ያስፈልጋል። እባክዎ መልስዎን ይጻፉ።',
  voice_no_microphone: 'ማይክሮፎን አልተገኘም። እባክዎ መልስዎን ይጻፉ።',
  voice_failed: 'በድምፅ መመለስ አልሰራም። እባክዎ መልስዎን ይጻፉ።',
  errors: {
    required_text: 'እባክዎ ለዚህ ጥያቄ መልስ ይጻፉ።',
    required_single: 'እባክዎ አንድ መልስ ይምረጡ።',
    required_multi: 'እባክዎ ቢያንስ አንድ መልስ ይምረጡ።',
    too_long: 'መልስዎ በጣም ረጅም ነው። እባክዎ ከ{max} ፊደላት ያልበለጠ ይጠቀሙ።',
    invalid_phone: 'ይህ ስልክ ቁጥር አይመስልም። ቁጥሮችን፣ ክፍተቶችንና + ይጠቀሙ፤ ለምሳሌ 0911 234 567።',
    invalid_date: 'እባክዎ ትክክለኛ ቀን ያስገቡ፦ ቀን፣ ወር እና ዓመት፤ ለምሳሌ 27 3 2001።',
    future_date: 'ቀኑ ወደፊት ሊሆን አይችልም።',
    invalid_option: 'እባክዎ ከተዘረዘሩት መልሶች አንዱን ይምረጡ።',
    invalid_type: 'እባክዎ ይህን መልስ ያረጋግጡና እንደገና ይሞክሩ።',
  },
};

const amSimple = {
  skip: 'ዝለል',
  reviewIntro: 'እነዚህ ትክክል ናቸው? ለመቀየር «ቀይር»ን ይጫኑ።',
  edit: 'ቀይር',
  editHidden: ' {q}',
  notAnswered: 'መልስ የለም',
  submit: 'ላክ',
  submitting: 'በመላክ ላይ…',
  savedLocal: 'በዚህ ስልክ ላይ ተቀምጧል።',
  doneTitle: 'እናመሰግናለን! መልሶችዎን ተቀብለናል።',
  submitFailed: 'መላክ አልተቻለም። እባክዎ እንደገና ይሞክሩ።',
  fixBeforeSubmit: 'እባክዎ መጀመሪያ አንድ መልስ ያስተካክሉ።',
  setupIntro: 'የስልክዎን መሣሪያዎች መጠቀም ይችላሉ። ወይም ከታች ረዳቶችን ይምረጡ። በኋላ በ«ቅንብሮች» መቀየር ይችላሉ።',
  useDeviceTools: 'የስልኬን መሣሪያዎች ልጠቀም',
  helpersLegend: 'ወይም ረዳቶችን ይምረጡ',
  continueWithHelpers: 'በእነዚህ ረዳቶች ቀጥል',
  youSaid: 'ያሉት፦ {text}። ያስተካክሉ ወይም «ቀጣይ»ን ይጫኑ።',
  youSaidChoice: 'ያሉት፦ {text}። የመረጥነው፦ {option}። ይቀይሩ ወይም «ቀጣይ»ን ይጫኑ።',
  noMatch: 'ያሉት፦ {text}። ይህን መልስ አላገኘንም። እባክዎ አንዱን ይምረጡ።',
  consentText: 'አሳሽዎ ድምፅዎን ወደ ጽሑፍ ለመቀየር ወደ አገልግሎት ይልካል። ይስማማሉ?',
  consentAllow: 'አዎ፣ እሺ',
  voiceDenied: 'እሺ። እባክዎ ይጻፉ።',
  voice_permission: 'ማይክሮፎኑ ጠፍቷል። እባክዎ ይጻፉ ወይም በአሳሽዎ ያብሩት።',
  voice_no_speech: 'አልሰማንዎትም። እንደገና ይሞክሩ ወይም ይጻፉ።',
  voice_offline: 'ለዚህ ኢንተርኔት ያስፈልጋል። እባክዎ ይጻፉ።',
  voice_no_microphone: 'ማይክሮፎን የለም። እባክዎ ይጻፉ።',
  voice_failed: 'አልሰራም። እባክዎ ይጻፉ።',
  errors: {
    required_text: 'እባክዎ መልስ ይጻፉ።',
    required_single: 'እባክዎ አንዱን ይምረጡ።',
    required_multi: 'እባክዎ አንድ ወይም ከዚያ በላይ ይምረጡ።',
    too_long: 'በጣም ረጅም ነው። ከ{max} ፊደላት ያነሰ ይጠቀሙ።',
    invalid_phone: 'እባክዎ ስልክ ቁጥሩን ያረጋግጡ።',
    invalid_date: 'እባክዎ ቀኑን ያረጋግጡ።',
    future_date: 'ይህ ቀን ገና አልደረሰም።',
    invalid_option: 'እባክዎ ከዝርዝሩ ይምረጡ።',
    invalid_type: 'እባክዎ ይህን መልስ ያረጋግጡ።',
  },
};

const catalogs = { en, am, en_simple: enSimple, am_simple: amSimple };

function lookup(catalog, key) {
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), catalog);
}

function chain(lang, simple) {
  const base = catalogs[lang] ? lang : 'en';
  return simple ? [`${base}_simple`, base, 'en_simple', 'en'] : [base, 'en'];
}

export function t(lang, key, vars = {}, simple = false) {
  let raw;
  for (const name of chain(lang, simple)) {
    raw = lookup(catalogs[name], key);
    if (typeof raw === 'string') break;
  }
  if (typeof raw !== 'string') raw = key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Plain-language message for an answer error code from shared/flow.js. */
export function errorMessage(lang, question, code, simple = false) {
  if (code === 'required') {
    const kind = question.type === 'multi' ? 'multi' : ['single', 'yesno'].includes(question.type) ? 'single' : 'text';
    return t(lang, `errors.required_${kind}`, {}, simple);
  }
  return t(lang, `errors.${code}`, { max: question.maxLength ?? 500 }, simple);
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

/** The question (or option) text to show: its `simple` version in simple mode. */
export function labelOf(item, lang, simple) {
  return pick(simple && item.simple ? item.simple : item.label, lang);
}
