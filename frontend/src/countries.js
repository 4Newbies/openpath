import { COUNTRY_CODES, NEAR_COUNTRIES } from '../../shared/phone-countries.js';

// Country names for the phone "Country code" list, in the form's language
// where the browser knows them (Intl.DisplayNames), otherwise in English.

const ENGLISH = new Map(COUNTRY_CODES.map(([iso, , name]) => [iso, name]));
const namers = new Map();

function namer(lang) {
  if (!namers.has(lang)) {
    let n = null;
    try {
      // fallback "none": undefined instead of the bare code when the language lacks a name.
      n = new Intl.DisplayNames([lang], { type: 'region', fallback: 'none' });
      // A browser without data for this language answers in its own default
      // language; only trust it when it really supports the language.
      if (!Intl.DisplayNames.supportedLocalesOf([lang]).length) n = null;
    } catch {
      n = null;
    }
    namers.set(lang, n);
  }
  return namers.get(lang);
}

/** { name, lang } for a country: lang is the language the name is written in. */
export function countryName(iso, lang) {
  let local;
  try {
    local = namer(lang)?.of(iso);
  } catch {
    local = undefined;
  }
  if (local && local !== iso) return { name: local, lang };
  return { name: ENGLISH.get(iso) ?? iso, lang: 'en' };
}

/**
 * The "Country code" list: the question's country, then Ethiopia's
 * neighbours (Ethiopia first), then every other country A to Z in the
 * form's language. Each entry is { iso, callingCode, name, lang }.
 */
export function countryList(lang, first = 'ET') {
  const entry = ([iso, callingCode]) => ({ iso, callingCode, ...countryName(iso, lang) });
  const byIso = new Map(COUNTRY_CODES.map((c) => [c[0], c]));
  const nearIsos = [first, ...NEAR_COUNTRIES.filter((c) => c !== first)].filter((c) => byIso.has(c));
  const near = nearIsos.map((iso) => entry(byIso.get(iso)));
  let compare;
  try {
    compare = new Intl.Collator(lang).compare;
  } catch {
    compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  }
  const rest = COUNTRY_CODES.filter(([iso]) => !nearIsos.includes(iso))
    .map(entry)
    .sort((a, b) => compare(a.name, b.name));
  return { near, rest };
}
