// Keeps host theme colours accessible (WCAG 2.2 AA).
//
// A host page may set --openpath-color (light theme) and --openpath-color-dark
// (dark theme). The component never uses those values directly. It measures
// them against the form background and writes safe versions on .op-root:
//
//   --op-brand-fill     the host colour itself, as the background of the
//                       primary button, the pressed language, the mic button
//   --op-brand-on-fill  text on that fill: black or white, whichever has the
//                       higher contrast (always at least 4.5:1)
//   --op-brand-text     the colour as text on the form background: >= 4.5:1
//   --op-brand-line     the colour as borders, outlines and checkbox fill: >= 3:1
//
// A colour that fails is darkened (on a light background) or lightened (on a
// dark one) step by step, keeping its hue and saturation, and the developer
// gets a console warning with the original value, the new value and the ratio.
// styles.css maps these to --op-accent, --op-accent-text, --op-accent-fill and
// --op-accent-line. High contrast (the learner's or the device's) and
// forced-colors use their own palette: nothing is written then, and the CSS
// for those modes does not read --op-brand-* at all.
//
// The host's font size is checked too: the component never goes below 16px
// (styles.css enforces it; this only tells the developer).

export const MIN_TEXT = 4.5; // WCAG 1.4.3, normal text
export const MIN_LINE = 3; // WCAG 1.4.11, borders, outlines, focus indicators
export const MIN_FONT_PX = 16;

/**
 * The built-in palettes, as in styles.css (a test checks they match).
 * The form background and every token text is shown on.
 */
export const PALETTES = {
  light: { bg: '#ffffff', text: '#1b1b1b', muted: '#474747', error: '#b3261e', border: '#5c5c5c', selected: '#eef4fb', accent: '#0b5cad', accentText: '#ffffff' },
  dark: { bg: '#1b1b1f', text: '#f2f2f2', muted: '#c8c8c8', error: '#ffb4ab', border: '#9a9a9a', selected: '#23344d', accent: '#8cb8ff', accentText: '#111111' },
};

const BRAND_PROPS = ['--op-brand-fill', '--op-brand-on-fill', '--op-brand-text', '--op-brand-line'];

