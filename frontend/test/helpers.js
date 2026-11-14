import { vi } from 'vitest';
import '../src/index.js';

/** Mount <openpath-flow> with a question file served by a mocked fetch. */
export async function mount(flow, attrs = {}, { prefs = { chosen: true } } = {}) {
  // By default the learner has already answered "How do you want to use
  // this?" with every helper off. Pass prefs: null to see that step.
  if (prefs) localStorage.setItem('openpath:prefs', JSON.stringify(prefs));
  else localStorage.removeItem('openpath:prefs');
  if (flow) {
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith('/q.json')) return { ok: true, json: async () => structuredClone(flow) };
      throw new Error(`unexpected fetch ${url}`);
    });
  }
  const el = document.createElement('openpath-flow');
  if (flow) el.setAttribute('questions', '/q.json');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  await el.ready;
  return el;
}

export const $ = (el, sel) => el.shadowRoot.querySelector(sel);
export const $$ = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];
export const active = (el) => el.shadowRoot.activeElement;

export function button(el, name) {
  const b = $$(el, 'button').find((x) => x.textContent.trim() === name || x.textContent.trim().startsWith(name));
  if (!b) throw new Error(`no button "${name}" in: ${$$(el, 'button').map((x) => x.textContent).join(' | ')}`);
  return b;
}

export function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function pick(input) {
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export const heading = (el) => $(el, 'h2.op-question')?.textContent;
export const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));
