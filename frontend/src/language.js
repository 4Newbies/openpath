// Language and file locations shared by <openpath-flow> and <openpath-jobs>.
import { FALLBACK_LANG, hasPack, LANG_CODE_RE, loadPack, packInfo } from './messages.js';

// The folder openpath.js was loaded from: language packs ("lang/") and
// question files ("questions/") live next to it by default. Read while the
// classic script runs; null when imported as a module (tests, dev server).
export const SCRIPT_BASE = (() => {
  try {
    const src = document.currentScript?.src;
    return src ? new URL('./', src).href : null;
  } catch {
    return null;
  }
})();

/** A folder URL from an attribute (e.g. lang-path), or `sub` next to the script. */
export function folderUrl(el, attrName, sub) {
  const attr = el.getAttribute(attrName);
  try {
    if (attr) return new URL(attr.endsWith('/') ? attr : `${attr}/`, document.baseURI).href;
    return new URL(sub, SCRIPT_BASE ?? document.baseURI).href;
  } catch {
    return sub;
  }
}

/** Codes from a languages="am,en,ar" attribute, in the host's order. */
export function languageList(el) {
  const list = (el.getAttribute('languages') ?? '').split(/[\s,]+/).filter((c) => LANG_CODE_RE.test(c));
  return [...new Set(list)];
}

/** The learner's saved choice (if the host offers it), else lang="...", else the first offered. */
export function requestedLang(el, prefs) {
  const list = languageList(el);
  const saved = prefs?.lang;
  if (saved && list.includes(saved)) return saved;
  const attr = (el.getAttribute('lang') ?? '').trim();
  if (LANG_CODE_RE.test(attr)) return attr;
  return list[0] ?? FALLBACK_LANG;
}

/**
 * Load the wanted pack and every offered one (so a switcher can show each
 * language's own name). A pack that fails to load means English.
 * Returns { lang, switcher: [{ code, name, dir }] }.
 */
export async function resolveLanguages(el, prefs) {
  const base = folderUrl(el, 'lang-path', 'lang/');
  const list = languageList(el);
  const wanted = requestedLang(el, prefs);
  const codes = [...new Set([wanted, ...list])].filter((c) => c !== FALLBACK_LANG);
  await Promise.all(codes.map((c) => loadPack(c, base)));
  return { lang: hasPack(wanted) ? wanted : FALLBACK_LANG, switcher: list.filter(hasPack).map(packInfo) };
}
