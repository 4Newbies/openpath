// Interface text comes from language packs: one JSON file per language in
// frontend/lang/. English is bundled as the fallback; other packs are
// fetched on demand (see loadPack) and registered here.
//
// Lookup order: simple mode -> [lang simple, lang, en simple, en];
// normal mode -> [lang, en]. A missing string falls back to English, a
// missing key to the key itself. Question text comes from the question file.

import { answerCalendar, PHONE_COUNTRIES, phoneCountry } from '../../shared/flow.js';
import en from '../lang/en.json';

export const FALLBACK_LANG = 'en';
export const LANG_CODE_RE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

const packs = new Map([[en.code, en]]);
const loading = new Map(); // url -> Promise<pack | null>

/** Problems with a parsed pack; an empty list means it can be used. */
export function validatePack(pack) {
  const errors = [];
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(pack)) return ['a language pack must be a JSON object'];
  if (typeof pack.code !== 'string' || !LANG_CODE_RE.test(pack.code)) errors.push('code must be a language code such as "am"');
  if (typeof pack.name !== 'string' || !pack.name.trim()) errors.push('name must be the language name, written in that language');
  if (pack.dir !== 'ltr' && pack.dir !== 'rtl') errors.push('dir must be "ltr" or "rtl"');
  const checkStrings = (obj, path) => {
    if (obj === undefined && path === 'simple') return;
    if (!isObj(obj)) return errors.push(`${path} must be an object`);
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') continue;
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) continue;
      if (isObj(v) && k === 'errors') checkStrings(v, `${path}.errors`);
      else errors.push(`${path}.${k} must be text`);
    }
  };
  checkStrings(pack.strings, 'strings');
  checkStrings(pack.simple, 'simple');
  return errors;
}

export function registerPack(pack) {
  const errors = validatePack(pack);
  if (errors.length) throw new TypeError(`[openpath] invalid language pack: ${errors.join('; ')}`);
  packs.set(pack.code, pack);
  return pack;
}

export const hasPack = (code) => packs.has(code);

/** { code, name, dir } of a registered pack (English if it isn't registered). */
export function packInfo(code) {
  const p = packs.get(code) ?? en;
  return { code: p.code, name: p.name, dir: p.dir, draft: p.draft === true };
}

/**
 * Fetch `${base}${code}.json`, check it and register it. Resolves with the
 * pack, or null (after a console warning) when it can't be loaded or is
 * invalid, so the caller falls back to English. Each URL is fetched once.
 */
export function loadPack(code, base, { fetchImpl = globalThis.fetch, log = console } = {}) {
  if (packs.has(code)) return Promise.resolve(packs.get(code));
  if (!LANG_CODE_RE.test(code)) {
    log.warn(`[openpath] "${code}" is not a language code. Using English.`);
    return Promise.resolve(null);
  }
  const url = `${base}${code}.json`;
  if (!loading.has(url)) {
    loading.set(
      url,
      (async () => {
        try {
          const res = await fetchImpl(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
          if (!res.ok) throw new Error(`the server answered ${res.status}`);
          const pack = await res.json();
          const errors = validatePack(pack);
          if (!errors.length && pack.code !== code) errors.push(`code is "${pack.code}", expected "${code}"`);
          if (errors.length) throw new Error(`it is invalid: ${errors.join('; ')}`);
          return registerPack(pack);
        } catch (e) {
          loading.delete(url); // a later attempt may work (for example back online)
          log.warn(`[openpath] Could not load the language pack "${url}" (${e.message}). Using English.`);
          return null;
        }
      })(),
    );
  }
  return loading.get(url);
}

/** Tests only. */
export function resetPacks() {
  for (const code of [...packs.keys()]) if (code !== en.code) packs.delete(code);
  loading.clear();
}

function lookup(catalog, key) {
  return key.split('.').reduce((o, k) => (o && typeof o === 'object' && !Array.isArray(o) ? o[k] : undefined), catalog);
}

function catalogs(lang, simple) {
  const p = packs.get(lang) ?? en;
  const list = simple ? [p.simple, p.strings, en.simple, en.strings] : [p.strings, en.strings];
  return list.filter(Boolean);
}

/** A list (for example month names) from the pack, falling back to English. */
export function tList(lang, key, simple = false) {
  for (const c of catalogs(lang, simple)) {
    const v = lookup(c, key);
    if (Array.isArray(v)) return v;
  }
  return [];
}

export function t(lang, key, vars = {}, simple = false) {
  let raw;
  for (const c of catalogs(lang, simple)) {
    raw = lookup(c, key);
    if (typeof raw === 'string') break;
  }
  if (typeof raw !== 'string') raw = key;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** Plain-language message for an answer error code from shared/flow.js. */
export function errorMessage(lang, question, code, simple = false, vars = {}, value = undefined) {
  if (code === 'required') {
    const kinds = { multi: 'multi', single: 'single', yesno: 'single', date: 'date' };
    return t(lang, `errors.required_${kinds[question.type] ?? 'text'}`, vars, simple);
  }
  let key = code;
  const calendar = value === undefined ? question.calendar : answerCalendar(value);
  if (code === 'invalid_date' && calendar === 'ethiopian') key = 'invalid_date_ethiopian';
  // Phone errors give an example number for the question's country.
  const country = question.type === 'phone' ? PHONE_COUNTRIES[phoneCountry(question)] : null;
  if (code === 'invalid_phone' && question.type === 'phone' && !country) key = 'invalid_phone_any';
  return t(lang, `errors.${key}`, { max: question.maxLength ?? 500, example: country?.example ?? '', ...vars }, simple);
}

/**
 * Pick text for the current language from a { en, am, ... } object.
 * Returns { text, lang } where lang is the language actually used, so the
 * element can carry the right lang attribute when we fall back to English.
 */
export function pick(localized, lang) {
  if (!localized) return { text: '', lang };
  if (localized[lang]) return { text: localized[lang], lang };
  return { text: localized.en ?? '', lang: 'en' };
}

/**
 * lang (and dir, when the direction differs) for text shown in another
 * language than the form's, e.g. English question text in an Arabic form.
 * Spread into the element's attributes: h('span', { ...langAttrs(used, lang) }).
 */
export function langAttrs(used, lang) {
  if (!used || used === lang) return {};
  const dir = packInfo(used).dir;
  return { lang: used, dir: dir !== packInfo(lang).dir ? dir : undefined };
}

/** The question (or option) text to show: its `simple` version in simple mode. */
export function labelOf(item, lang, simple) {
  return pick(simple && item.simple ? item.simple : item.label, lang);
}
