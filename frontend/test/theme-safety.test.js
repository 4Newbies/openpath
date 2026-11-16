// Host theme colours can never make the form inaccessible (theme.js, styles.css).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPacks } from '../src/messages.js';
import {
  adjustForContrast, bestTextOn, brandColours, contrast, MIN_LINE, MIN_TEXT, PALETTES, parseColor, rgbToHsl,
} from '../src/theme.js';
import { $, $$, button, mount, wait } from './helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Line endings normalised: Windows checkouts (core.autocrlf) have CRLF.
const lf = (text) => text.replace(/\r\n/g, '\n');
const CSS = lf(fs.readFileSync(path.resolve(here, '../src/styles.css'), 'utf8'));
const JOBS_CSS = lf(fs.readFileSync(path.resolve(here, '../src/jobs.css'), 'utf8'));

const flow = {
  version: '1',
  flowId: 'theme',
  title: { en: 'Theme' },
  questions: [
    { id: 'name', type: 'text', required: true, label: { en: 'Your name' } },
    { id: 'shift', type: 'single', label: { en: 'Which shift?' }, options: [{ value: 'day', label: { en: 'Day' } }, { value: 'night', label: { en: 'Night' } }] },
  ],
};

// The bad colours from the brief, and a few more forms of writing them.
const BAD = [
  ['pale yellow', '#fff59d', 'light'],
  ['light yellow (named)', 'lightyellow', 'light'],
  ['light grey', '#d3d3d3', 'light'],
  ['light grey, rgb()', 'rgb(211 211 211)', 'light'],
  ['mid-blue on dark', '#3355aa', 'dark'],
  ['mid-blue on dark, hsl()', 'hsl(220, 55%, 40%)', 'dark'],
  ['see-through blue on light', 'rgba(11, 92, 173, 0.25)', 'light'],
];

/** Every text/background pair the form shows, with its WCAG minimum. */
function pairs(palette, brand) {
  const p = PALETTES[palette];
  const accent = brand ? brand.text.color : p.accent;
  const fill = brand ? brand.fill : p.accent;
  const onFill = brand ? brand.onFill : p.accentText;
  const line = brand ? brand.line.color : p.accent;
  return [
    ['text on background', p.text, p.bg, MIN_TEXT],
    ['hints on background', p.muted, p.bg, MIN_TEXT],
    ['errors on background', p.error, p.bg, MIN_TEXT],
    ['text on a selected option', p.text, p.selected, MIN_TEXT],
    ['accent text (links, secondary buttons) on background', accent, p.bg, MIN_TEXT],
    ['text on the primary button', onFill, fill, MIN_TEXT],
    ['accent borders, outlines and checkboxes on background', line, p.bg, MIN_LINE],
    ['input borders on background', p.border, p.bg, MIN_LINE],
  ];
}

const hue = (c) => rgbToHsl(parseColor(c)).h;

let warn;
beforeEach(() => {
  localStorage.clear();
  resetPacks();
  globalThis.matchMedia = undefined;
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  document.body.textContent = '';
  globalThis.matchMedia = undefined;
  vi.restoreAllMocks();
});

const media = (matching) => {
  globalThis.matchMedia = vi.fn((q) => ({ media: q, matches: matching.includes(q), addEventListener() {}, removeEventListener() {} }));
};
const brandVars = (el) => Object.fromEntries(['fill', 'on-fill', 'text', 'line'].map((k) => [k, $(el, '.op-root').style.getPropertyValue(`--op-brand-${k}`)]));

