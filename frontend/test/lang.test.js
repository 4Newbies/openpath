import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPack, packInfo, registerPack, resetPacks, t, tList, validatePack } from '../src/messages.js';
import { $, $$, active, button, heading, mount } from './helpers.js';

const LANG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../lang');
const packFiles = fs.readdirSync(LANG_DIR).filter((f) => f.endsWith('.json'));
const readPack = (f) => JSON.parse(fs.readFileSync(path.join(LANG_DIR, f), 'utf8'));
const en = readPack('en.json');

const flow = {
  version: '1',
  flowId: 'lang-test',
  title: { en: 'Join', am: 'ይቀላቀሉ' },
  questions: [{ id: 'name', type: 'text', required: true, label: { en: 'Your name', am: 'ስምዎ' } }],
};

beforeEach(() => {
  localStorage.clear();
  document.body.textContent = '';
  resetPacks();
});
afterEach(() => vi.restoreAllMocks());

const langFetches = () => globalThis.fetch.mock.calls.map(([u]) => String(u)).filter((u) => u.includes('/lang/'));

describe('language pack files', () => {
  const keys = (o, prefix = '') =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));

  it.each(packFiles)('%s is a valid pack whose code matches its file name', (f) => {
    const pack = readPack(f);
    expect(validatePack(pack)).toEqual([]);
    expect(`${pack.code}.json`).toBe(f);
  });

  it.each(packFiles.filter((f) => f !== 'en.json'))('%s has every English string', (f) => {
    const have = new Set(keys(readPack(f).strings));
    expect(keys(en.strings).filter((k) => !have.has(k))).toEqual([]);
  });

  it('English is bundled; nothing is fetched for it', () => {
    expect(t('en', 'next')).toBe('Next');
    expect(packInfo('en')).toMatchObject({ code: 'en', name: 'English', dir: 'ltr' });
  });

  it('a missing string falls back to English, a missing list too', () => {
    registerPack({ code: 'zz', name: 'Zed', dir: 'ltr', strings: { next: 'Zed next' } });
    expect(t('zz', 'next')).toBe('Zed next');
    expect(String(t('zz', 'back'))).toBe('Back');
    expect(t('zz', 'back')).toMatchObject({ lang: 'en' }); // marked as English
    expect(typeof t('zz', 'next')).toBe('string'); // translated text is a plain string
    expect(String(t('zz', 'errors.invalid_date'))).toBe(en.strings.errors.invalid_date);
    expect(tList('zz', 'gregorianMonths')[0]).toBe('January');
  });

  it('rejects broken packs and falls back to English with a console warning', async () => {
    const log = { warn: vi.fn() };
    const bad = { code: 'qq', name: 'Q', dir: 'sideways', strings: {} };
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => bad }));
    await expect(loadPack('qq', '/lang/', { fetchImpl, log })).resolves.toBeNull();
    expect(log.warn.mock.calls[0][0]).toMatch(/Could not load the language pack "\/lang\/qq\.json".*dir must be/);
    await expect(loadPack('../x', '/lang/', { fetchImpl, log })).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1); // never fetched a non-code
  });
});

