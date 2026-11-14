import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $, button, heading, mount, type, wait } from './helpers.js';

const flow = {
  version: '1',
  flowId: 'off',
  title: { en: 'Offline' },
  questions: [{ id: 'name', type: 'text', required: true, label: { en: 'Your name' } }],
};
const SAVED_OFFLINE = 'Saved on this device. It will be sent when you are back online.';
const saved = () => JSON.parse(localStorage.getItem('openpath:off'));

// A fake API that can be switched off and on, and records every request.
function fakeApi() {
  const api = { online: false, calls: [], sessions: new Map(), submitted: new Set() };
  api.fetch = vi.fn(async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith('http://api.test')) throw new Error(`unexpected ${u}`);
    const body = init.body ? JSON.parse(init.body) : undefined;
    api.calls.push([init.method ?? 'GET', u.replace('http://api.test/v1', ''), body]);
    if (!api.online) throw new TypeError('Failed to fetch');
    const ok = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
    if (u.endsWith('/health')) return ok({ ok: true });
    if (u.endsWith('/sessions')) {
      // Repeat-safe like the real API: the same clientKey gives the same session.
      if (!api.sessions.has(body.clientKey)) api.sessions.set(body.clientKey, `sid${api.sessions.size + 1}`);
      return ok({ id: api.sessions.get(body.clientKey), resumeCode: 'AAAA-BBBB' }, 201);
    }
    if (u.endsWith('/submit')) {
      const id = u.split('/').at(-2);
      if (api.submitted.has(id)) return ok({ error: { code: 'already_submitted', message: 'x' } }, 409);
      api.submitted.add(id);
      return ok({ status: 'submitted' });
    }
    return ok({});
  });
  return api;
}

let api;
beforeEach(() => {
  localStorage.clear();
  api = fakeApi();
});
afterEach(() => {
  document.body.textContent = '';
  vi.restoreAllMocks();
});

async function mountWithApi() {
  const el = await mount(flow, { api: 'http://api.test' });
  globalThis.fetch = api.fetch;
  return el;
}

describe('when the API cannot be reached', () => {
  it('keeps working: the answer stays on the device, a note says so and it is announced', async () => {
    const el = await mountWithApi();
    type($(el, 'input'), 'Hana');
    button(el, 'Next').click();
    await el.saveChain;
    await wait();
    expect(heading(el)).toBe('Check your answers');
    expect($(el, '.op-offline').textContent).toBe(SAVED_OFFLINE);
    await vi.waitFor(() => expect($(el, '[aria-live]').textContent).toBe(SAVED_OFFLINE));
    expect(saved().answers).toEqual({ name: 'Hana' });

    // Back online: saved to the server and the note goes away.
    api.online = true;
    window.dispatchEvent(new Event('online'));
    await el.saveChain;
    expect($(el, '.op-offline')).toBeNull();
    expect(api.calls.at(-1)).toEqual(['PUT', '/sessions/sid1/answers', { answers: { name: 'Hana' }, step: 'review' }]);
  });

  it('queues "Send", keeps it across a reload, and sends it when the connection returns', async () => {
    const el = await mountWithApi();
    type($(el, 'input'), 'Hana');
    button(el, 'Next').click();
    await el.saveChain;
    const queued = vi.fn();
    document.addEventListener('openpath:queued', queued, { once: true });
    button(el, 'Send my answers').click();
    await wait();
    expect(heading(el)).toBe('Your answers are saved on this device');
    expect(el.shadowRoot.activeElement).toBe($(el, 'h2'));
    await vi.waitFor(() => expect($(el, '[aria-live]').textContent).toBe(SAVED_OFFLINE));
    expect(queued).toHaveBeenCalledOnce();
    expect(saved()).toMatchObject({ pendingSubmit: true, answers: { name: 'Hana' } });
    el.remove();

    // The page is closed and opened again, still offline: the queued screen comes back.
    const again = await mount(flow, { api: 'http://api.test' });
    globalThis.fetch = api.fetch;
    expect(heading(again)).toBe('Your answers are saved on this device');

    let detail;
    again.addEventListener('openpath:complete', (e) => (detail = e.detail));
    api.online = true;
    window.dispatchEvent(new Event('online'));
    await again.saveChain;
    await wait();
    expect(heading(again)).toBe('Thank you. Your answers have been sent.');
    await vi.waitFor(() => expect($(again, '[aria-live]').textContent).toBe('You are back online. Your answers have been sent.'));
    expect(detail).toEqual({ flowId: 'off', sessionId: 'sid1', answers: { name: 'Hana' } });
    expect(localStorage.getItem('openpath:off')).toBeNull();
  });

  it('every retry is safe to repeat: one clientKey, one session, a repeated submit counts as sent', async () => {
    const el = await mountWithApi();
    type($(el, 'input'), 'Hana');
    button(el, 'Next').click();
    await el.saveChain;
    button(el, 'Send my answers').click();
    await wait();
    await el.retryNow(); // still offline
    await el.retryNow();
    const keys = new Set(api.calls.filter(([m, p]) => m === 'POST' && p === '/sessions').map(([, , b]) => b.clientKey));
    expect(keys.size).toBe(1);

    // The submit reached the server, but the reply was lost: the next try gets "already submitted".
    api.online = true;
    api.sessions.set([...keys][0], 'sid1');
    api.submitted.add('sid1');
    await el.retryNow();
    expect(heading(el)).toBe('Thank you. Your answers have been sent.');
    expect(api.sessions.size).toBe(1);
  });

  it('"Try sending now" says it is still waiting; "Change my answers" goes back to the review', async () => {
    const el = await mountWithApi();
    type($(el, 'input'), 'Hana');
    button(el, 'Next').click();
    await el.saveChain;
    button(el, 'Send my answers').click();
    await wait();
    $(el, '[aria-live]').textContent = '';
    button(el, 'Try sending now').click();
    await el.saveChain;
    await wait();
    await vi.waitFor(() => expect($(el, '[aria-live]').textContent).toBe(SAVED_OFFLINE));
    button(el, 'Change my answers').click();
    expect(heading(el)).toBe('Check your answers');
    expect(saved().pendingSubmit).toBe(false);
  });

  it('if the server refuses the queued answers, the learner is taken back to the review', async () => {
    const el = await mountWithApi();
    type($(el, 'input'), 'Hana');
    button(el, 'Next').click();
    await el.saveChain;
    button(el, 'Send my answers').click();
    await wait();
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 'invalid_body', message: 'x' } }) }));
    await el.retryNow();
    expect(heading(el)).toBe('Check your answers');
    expect($(el, '.op-error').textContent).toContain('We could not send your answers');
  });
});