describe('contrast maths (WCAG 2.2)', () => {
  it('measures contrast like WCAG', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#0b5cad', '#ffffff')).toBeCloseTo(6.67, 2);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2); // just fails 4.5:1
  });

  it('reads hex, rgb(), hsl() and common names, and refuses anything else', () => {
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor('hsl(0 100% 50%)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor('LightGrey')).toEqual({ r: 211, g: 211, b: 211, a: 1 });
    for (const bad of ['', 'banana', '#12', 'rgb(1,2)', 'var(--x)']) expect(parseColor(bad), bad).toBeNull();
  });

  it('puts black or white text on a colour, whichever has the higher contrast, and that always passes', () => {
    expect(bestTextOn(parseColor('#fff59d'))).toBe('#000000');
    expect(bestTextOn(parseColor('#0b5cad'))).toBe('#ffffff');
    for (let v = 0; v <= 255; v += 5) {
      for (const c of [{ r: v, g: v, b: v }, { r: v, g: 255 - v, b: 128 }, { r: 255, g: v, b: 0 }]) {
        expect(contrast(c, bestTextOn(c))).toBeGreaterThanOrEqual(MIN_TEXT);
      }
    }
  });

  it('darkens on a light background and lightens on a dark one, step by step, keeping the hue', () => {
    const dark = adjustForContrast('#fff59d', '#ffffff', MIN_TEXT);
    expect(dark.changed).toBe(true);
    expect(contrast(dark.color, '#ffffff')).toBeGreaterThanOrEqual(MIN_TEXT);
    expect(Math.abs(hue(dark.color) - hue('#fff59d'))).toBeLessThan(3);
    // Smallest step that passes: one step lighter would fail.
    const hsl = rgbToHsl(parseColor(dark.color));
    expect(contrast(parseColor(`hsl(${hsl.h} ${hsl.s}% ${hsl.l + 1.5}%)`), '#ffffff')).toBeLessThan(MIN_TEXT + 0.6);

    const light = adjustForContrast('#3355aa', PALETTES.dark.bg, MIN_TEXT);
    expect(light.changed).toBe(true);
    expect(contrast(light.color, PALETTES.dark.bg)).toBeGreaterThanOrEqual(MIN_TEXT);
    expect(Math.abs(hue(light.color) - hue('#3355aa'))).toBeLessThan(3);

    expect(adjustForContrast('#0b5cad', '#ffffff', MIN_TEXT)).toMatchObject({ color: '#0b5cad', changed: false });
  });
});