// ---- colours ---------------------------------------------------------------------

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** A CSS colour as { r, g, b, a } (0-255, alpha 0-1), or null. Hex, rgb(), hsl() and a few names. */
export function parseColor(input) {
  const s = String(input ?? '').trim().toLowerCase();
  if (!s) return null;
  if (NAMED[s]) return parseColor(NAMED[s]);
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (m) {
    let hex = m[1];
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join('');
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  m = /^(rgba?|hsla?)\(\s*(.+?)\s*\)$/.exec(s);
  if (!m) return null;
  const parts = m[2].split(/\s*[,/]\s*|\s+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const num = (p, scale) => (p.endsWith('%') ? (parseFloat(p) / 100) * scale : parseFloat(p));
  const alpha = parts[3] === undefined ? 1 : clamp(num(parts[3], 1), 0, 1);
  if (m[1].startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map((p) => clamp(Math.round(num(p, 255)), 0, 255));
    return [r, g, b, alpha].some(Number.isNaN) ? null : { r, g, b, a: alpha };
  }
  const h = parseFloat(parts[0]);
  const sat = clamp(parseFloat(parts[1]), 0, 100);
  const light = clamp(parseFloat(parts[2]), 0, 100);
  if ([h, sat, light, alpha].some(Number.isNaN)) return null;
  return { ...hslToRgb({ h, s: sat, l: light }), a: alpha };
}

const NAMED = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
  orange: '#ffa500', purple: '#800080', gray: '#808080', grey: '#808080', lightgray: '#d3d3d3', lightgrey: '#d3d3d3',
  silver: '#c0c0c0', navy: '#000080', teal: '#008080', maroon: '#800000', lightyellow: '#ffffe0', pink: '#ffc0cb',
  gold: '#ffd700', cyan: '#00ffff', aqua: '#00ffff', magenta: '#ff00ff', fuchsia: '#ff00ff', lime: '#00ff00',
  olive: '#808000', transparent: '#00000000',
};

export const toHex = ({ r, g, b }) => `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;

/** A see-through colour as it looks on the background. */
export function flatten(color, bg) {
  if (color.a >= 1) return { r: color.r, g: color.g, b: color.b, a: 1 };
  const mix = (c, b) => Math.round(c * color.a + b * (1 - color.a));
  return { r: mix(color.r, bg.r), g: mix(color.g, bg.g), b: mix(color.b, bg.b), a: 1 };
}

/** WCAG relative luminance. */
export function luminance({ r, g, b }) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (strings or { r, g, b }), 1 to 21. */
export function contrast(a, b) {
  const [x, y] = [a, b].map((c) => luminance(typeof c === 'string' ? parseColor(c) : c));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Black or white, whichever has the higher contrast on this colour. */
export function bestTextOn(fill) {
  return contrast(fill, '#000000') >= contrast(fill, '#ffffff') ? '#000000' : '#ffffff';
}

export function rgbToHsl({ r, g, b }) {
  const [R, G, B] = [r, g, b].map((v) => v / 255);
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }) {
  const S = s / 100;
  const L = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

/**
 * The colour, made darker or lighter in small steps (same hue and saturation)
 * until it has at least `min` contrast on `bg`. Returns { color, ratio, changed }.
 */
export function adjustForContrast(color, bg, min) {
  const c = typeof color === 'string' ? parseColor(color) : color;
  const b = typeof bg === 'string' ? parseColor(bg) : bg;
  const start = flatten(c, b);
  const ratio = contrast(start, b);
  if (ratio >= min) return { color: toHex(start), ratio, changed: false };
  const hsl = rgbToHsl(start);
  // Away from the background first: darker on a light one, lighter on a dark one.
  const darkBg = luminance(b) < 0.18;
  for (const step of darkBg ? [1, -1] : [-1, 1]) {
    for (let l = hsl.l + step; l >= 0 && l <= 100; l += step) {
      const next = hslToRgb({ ...hsl, l });
      const r = contrast(next, b);
      if (r >= min) return { color: toHex(next), ratio: r, changed: true };
    }
  }
  // Only possible on a mid-grey background: fall back to black or white.
  const fallback = bestTextOn(b);
  return { color: fallback, ratio: contrast(fallback, b), changed: true };
}

/** All four safe values for one host colour on one background. */
export function brandColours(raw, bg) {
  const b = parseColor(bg);
  const fill = flatten(parseColor(raw), b);
  const onFill = bestTextOn(fill);
  return {
    fill: toHex(fill),
    onFill,
    onFillRatio: contrast(fill, onFill),
    text: adjustForContrast(fill, b, MIN_TEXT),
    line: adjustForContrast(fill, b, MIN_LINE),
  };
}

const fmt = (r) => `${(Math.floor(r * 100) / 100).toFixed(2)}:1`;

// ---- on the page -------------------------------------------------------------------

/**
 * Watches one component (host element + its .op-root) and keeps its colours
 * safe: at start, on check() (call it on every render), when theme or helper
 * attributes change, when the host page's style or stylesheets change, and
 * when the device's colour scheme, contrast or forced-colors setting changes.
 */
export class ThemeGuard {
  constructor(host, root, { warn = (...a) => console.warn(...a) } = {}) {
    this.host = host;
    this.root = root;
    this.warn = warn;
    this.warned = new Set();
    this.last = null;
  }

  /** Call once the component has set data-theme and data-high-contrast; later calls just check again. */
  sync() {
    return this.running ? this.check() : this.start();
  }

  start() {
    this.running = true;
    this.check();
    const again = () => this.check();
    this.queries = ['(prefers-color-scheme: dark)', '(prefers-contrast: more)', '(forced-colors: active)']
      .map((q) => globalThis.matchMedia?.(q))
      .filter(Boolean);
    for (const q of this.queries) q.addEventListener?.('change', again);
    this.onQuery = again;
    if (typeof MutationObserver === 'function') {
      this.observer = new MutationObserver(again);
      const attributeFilter = ['style', 'class', 'data-theme', 'data-high-contrast'];
      for (const node of [this.root, this.host, document.documentElement, document.body].filter(Boolean)) {
        this.observer.observe(node, { attributes: true, attributeFilter });
      }
      // A stylesheet added or changed in the page may set the colours.
      if (document.head) this.observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    }
    return this;
  }

  stop() {
    this.running = false;
    this.observer?.disconnect();
    for (const q of this.queries ?? []) q.removeEventListener?.('change', this.onQuery);
  }

  matches(query) {
    return Boolean(globalThis.matchMedia?.(query).matches);
  }

  /** The learner's or the device's high contrast, or Windows forced colors: built-in palette only. */
  get safePaletteOnly() {
    return this.root.hasAttribute('data-high-contrast') || this.matches('(prefers-contrast: more)') || this.matches('(forced-colors: active)');
  }

  /** As styles.css: dark for data-theme="dark", or "auto" on a device in dark mode; otherwise light. */
  get dark() {
    const theme = this.root.getAttribute('data-theme');
    return theme === 'dark' || (theme === 'auto' && this.matches('(prefers-color-scheme: dark)'));
  }

  clear() {
    for (const p of BRAND_PROPS) this.root.style.removeProperty(p);
  }

  check() {
    this.checkFontSize();
    if (this.safePaletteOnly) {
      this.last = null;
      return this.clear();
    }
    const dark = this.dark;
    const prop = dark ? '--openpath-color-dark' : '--openpath-color';
    const raw = getComputedStyle(this.host).getPropertyValue(prop).trim();
    const bg = dark ? PALETTES.dark.bg : PALETTES.light.bg;
    const key = `${prop}|${raw}|${bg}`;
    if (key === this.last) return; // nothing changed: no work, no repeated writes
    this.last = key;
    if (!raw) return this.clear();
    const parsed = parseColor(raw);
    if (!parsed) {
      this.once(`unreadable ${prop} ${raw}`, `[openpath] ${prop}: "${raw}" is not a colour OpenPath can read (use #rrggbb, rgb() or hsl()). The built-in colour is used instead.`);
      return this.clear();
    }
    const c = brandColours(raw, bg);
    this.root.style.setProperty('--op-brand-fill', c.fill);
    this.root.style.setProperty('--op-brand-on-fill', c.onFill);
    this.root.style.setProperty('--op-brand-text', c.text.color);
    this.root.style.setProperty('--op-brand-line', c.line.color);
    if (c.text.changed || c.line.changed) {
      const original = contrast(c.fill, bg);
      this.once(
        `adjusted ${key}`,
        `[openpath] ${prop}: ${raw} has a contrast of only ${fmt(original)} on the ${dark ? 'dark' : 'light'} form background ${bg}. ` +
          `Text needs ${MIN_TEXT}:1 and borders and focus rings need ${MIN_LINE}:1, so OpenPath uses ` +
          `${c.text.color} (${fmt(c.text.ratio)}) for text and ${c.line.color} (${fmt(c.line.ratio)}) for borders and outlines. ` +
          `Buttons filled with ${c.fill} use ${c.onFill === '#000000' ? 'black' : 'white'} text (${fmt(c.onFillRatio)}).`,
      );
    }
  }

  checkFontSize() {
    const size = parseFloat(getComputedStyle(this.host).fontSize);
    if (size > 0 && size < MIN_FONT_PX) {
      this.once(`font ${size}`, `[openpath] font-size: ${size}px on <${this.host.localName}> is below ${MIN_FONT_PX}px. OpenPath uses ${MIN_FONT_PX}px so the form stays readable.`);
    }
  }

  once(key, message) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warn(message);
  }
}
