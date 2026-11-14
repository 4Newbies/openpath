import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $, $$, active, button, heading, mount, pick, type, wait } from './helpers.js';

const flow = {
  version: '1',
  flowId: 'test-flow',
  title: { en: 'Test' },
  questions: [
    { id: 'intro', type: 'info', label: { en: 'Welcome' }, hint: { en: 'No time limit.' } },
    { id: 'name', type: 'text', required: true, autocomplete: 'name', label: { en: 'Your name' }, hint: { en: 'Full name' } },
    { id: 'kind', type: 'single', required: true, label: { en: 'Kind' }, options: [{ value: 'a', label: { en: 'A' } }, { value: 'refer', label: { en: 'Refer me' } }] },
    { id: 'partner', type: 'text', label: { en: 'Partner' }, showIf: { id: 'kind', equals: 'refer' } },
    { id: 'secret', type: 'text', private: true, multiline: true, label: { en: 'Private note' } },
  ],
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  document.body.textContent = '';
  vi.restoreAllMocks();
});

const next = (el) => button(el, 'Next').click();

describe('<openpath-flow>', () => {
  it('uses an open shadow root and sets lang', async () => {
    const el = await mount(flow, { lang: 'en' });
    expect(el.shadowRoot).not.toBeNull();
    expect($(el, '.op-root').getAttribute('lang')).toBe('en');
    expect($(el, '.op-progress').textContent).toBe('Step 1 of 4');
  });

  it('moves focus to the question heading on Next, and Back returns', async () => {
    const el = await mount(flow);
    next(el);
    expect(heading(el)).toContain('Your name');
    expect(active(el)).toBe($(el, 'h2.op-question'));
    expect($(el, 'h2').getAttribute('tabindex')).toBe('-1');
    button(el, 'Back').click();
    expect(heading(el)).toContain('Welcome');
    expect(active(el)).toBe($(el, 'h2.op-question'));
  });

  it('uses a real label, autocomplete and no placeholder', async () => {
    const el = await mount(flow);
    next(el);
    const input = $(el, 'input');
    expect($(el, `label[for="${input.id}"]`).textContent).toContain('Your name');
    expect(input.getAttribute('autocomplete')).toBe('name');
    expect(input.hasAttribute('placeholder')).toBe(false);
    expect(input.hasAttribute('maxlength')).toBe(false);
  });

  it('shows a linked plain-language error, sets aria-invalid, focuses the field and announces it', async () => {
    const el = await mount(flow);
    next(el);
    next(el); // empty required answer
    const input = $(el, 'input');
    const error = $(el, '.op-error');
    expect(error.textContent).toContain('Please type an answer to this question.');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby').split(' ')).toContain(error.id);
    expect(active(el)).toBe(input);
    await wait();
    expect($(el, '[aria-live="polite"]').textContent).toBe('Please type an answer to this question.');
    expect(heading(el)).toContain('Your name'); // did not move on
  });

  it('puts choices in a fieldset with a legend', async () => {
    const el = await mount(flow);
    next(el);
    type($(el, 'input'), 'Hana');
    next(el);
    expect($(el, 'fieldset legend h2').textContent).toContain('Kind');
    expect($$(el, 'input[type=radio]')).toHaveLength(2);
    next(el);
    expect(active(el).type).toBe('radio');
    expect($(el, 'fieldset').getAttribute('aria-describedby')).toContain($(el, '.op-error').id);
  });

  it('honours showIf and offers Skip only on optional questions', async () => {
    const el = await mount(flow);
    next(el);
    expect(() => button(el, 'Skip this question')).toThrow();
    type($(el, 'input'), 'Hana');
    next(el);
    pick($$(el, 'input[type=radio]')[1]); // refer
    expect($(el, '.op-progress').textContent).toBe('Step 3 of 5');
    next(el);
    expect(heading(el)).toContain('Partner');
    button(el, 'Skip this question').click();
    expect(heading(el)).toContain('Private note');
  });

  it('saves on every change and restores after a reload', async () => {
    const first = await mount(flow);
    next(first);
    type($(first, 'input'), 'Hana');
    next(first);
    first.remove();

    const second = await mount(flow);
    expect(heading(second)).toContain('Kind');
    button(second, 'Back').click();
    expect($(second, 'input').value).toBe('Hana');
  });

  it('reviews every answer with Edit, then submits without the API and fires events', async () => {
    const steps = [];
    const done = [];
    document.addEventListener('openpath:step', (e) => steps.push(e.detail.stepId));
    document.addEventListener('openpath:complete', (e) => done.push(e));

    const el = await mount(flow);
    next(el);
    type($(el, 'input'), '  Hana  ');
    next(el);
    pick($$(el, 'input[type=radio]')[0]);
    next(el);
    type($(el, 'textarea'), 'I need help');
    next(el);

    expect(heading(el)).toBe('Check your answers');
    const items = $$(el, '.op-review-item').map((i) => i.querySelector('dt').textContent);
    expect(items).toEqual(['Your name', 'Kind', 'Private note']); // hidden partner left out
    expect(button(el, 'Edit').textContent).toContain('your answer to: Your name');

    // Edit, then Next goes back to the review.
    button(el, 'Edit').click();
    expect(heading(el)).toContain('Your name');
    type($(el, 'input'), 'Hana T');
    next(el);
    expect(heading(el)).toBe('Check your answers');

    button(el, 'Send my answers').click();
    await wait(10);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // only the question file
    expect(done).toHaveLength(1);
    expect(done[0].bubbles).toBe(true);
    expect(done[0].composed).toBe(true);
    expect(done[0].detail.answers).toEqual({ name: 'Hana T', kind: 'a' }); // no private note
    expect(localStorage.getItem('openpath:test-flow')).toBeNull();
    expect(heading(el)).toContain('Thank you');
    expect(steps).toEqual(['intro', 'name', 'kind', 'secret', 'review', 'name', 'review']);
  });

  it('jumps to the first unanswered required question on submit', async () => {
    localStorage.setItem('openpath:test-flow', JSON.stringify({ flowVersion: '1', step: 'review', answers: { name: 'Hana' } }));
    const el = await mount(flow);
    button(el, 'Send my answers').click();
    expect(heading(el)).toContain('Kind');
    expect($(el, '.op-error').textContent).toContain('Please choose one answer.');
    expect(active(el).type).toBe('radio');
  });

  it('renders question text as text, never HTML', async () => {
    const evil = structuredClone(flow);
    evil.questions[0].label.en = '<img src=x onerror="window.__pwned=1">Hi';
    const el = await mount(evil);
    expect($(el, 'img')).toBeNull();
    expect(heading(el)).toContain('<img');
  });

  it('falls back to the default flow when the file is invalid', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = await mount({ ...flow, questions: 'nope' });
    expect(spy).toHaveBeenCalled();
    expect(heading(el)).toContain('Before you start');
  });

  it('talks to the API when the api attribute is set', async () => {
    const calls = [];
    const el = await mount(flow, { api: 'http://api.test' });
    globalThis.fetch = vi.fn(async (url, init) => {
      calls.push([init.method, url, init.body && JSON.parse(init.body)]);
      if (url.endsWith('/v1/sessions')) return { ok: true, json: async () => ({ id: 'sid', resumeCode: 'AAAA-BBBB' }) };
      if (url.endsWith('/submit')) return { ok: true, json: async () => ({ status: 'submitted' }) };
      return { ok: true, json: async () => ({}) };
    });
    let detail;
    el.addEventListener('openpath:complete', (e) => (detail = e.detail));
    next(el);
    type($(el, 'input'), 'Hana');
    next(el);
    await el.saveChain;
    pick($$(el, 'input[type=radio]')[0]);
    next(el);
    button(el, 'Skip this question').click();
    await el.saveChain;
    button(el, 'Send my answers').click();
    await wait(20);
    expect(calls.map(([m, u]) => `${m} ${u.replace('http://api.test', '')}`)).toEqual([
      'POST /v1/sessions',
      'PUT /v1/sessions/sid/answers', // intro (records the step)
      'PUT /v1/sessions/sid/answers', // name
      'PUT /v1/sessions/sid/answers', // kind
      'PUT /v1/sessions/sid/answers', // skipped private note
      'POST /v1/sessions/sid/submit',
    ]);
    expect(calls[0][2]).toEqual({ flowId: 'test-flow', lang: 'en', clientKey: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/) });
    expect(calls[2][2]).toEqual({ answers: { name: 'Hana' }, step: 'kind' });
    expect(detail).toEqual({ flowId: 'test-flow', sessionId: 'sid', answers: { name: 'Hana', kind: 'a' } });
  });

  it('keeps answers and says so when the API fails on submit', async () => {
    const el = await mount(flow, { api: 'http://api.test' });
    localStorage.setItem('x', '1');
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: { code: 'internal', message: 'x' } }) }));
    next(el);
    type($(el, 'input'), 'Hana');
    next(el);
    pick($$(el, 'input[type=radio]')[0]);
    next(el);
    button(el, 'Skip this question').click();
    button(el, 'Send my answers').click();
    await wait(20);
    expect($(el, '.op-error').textContent).toContain('We could not send your answers');
    expect(JSON.parse(localStorage.getItem('openpath:test-flow')).answers.name).toBe('Hana');
    expect(active(el)).toBe(button(el, 'Send my answers'));
  });
});