describe('the built-in palettes', () => {
  // theme.js keeps a copy of the palettes; they must be the ones in styles.css.
  const block = (start) => CSS.slice(CSS.indexOf(start), CSS.indexOf('}', CSS.indexOf(start)));
  const token = (text, name) => new RegExp(`--op-${name}:\\s*(?:var\\(--op-brand-[a-z-]+,\\s*)?(#[0-9a-f]{3,6})`, 'i').exec(text)?.[1];
  const long = (hex) => (hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex).toLowerCase();

  it('theme.js knows the same colours as styles.css', () => {
    const light = block('.op-root {\n  --op-accent');
    const dark = block(".op-root[data-theme='dark'] {");
    for (const [name, css] of [['light', light], ['dark', dark]]) {
      const p = PALETTES[name];
      expect(long(token(css, 'bg')), name).toBe(p.bg);
      expect(long(token(css, 'text')), name).toBe(p.text);
      expect(long(token(css, 'muted')), name).toBe(p.muted);
      expect(long(token(css, 'error')), name).toBe(p.error);
      expect(long(token(css, 'border')), name).toBe(p.border);
      expect(long(token(css, 'selected')), name).toBe(p.selected);
      expect(long(token(css, 'accent')), name).toBe(p.accent);
      expect(long(token(css, 'accent-text')), name).toBe(p.accentText);
    }
  });

  it('every text/background pair passes without any host colour', () => {
    for (const palette of ['light', 'dark']) {
      for (const [what, fg, bg, min] of pairs(palette)) expect(contrast(fg, bg), `${palette}: ${what}`).toBeGreaterThanOrEqual(min);
    }
  });

  it('the form reads host colours only through theme.js, never directly', () => {
    expect(CSS + JOBS_CSS).not.toMatch(/var\(--openpath-color/);
  });
});

describe('bad host colours are corrected', () => {
  for (const [name, raw, palette] of BAD) {
    it(`${name} (${raw}): every text/background pair still passes`, () => {
      const brand = brandColours(raw, PALETTES[palette].bg);
      for (const [what, fg, bg, min] of pairs(palette, brand)) {
        expect(contrast(fg, bg), `${what}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(min);
      }
    });
  }

  it('in the form: measured at start, corrected, and the developer is told the original, new value and ratio', async () => {
    const el = await mount(flow, { style: '--openpath-color: #fff59d' });
    const v = brandVars(el);
    expect(v.fill).toBe('#fff59d'); // the brand colour itself stays on the button
    expect(v['on-fill']).toBe('#000000'); // with black text
    expect(contrast(v.text, '#ffffff')).toBeGreaterThanOrEqual(MIN_TEXT);
    expect(contrast(v.line, '#ffffff')).toBeGreaterThanOrEqual(MIN_LINE);
    expect(warn).toHaveBeenCalledOnce();
    const message = warn.mock.calls[0][0];
    expect(message).toContain('--openpath-color: #fff59d');
    expect(message).toMatch(/only 1\.\d\d:1/); // the original ratio
    expect(message).toContain(`${v.text} (`); // the adjusted value with its ratio
    expect(message).toMatch(/\(4\.\d\d:1\) for text/);
    expect(message).toContain(v.line);
  });

  it('measures again when the host changes its colour, and stops when it is removed', async () => {
    const el = await mount(flow, { style: '--openpath-color: #0b5cad' });
    expect(brandVars(el).text).toBe('#0b5cad'); // already fine: used as it is, no warning
    expect(warn).not.toHaveBeenCalled();

    el.style.setProperty('--openpath-color', '#d3d3d3'); // light grey
    await wait();
    const v = brandVars(el);
    expect(v['on-fill']).toBe('#000000');
    expect(contrast(v.text, '#ffffff')).toBeGreaterThanOrEqual(MIN_TEXT);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain('#d3d3d3');

    el.style.removeProperty('--openpath-color');
    await wait();
    expect(brandVars(el)).toEqual({ fill: '', 'on-fill': '', text: '', line: '' }); // back to the built-in colour
  });

  it('also when the page sets the colour on a parent element', async () => {
    document.body.style.setProperty('--openpath-color', 'lightyellow');
    const el = await mount(flow);
    expect(contrast(brandVars(el).text, '#ffffff')).toBeGreaterThanOrEqual(MIN_TEXT);
    document.body.style.removeProperty('--openpath-color');
  });

  it('warns once for the same colour, however often the form re-renders', async () => {
    const el = await mount(flow, { style: '--openpath-color: #fff59d' });
    el.render();
    el.render();
    await wait();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('ignores a value it cannot read, with a warning', async () => {
    const el = await mount(flow, { style: '--openpath-color: brandblue' });
    expect(brandVars(el).text).toBe('');
    expect(warn.mock.calls[0][0]).toMatch(/"brandblue" is not a colour/);
  });

  it('in dark colours checks --openpath-color-dark against the dark background (mid-blue gets lighter)', async () => {
    const el = await mount(flow, { theme: 'dark', style: '--openpath-color: #fff59d; --openpath-color-dark: #3355aa' });
    const v = brandVars(el);
    expect(v.fill).toBe('#3355aa');
    expect(v['on-fill']).toBe('#ffffff');
    expect(contrast(v.text, PALETTES.dark.bg)).toBeGreaterThanOrEqual(MIN_TEXT);
    expect(parseColor(v.text).b).toBeGreaterThan(0xaa); // lighter, still blue
    expect(warn.mock.calls[0][0]).toContain('dark form background #1b1b1f');
  });

  it("follows the theme: the device's dark mode counts only with theme=\"auto\", and a change is measured again", async () => {
    media(['(prefers-color-scheme: dark)']);
    const el = await mount(flow, { style: '--openpath-color-dark: #3355aa' }); // light by default
    expect(brandVars(el).text).toBe('');
    el.setAttribute('theme', 'auto');
    await vi.waitFor(() => expect($(el, '.op-root').getAttribute('data-theme')).toBe('auto'));
    await wait();
    expect(contrast(brandVars(el).text, PALETTES.dark.bg)).toBeGreaterThanOrEqual(MIN_TEXT);
  });

  it('<openpath-jobs> is protected the same way', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }));
    const jobs = document.createElement('openpath-jobs');
    jobs.setAttribute('src', '/jobs.json');
    jobs.style.setProperty('--openpath-color', '#d3d3d3');
    document.body.append(jobs);
    await jobs.ready;
    expect(contrast(jobs.shadowRoot.querySelector('.op-root').style.getPropertyValue('--op-brand-text'), '#ffffff')).toBeGreaterThanOrEqual(MIN_TEXT);
  });
});

describe('high contrast and forced colours ignore host colours', () => {
  const MODES = [
    ['.op-root[data-high-contrast] {', '#000'],
    ['@media (prefers-contrast: more) {', '#000'],
    [".op-root[data-theme='dark'][data-high-contrast] {", '#ffeb3b'],
    ["@media (prefers-contrast: more) {\n  .op-root[data-theme='dark'] {", '#ffeb3b'],
    ["@media (prefers-color-scheme: dark) {\n  .op-root[data-theme='auto'][data-high-contrast] {", '#ffeb3b'],
    ['@media (prefers-color-scheme: dark) and (prefers-contrast: more) {', '#ffeb3b'],
  ];

  for (const [start, accent] of MODES) {
    it(`${start.split('\n').pop()} sets every accent token itself`, () => {
      const at = CSS.indexOf(start);
      expect(at, start).toBeGreaterThan(-1);
      const block = CSS.slice(at, CSS.indexOf('}', at));
      for (const t of ['accent', 'accent-line', 'accent-fill']) expect(block).toMatch(new RegExp(`--op-${t}: ${accent};`));
      expect(block).toMatch(/--op-accent-text: #(000|fff);/);
      expect(block).not.toMatch(/--op-brand|--openpath/);
    });
  }

  it('forced-colors uses the device colours for every accent token', () => {
    const at = CSS.indexOf('@media (forced-colors: active) {');
    const block = CSS.slice(at, CSS.indexOf('}', at));
    for (const t of ['accent', 'accent-line', 'accent-fill', 'accent-text']) expect(block).toMatch(new RegExp(`--op-${t}: [A-Z][a-zA-Z]+;`));
  });

  it("the learner's High contrast: nothing from the host is written, and it comes back when turned off", async () => {
    const el = await mount(flow, { style: '--openpath-color: #fff59d' }, { prefs: { chosen: true, highContrast: true } });
    expect($(el, '.op-root').hasAttribute('data-high-contrast')).toBe(true);
    expect(brandVars(el)).toEqual({ fill: '', 'on-fill': '', text: '', line: '' });
    $(el, '.op-root').removeAttribute('data-high-contrast');
    await wait();
    expect(brandVars(el).fill).toBe('#fff59d');
  });

  it("the device's high contrast and forced colors: nothing from the host is written", async () => {
    for (const q of ['(prefers-contrast: more)', '(forced-colors: active)']) {
      media([q]);
      const el = await mount(flow, { style: '--openpath-color: #fff59d' });
      expect(brandVars(el), q).toEqual({ fill: '', 'on-fill': '', text: '', line: '' });
      el.remove();
    }
  });
});

describe('host font size', () => {
  it('never below 16px: the CSS keeps a 16px floor, and the developer is told', async () => {
    expect(CSS).toMatch(/\.op-root \{[^}]*font-size: max\(16px, 1em\);/);
    expect(CSS).toMatch(/\.op-root\[data-text-size='150'\] \{\s*font-size: max\(24px, 1\.5em\);/);
    expect(CSS).toMatch(/\.op-root\[data-text-size='200'\] \{\s*font-size: max\(32px, 2em\);/);
    await mount(flow, { style: 'font-size: 12px' });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/font-size: 12px on <openpath-flow> is below 16px/);
  });

  it('says nothing for 16px and above', async () => {
    await mount(flow, { style: 'font-size: 16px' });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('never colour alone', () => {
  it('an error has a warning icon and words, the field says it is invalid, and "Error:" is read out', async () => {
    const el = await mount(flow);
    button(el, 'Next').click();
    const error = $(el, '.op-error');
    const icon = error.querySelector('svg');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(error.querySelector('.op-sr').textContent).toBe('Error: ');
    expect(error.textContent).toBe('Error: Please type an answer to this question.');
    expect($(el, 'input').getAttribute('aria-invalid')).toBe('true');
  });

  it('a send error on the review screen has the icon too', async () => {
    const el = await mount(flow, { api: 'http://api.test' });
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 'invalid_body', message: 'x' } }) }));
    el.store.setAnswer('name', 'Hana');
    el.go('review');
    button(el, 'Send my answers').click();
    await vi.waitFor(() => expect($(el, '.op-error svg')).not.toBeNull());
  });

  it('required and optional questions are told apart by words, not colour', async () => {
    const el = await mount(flow);
    expect($(el, 'input').getAttribute('aria-required')).toBe('true');
    expect($(el, '.op-optional')).toBeNull(); // required: no "(optional)"
    el.store.setAnswer('name', 'Hana');
    el.go('shift');
    expect($(el, '.op-optional').textContent).toBe('(optional)');
  });

  it('a selected option is a ticked native radio button or checkbox, not only a coloured row', async () => {
    const el = await mount(flow);
    el.store.setAnswer('name', 'Hana');
    el.go('shift');
    const radio = $(el, 'input[value="night"]');
    radio.click();
    expect(radio.type).toBe('radio');
    expect(radio.checked).toBe(true);
    // The native control is never hidden or restyled away.
    expect(CSS).not.toMatch(/\.op-option input\s*\{[^}]*(appearance:\s*none|opacity:\s*0)/);
  });

  it('the chosen language is ticked as well as coloured', async () => {
    const el = await mount(flow, { lang: 'en', languages: 'en,am' }, { prefs: { chosen: true, lang: 'en' } });
    button(el, 'Settings').click();
    const pressed = $(el, '.op-lang [aria-pressed="true"]');
    const tick = pressed.querySelector('.op-lang-check');
    expect(tick.textContent).toBe('✓');
    // Decorative: aria-pressed gives the state, and the accessible name stays "English"
    // (no "check mark" read out, and voice users say just the language, WCAG 2.5.3).
    expect(tick.getAttribute('aria-hidden')).toBe('true');
    const name = [...pressed.childNodes].filter((n) => n.getAttribute?.('aria-hidden') !== 'true').map((n) => n.textContent).join('');
    expect(name).toBe('English');
    expect($$(el, '.op-lang [aria-pressed="false"] .op-lang-check')).toHaveLength(0);
  });
});
