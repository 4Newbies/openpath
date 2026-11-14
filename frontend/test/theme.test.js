import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPacks } from '../src/messages.js';
import { $, button, mount } from './helpers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const flow = { version: '1', flowId: 'theme', title: { en: 'Theme' }, questions: [{ id: 'name', type: 'text', label: { en: 'Name' } }] };
const theme = (el) => $(el, '.op-root').getAttribute('data-theme');

beforeEach(() => {
  localStorage.clear();
  resetPacks();
});
afterEach(() => {
  document.body.textContent = '';
  vi.restoreAllMocks();
});

describe('colour theme', () => {
  it('is light by default, whatever the device says', async () => {
    expect(theme(await mount(flow))).toBe('light');
  });

  it('follows the host: theme="dark", "auto" (follow the device), anything else means light', async () => {
    expect(theme(await mount(flow, { theme: 'dark' }))).toBe('dark');
    expect(theme(await mount(flow, { theme: 'auto' }))).toBe('auto');
    const el = await mount(flow, { theme: 'purple' });
    expect(theme(el)).toBe('light');
    el.setAttribute('theme', 'dark');
    expect(theme(el)).toBe('dark');
  });

  it('the learner can choose "Dark colours" in Settings; it shows at once and is remembered', async () => {
    const el = await mount(flow, {}, { prefs: { chosen: true } });
    button(el, 'Settings').click();
    const box = [...el.shadowRoot.querySelectorAll('.op-setup input')].find((i) => i.value === 'dark');
    expect(el.shadowRoot.querySelector(`label[for="${box.id}"]`).textContent).toBe('Dark colours');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    expect(theme(el)).toBe('dark'); // preview, before Continue
    button(el, 'Continue with these helpers').click();
    expect(JSON.parse(localStorage.getItem('openpath:prefs')).dark).toBe(true);
    el.remove();
    expect(theme(await mount(flow, { theme: 'light' }, { prefs: { chosen: true, dark: true } }))).toBe('dark');
  });

  it('the job list follows the same theme attribute and the learner\'s choice', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ '@graph': [] }) }));
    const make = async (attrs, prefs) => {
      if (prefs) localStorage.setItem('openpath:prefs', JSON.stringify(prefs));
      const el = document.createElement('openpath-jobs');
      el.setAttribute('src', '/jobs.json');
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      document.body.append(el);
      await el.ready;
      return el;
    };
    expect(theme(await make({}))).toBe('light');
    expect(theme(await make({ theme: 'auto' }))).toBe('auto');
    expect(theme(await make({}, { dark: true }))).toBe('dark');
  });

  it('the stylesheet only uses the device dark mode for theme="auto"; contrast and motion are still automatic', () => {
    const css = fs.readFileSync(path.resolve(here, '../src/styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks = [...css.matchAll(/@media[^{]*prefers-color-scheme:\s*dark[^{]*\{([^{}]*\{[^}]*\})+\s*\}/g)].map((m) => m[0]);
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      for (const selector of block.match(/\.op-root[^{]*\{/g)) expect(selector).toContain("[data-theme='auto']");
    }
    expect(css).toMatch(/@media \(prefers-contrast: more\)/);
    expect(css).toMatch(/@media \(forced-colors: active\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });
});
