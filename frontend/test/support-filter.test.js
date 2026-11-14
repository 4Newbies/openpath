import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FILTER_KEY } from '../src/jobs.js';
import { resetPacks } from '../src/messages.js';
import { langFile } from './helpers.js';
import '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sample = JSON.parse(fs.readFileSync(path.resolve(here, '../public/jobs/jobs.json'), 'utf8'));
const $ = (el, sel) => el.shadowRoot.querySelector(sel);
const $$ = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];

async function mountJobs(attrs = {}) {
  globalThis.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.endsWith('/jobs.json')) return { ok: true, status: 200, json: async () => structuredClone(sample) };
    return langFile(u) ?? Promise.reject(new TypeError('Failed to fetch'));
  });
  const el = document.createElement('openpath-jobs');
  el.setAttribute('src', '/jobs.json');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  await el.ready;
  return el;
}

function tick(el, id, on = true) {
  const box = $(el, `.op-jobs-filter input[value="${id}"]`);
  box.checked = on;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  localStorage.clear();
  resetPacks();
});
afterEach(() => {
  document.body.textContent = '';
  vi.restoreAllMocks();
});

describe('the private "Support I need" filter', () => {
  it('says plainly that only the learner can see it', async () => {
    const el = await mountJobs();
    const fieldset = $(el, '.op-jobs-filter');
    expect(fieldset.querySelector('legend').textContent).toBe('Support I need');
    const privacy = el.shadowRoot.getElementById(fieldset.getAttribute('aria-describedby'));
    expect(privacy.textContent).toContain('Only you can see this. Employers are not told.');
    expect($$(el, '.op-jobs-filter .op-options input')).toHaveLength(7);
  });

  it('shows only jobs offering all the support ticked, and announces the number', async () => {
    const el = await mountJobs();
    tick(el, 'remote-work');
    expect($$(el, '.op-job')).toHaveLength(2);
    expect($(el, '.op-jobs-count').textContent).toBe('2 of 6 jobs offer all the support you chose.');
    await vi.waitFor(() => expect($(el, '[aria-live]').textContent).toBe('2 of 6 jobs offer all the support you chose.'));
    tick(el, 'sign-language-interview');
    expect($$(el, '.op-job')).toHaveLength(0);
    expect($(el, '.op-jobs-count').textContent).toMatch(/^None of the 6 jobs/);
    tick(el, 'remote-work', false);
    expect($$(el, '.op-job h3').map((h) => h.textContent)).toEqual(['Customer service agent (Amharic and English)', 'Sewing machine operator']);
    $$(el, '.op-jobs-filter button').find((b) => b.textContent === 'Clear my choices').click();
    expect($$(el, '.op-job')).toHaveLength(6);
  });

  it('never leaves the browser: no request, no URL change, not in the apply context', async () => {
    const el = await mountJobs({ api: 'http://api.test' });
    const before = globalThis.fetch.mock.calls.length;
    const url = location.href;
    const events = [];
    for (const name of ['openpath:step', 'openpath:complete', 'openpath:queued', 'change']) document.addEventListener(name, (e) => events.push(e), true);
    tick(el, 'flexible-hours');
    expect(globalThis.fetch.mock.calls.length).toBe(before);
    expect(location.href).toBe(url);
    expect(events.filter((e) => e.type.startsWith('openpath:'))).toEqual([]);
    expect(events.every((e) => !e.composed)).toBe(true); // checkbox changes stay inside the shadow root
    $(el, '.op-job button').click();
    expect(JSON.stringify($(el, 'openpath-flow').context)).not.toMatch(/flexible|support/i);
  });

  it('is not stored unless "Remember on this device" is ticked', async () => {
    const el = await mountJobs();
    tick(el, 'step-free-workplace');
    expect(localStorage.getItem(FILTER_KEY)).toBeNull();
    expect(Object.keys(localStorage).some((k) => localStorage.getItem(k).includes('step-free'))).toBe(false);

    const remember = $$(el, '.op-jobs-filter input').find((i) => !i.value || i.value === 'on');
    remember.checked = true;
    remember.dispatchEvent(new Event('change'));
    expect(JSON.parse(localStorage.getItem(FILTER_KEY))).toEqual(['step-free-workplace']);
    el.remove();

    const again = await mountJobs();
    expect($(again, '.op-jobs-filter input[value="step-free-workplace"]').checked).toBe(true);
    expect($$(again, '.op-job')).toHaveLength(3);

    const rememberAgain = $$(again, '.op-jobs-filter input').find((i) => !i.value || i.value === 'on');
    rememberAgain.checked = false;
    rememberAgain.dispatchEvent(new Event('change'));
    expect(localStorage.getItem(FILTER_KEY)).toBeNull();
  });
});

describe('the filter on phones', () => {
  const screen = (narrow) => {
    globalThis.matchMedia = vi.fn((q) => ({ media: q, matches: narrow && q === '(max-width: 40em)' }));
  };
  afterEach(() => {
    globalThis.matchMedia = undefined;
  });
  const summary = (el) => $(el, 'details.op-jobs-filter-box > summary');

  it('is a native <details>, closed on a narrow screen, with the filter inside', async () => {
    screen(true);
    const el = await mountJobs();
    const details = $(el, 'details.op-jobs-filter-box');
    expect(details.open).toBe(false);
    expect(details.querySelector('fieldset.op-jobs-filter')).not.toBeNull();
    expect(summary(el).textContent).toBe('Support I need');
    expect($(el, '.op-jobs-filter-count').hidden).toBe(true);
  });

  it('is open on a wide screen, as before', async () => {
    screen(false);
    const el = await mountJobs();
    expect($(el, 'details.op-jobs-filter-box').open).toBe(true);
  });

  it('shows the number of active filters in the summary, and stays as the learner left it', async () => {
    screen(true);
    const el = await mountJobs();
    const details = $(el, 'details.op-jobs-filter-box');
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    tick(el, 'remote-work');
    tick(el, 'flexible-hours');
    expect($(el, '.op-jobs-filter-count').hidden).toBe(false);
    expect(summary(el).textContent).toBe('Support I need, Chosen: 2');
    expect($(el, '.op-jobs-filter-count .op-sr').textContent).toBe(', '); // read as a pause, not shown

    el.render(); // e.g. after changing language
    expect($(el, 'details.op-jobs-filter-box').open).toBe(true);
    expect(summary(el).textContent).toBe('Support I need, Chosen: 2');

    $$(el, '.op-jobs-filter button').find((b) => b.textContent === 'Clear my choices').click();
    expect($(el, '.op-jobs-filter-count').hidden).toBe(true);
  });

  it('says the number in Amharic too', async () => {
    screen(true);
    localStorage.setItem(FILTER_KEY, JSON.stringify(['remote-work']));
    const el = await mountJobs({ lang: 'am' });
    expect($(el, '.op-jobs-filter-number').textContent).toBe('የተመረጡ፦ 1');
  });
});
