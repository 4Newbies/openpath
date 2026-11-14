import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFlow, defaultFlow } from '../src/loader.js';
import { createStore, storageKey } from '../src/store.js';

beforeEach(() => localStorage.clear());

describe('store: save and restore', () => {
  it('writes to localStorage on every change', () => {
    const store = createStore(defaultFlow);
    store.setAnswer('fullName', 'Hana');
    expect(JSON.parse(localStorage.getItem(storageKey(defaultFlow))).answers).toEqual({ fullName: 'Hana' });
    store.setStep('phone');
    expect(JSON.parse(localStorage.getItem(storageKey(defaultFlow))).step).toBe('phone');
  });

  it('restores answers, step, preferences and session on load', () => {
    const a = createStore(defaultFlow);
    a.setAnswer('access', ['larger-text']);
    a.setAnswer('fullName', 'Hana');
    a.setStep('dateOfBirth');
    a.setSession('s1', 'ABCD-EFGH');

    const b = createStore(defaultFlow);
    expect(b.restored).toBe(true);
    expect(b.state.answers).toEqual({ access: ['larger-text'], fullName: 'Hana' });
    expect(b.state.step).toBe('dateOfBirth');
    expect(b.state.preferences.access).toEqual(['larger-text']);
    expect(b.state.sessionId).toBe('s1');
  });

  it('starts over when the question file version changes, and drops unknown ids', () => {
    localStorage.setItem(storageKey(defaultFlow), JSON.stringify({ flowVersion: 'old', answers: { fullName: 'x' } }));
    expect(createStore(defaultFlow).state.answers).toEqual({});

    localStorage.setItem(storageKey(defaultFlow), JSON.stringify({ flowVersion: defaultFlow.version, answers: { fullName: 'x', removed: 1 } }));
    expect(createStore(defaultFlow).state.answers).toEqual({ fullName: 'x' });
  });

  it('survives corrupt or blocked storage', () => {
    localStorage.setItem(storageKey(defaultFlow), '{not json');
    expect(createStore(defaultFlow).restored).toBe(false);
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem() {} };
    const store = createStore(defaultFlow, { storage: blocked });
    store.setAnswer('fullName', 'ok');
    expect(store.state.answers.fullName).toBe('ok');
  });

  it('clear() removes saved progress', () => {
    const store = createStore(defaultFlow);
    store.setAnswer('fullName', 'Hana');
    store.clear();
    expect(localStorage.getItem(storageKey(defaultFlow))).toBeNull();
    expect(store.state.answers).toEqual({});
  });
});

describe('loader', () => {
  const ok = (body) => vi.fn(async () => ({ ok: true, json: async () => body }));

  it('uses a valid file', async () => {
    const custom = { version: '2', flowId: 'mini', title: { en: 'Mini' }, questions: [{ id: 'n', type: 'text', label: { en: 'Name' } }] };
    const r = await loadFlow('/q.json', { fetchImpl: ok(custom) });
    expect(r.flow.flowId).toBe('mini');
  });

  it('falls back to the default with a clear console error when the file is invalid', async () => {
    const log = { error: vi.fn() };
    const r = await loadFlow('/bad.json', { fetchImpl: ok({ flowId: 'x', questions: [] }), log });
    expect(r.flow).toBe(defaultFlow);
    expect(log.error).toHaveBeenCalledOnce();
    expect(log.error.mock.calls[0][0]).toMatch(/question file "\/bad\.json" is invalid.*default onboarding questions/s);
    expect(log.error.mock.calls[0][0]).toMatch(/questions must be a non-empty array/);
  });

  it('falls back when the file cannot be fetched', async () => {
    const log = { error: vi.fn() };
    const r = await loadFlow('/missing.json', { fetchImpl: vi.fn(async () => ({ ok: false, status: 404 })), log });
    expect(r.flow).toBe(defaultFlow);
    expect(log.error.mock.calls[0][0]).toMatch(/Could not load.*404/);
  });
});
