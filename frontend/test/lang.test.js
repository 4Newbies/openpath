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
    expect(t('zz', 'back')).toBe('Back');
    expect(t('zz', 'errors.invalid_date')).toBe(en.strings.errors.invalid_date);
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

  it('languages="..." shows a switcher on the first screen, each option in its own language', async () => {
    const el = await mount(flow, { lang: 'en', languages: 'am,en' }, { prefs: null });
    const options = $$(el, '.op-lang button');
    expect(options.map((b) => [b.textContent, b.getAttribute('lang'), b.getAttribute('aria-pressed')])).toEqual([
      ['አማርኛ', 'am', 'false'],
      ['English', 'en', 'true'],
    ]);
    expect($(el, '.op-lang legend').textContent).toBe('Language');

    options[0].click();
    await vi.waitFor(() => expect(active(el)?.dataset.lang).toBe('am'));
    expect($(el, '.op-root').getAttribute('lang')).toBe('am');
    expect(heading(el)).toBe('ይህን እንዴት መጠቀም ይፈልጋሉ?');
    expect(active(el).getAttribute('aria-pressed')).toBe('true');
    expect(JSON.parse(localStorage.getItem('openpath:prefs')).lang).toBe('am');
  });

  it('remembers the choice, and Settings shows the switcher again', async () => {
    const el = await mount(flow, { lang: 'en', languages: 'en,am' }, { prefs: { chosen: true, lang: 'am' } });
    expect($(el, '.op-root').getAttribute('lang')).toBe('am');
    button(el, 'ቅንብሮች').click();
    expect($$(el, '.op-lang button')).toHaveLength(2);
  });

  it('ignores a saved choice the host no longer offers, and shows no switcher without languages', async () => {
    const el = await mount(flow, { lang: 'en' }, { prefs: { chosen: false, lang: 'am' } });
    expect($(el, '.op-root').getAttribute('lang')).toBe('en');
    expect($(el, '.op-lang')).toBeNull();
  });
});