describe('<openpath-flow> languages', () => {
  it('loads a pack on demand and sets lang and dir on the form root', async () => {
    const el = await mount(flow, { lang: 'en' });
    expect(langFetches()).toEqual([]); // English: no pack request
    el.remove();

    const am = await mount(flow, { lang: 'am' });
    expect(langFetches()).toEqual(['http://localhost:3000/lang/am.json']);
    expect($(am, '.op-root').getAttribute('lang')).toBe('am');
    expect($(am, '.op-root').getAttribute('dir')).toBe('ltr');
    expect(heading(am)).toContain('ስምዎ');
    expect(button(am, 'ቀጣይ')).toBeTruthy();
  });

  it('uses lang-path when given', async () => {
    await mount(flow, { lang: 'am', 'lang-path': '/static/openpath/lang' });
    expect(langFetches()).toEqual(['http://localhost:3000/static/openpath/lang/am.json']);
  });

  it('a pack that cannot be loaded means English, and the form still works', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = await mount(flow, { lang: 'xx' });
    expect($(el, '.op-root').getAttribute('lang')).toBe('en');
    expect(button(el, 'Next')).toBeTruthy();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('with several languages, the first screen asks only for the language', async () => {
    const el = await mount(flow, { lang: 'en', languages: 'am,en' }, { prefs: null });
    // A heading in every offered language, each part marked with its language.
    expect([...$(el, 'h2').querySelectorAll('span[lang]')].map((s) => [s.lang, s.textContent])).toEqual([
      ['am', 'ቋንቋዎን ይምረጡ'],
      ['en', 'Choose your language'],
    ]);
    const choices = $$(el, '.op-lang-choice');
    expect(choices.map((b) => [b.textContent, b.getAttribute('lang')])).toEqual([
      ['አማርኛ', 'am'],
      ['English', 'en'],
    ]);
    expect($$(el, 'button').length).toBe(2); // nothing else: no Settings, no helpers yet
    expect($(el, '.op-lang-choices').getAttribute('aria-labelledby')).toBe($(el, 'h2').id);

    choices[0].click();
    await vi.waitFor(() => expect(heading(el)).toBe('ይህን እንዴት መጠቀም ይፈልጋሉ?'));
    expect($(el, '.op-root').getAttribute('lang')).toBe('am');
    expect(active(el)).toBe($(el, 'h2'));
    expect(JSON.parse(localStorage.getItem('openpath:prefs')).lang).toBe('am');
  });

  it('a question called "language" is a question, not the language screen', async () => {
    const withLanguageQuestion = {
      ...flow,
      flowId: 'lang-q',
      questions: [...flow.questions, { id: 'language', type: 'single', label: { en: 'Which language for learning?' }, options: [{ value: 'en', label: { en: 'English' } }] }],
    };
    const el = await mount(withLanguageQuestion, { lang: 'en', languages: 'en,am' }, { prefs: null });
    expect($$(el, '.op-lang-choice')).toHaveLength(2);
    $(el, '.op-lang-choice[lang=en]').click();
    await vi.waitFor(() => expect(heading(el)).toBe('How do you want to use this?'));
    button(el, "Continue with my device's own tools").click();
    el.store.setAnswer('name', 'Hana');
    button(el, 'Next').click();
    expect(heading(el)).toContain('Which language for learning?');
    expect($$(el, '.op-lang-choice')).toHaveLength(0);
  });

  it('skips the language screen with one language, or once a language is chosen', async () => {
    const one = await mount(flow, { lang: 'en', languages: 'en' }, { prefs: null });
    expect(heading(one)).toBe('How do you want to use this?');
    one.remove();
    const chosen = await mount(flow, { lang: 'en', languages: 'en,am' }, { prefs: { chosen: false, lang: 'am' } });
    expect(heading(chosen)).toBe('ይህን እንዴት መጠቀም ይፈልጋሉ?');
  });

  it('the language can still be changed in Settings, each option in its own language', async () => {
    const el = await mount(flow, { lang: 'en', languages: 'am,en' }, { prefs: { chosen: true, lang: 'en' } });
    button(el, 'Settings').click();
    const options = $$(el, '.op-lang button');
    expect(options.map((b) => [b.textContent, b.getAttribute('lang'), b.getAttribute('aria-pressed')])).toEqual([
      ['አማርኛ', 'am', 'false'],
      ['English', 'en', 'true'],
    ]);
    options[0].click();
    await vi.waitFor(() => expect(active(el)?.dataset.lang).toBe('am'));
    expect(heading(el)).toBe('ይህን እንዴት መጠቀም ይፈልጋሉ?');
    expect(active(el).getAttribute('aria-pressed')).toBe('true');
  });

  it('remembers the choice, and Settings shows the switcher again', async () => {
    const el = await mount(flow, { lang: 'en', languages: 'en,am' }, { prefs: { chosen: true, lang: 'am' } });
    expect($(el, '.op-root').getAttribute('lang')).toBe('am');
    button(el, 'ቅንብሮች').click();
    expect($$(el, '.op-lang button')).toHaveLength(2);
  });

  it('Arabic (draft pack) lays the form out right to left; English fallback text keeps lang="en" dir="ltr"', async () => {
    expect(readPack('ar.json')).toMatchObject({ dir: 'rtl', draft: true, note: expect.stringMatching(/DRAFT.*native Arabic speaker/s) });
    const el = await mount(flow, { lang: 'ar' });
    expect($(el, '.op-root').getAttribute('dir')).toBe('rtl');
    expect($(el, '.op-root').getAttribute('lang')).toBe('ar');
    expect(button(el, 'التالي')).toBeTruthy();
    const q = $(el, 'h2 label span');
    expect([q.textContent, q.getAttribute('lang'), q.getAttribute('dir')]).toEqual(['Your name', 'en', 'ltr']);
    expect($(el, '.op-title').getAttribute('lang')).toBe('en');
  });

  it('interface text that falls back to English is marked lang="en" (and dir="ltr" in a right-to-left form)', async () => {
    // A right-to-left pack that only translates "Next" and the error for an empty answer.
    registerPack({ code: 'zz', name: 'Zed', dir: 'rtl', strings: { next: 'Zed-next', errors: { required_text: 'Zed-required' } } });
    const el = await mount({ ...flow, questions: [{ ...flow.questions[0] }, { id: 'more', type: 'text', label: { en: 'More' } }] }, { lang: 'zz' });
    const next = button(el, 'Zed-next');
    expect([next.getAttribute('lang'), next.getAttribute('dir')]).toEqual([null, null]);
    const settings = button(el, 'Settings');
    expect([settings.getAttribute('lang'), settings.getAttribute('dir')]).toEqual(['en', 'ltr']);
    const progress = $(el, '.op-progress');
    expect([progress.textContent, progress.getAttribute('lang')]).toEqual(['Step 1 of 2', 'en']);
    next.click();
    expect($(el, '.op-error').textContent).toContain('Zed-required');
    expect($(el, '.op-error .op-sr').getAttribute('lang')).toBe('en'); // "Error: " came from English
    expect($(el, '.op-error [lang]:not(.op-sr)')).toBeNull(); // the translated message is not marked
    el.remove();

    // In a left-to-right pack only lang is added.
    registerPack({ code: 'yy', name: 'Why', dir: 'ltr', strings: { next: 'Why-next' } });
    const ltr = await mount(flow, { lang: 'yy' });
    expect([button(ltr, 'Settings').getAttribute('lang'), button(ltr, 'Settings').getAttribute('dir')]).toEqual(['en', null]);
    expect(button(ltr, 'Why-next').getAttribute('lang')).toBeNull();
  });

  it.each(['styles.css', 'jobs.css'])('%s uses only logical properties, so it works in both directions', (file) => {
    // Comments and viewport media queries (which are about the screen, not text direction) are left out.
    const css = fs.readFileSync(path.resolve(LANG_DIR, `../src/${file}`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '{');
    const physical = css.match(/(^|[\s;{])((margin|padding|border)-(left|right|top|bottom)|left|right|top|bottom|float|(min-|max-)?(width|height))\s*:|text-align:\s*(left|right)/gm);
    expect(physical).toBeNull();
  });

  it('ignores a saved choice the host no longer offers, and shows no switcher without languages', async () => {
    const el = await mount(flow, { lang: 'en' }, { prefs: { chosen: false, lang: 'am' } });
    expect($(el, '.op-root').getAttribute('lang')).toBe('en');
    expect($(el, '.op-lang')).toBeNull();
  });
});
