// Tiny DOM helper. Text always goes in through text nodes / textContent,
// never innerHTML, so question files can't inject markup.

const PROPS = new Set(['value', 'checked']);

// Text that carries its own language (FallbackText from messages.js: an
// interface string shown in English because the pack lacks it).
const langOf = (v) => (v instanceof String && typeof v.lang === 'string' ? v : null);

/** Set an element's text, marking lang/dir when the text is in another language. */
export function setText(el, value) {
  el.textContent = String(value ?? '');
  const l = langOf(value);
  if (l) el.setAttribute('lang', l.lang);
  else el.removeAttribute('lang');
  if (l?.dir) el.setAttribute('dir', l.dir);
  else el.removeAttribute('dir');
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') {
      el.textContent = String(v);
      const l = langOf(v);
      if (l && !attrs.lang) el.setAttribute('lang', l.lang);
      if (l?.dir && !attrs.dir) el.setAttribute('dir', l.dir);
    }
    else if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    const l = langOf(c);
    if (l) el.append(h('span', { lang: l.lang, dir: l.dir, text: String(c) }));
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Visually hidden text for screen readers. */
export const sr = (text) => h('span', { class: 'op-sr', text });

export const ids = (...list) => list.filter(Boolean).join(' ') || undefined;
