import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateFlow } from '../../shared/flow.js';
import { resetPacks } from '../src/messages.js';
import { PROFILE_KEY } from '../src/profile.js';
import { langFile } from './helpers.js';
import '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.resolve(here, `../public/questions/${f}.json`), 'utf8'));
const jobFlow = read('job-application');
const onboarding = read('onboarding');
const $ = (el, sel) => el.shadowRoot.querySelector(sel);
const $$ = (el, sel) => [...el.shadowRoot.querySelectorAll(sel)];
const button = (el, name) => $$(el, 'button').find((b) => b.textContent.trim() === name);
const next = (el) => button(el, 'Next').click();
const type = (input, value) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const pick = (el, value) => {
  const input = $(el, `input[value="${value}"]`);
  input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

async function mountFlow(name, { context, attrs = {} } = {}) {
  localStorage.setItem('openpath:prefs', JSON.stringify({ chosen: true }));
  globalThis.fetch = vi.fn(async (url) => {
    const u = String(url);
    const m = /\/questions\/([a-z-]+)\.json$/.exec(u);
    if (m && fs.existsSync(path.resolve(here, `../public/questions/${m[1]}.json`))) return { ok: true, status: 200, json: async () => read(m[1]) };
    if (m) return { ok: false, status: 404, json: async () => ({}) };
    return langFile(u) ?? Promise.reject(new TypeError('Failed to fetch'));
  });
  const el = document.createElement('openpath-flow');
  el.setAttribute('flow', name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (context) el.context = context;
  document.body.append(el);
  await el.ready;
  return el;
}

beforeEach(() => {
  localStorage.clear();
  resetPacks();
});
afterEach(() => {
  document.body.textContent = '';
  vi.restoreAllMocks();
});

describe('job-application.json', () => {
  it('is a valid flow with voice answers for experience and availability', () => {
    expect(validateFlow(jobFlow)).toEqual([]);
    for (const id of ['fullName', 'phone', 'experienceYears', 'experience', 'startDate', 'workHours']) {
      expect(jobFlow.questions.find((q) => q.id === id).voice, id).toBe(true);
    }
  });

  it('never requires disability or health information: the support question is optional and private', () => {
    const privateOnes = jobFlow.questions.filter((q) => q.private);
    expect(privateOnes.map((q) => q.id)).toEqual(['interviewSupport', 'interviewSupportOther']);
    for (const q of privateOnes) expect(q.required).toBe(false);
    const words = /disab|medical|diagnos|condition|health/i;
    for (const q of jobFlow.questions.filter((x) => x.required)) expect(JSON.stringify(q.label) + JSON.stringify(q.options ?? '')).not.toMatch(words);
    expect(privateOnes[0].hint.en).toMatch(/Do not include medical details/);
  });

  it('prefills name and phone from the onboarding answers (WCAG 3.3.7)', () => {
    expect(jobFlow.questions.find((q) => q.id === 'fullName').prefillFrom[0]).toBe('alx-onboarding.fullName');
    expect(onboarding.questions.filter((q) => q.reuse).map((q) => q.id)).toEqual(['fullName', 'phone']);
  });
});

describe('<openpath-flow flow="job-application">', () => {
  it('loads the flow by name, starts with the earlier name and phone, and says it was filled in', async () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ 'alx-onboarding.fullName': 'Hana Tesfaye', 'alx-onboarding.phone': '+251911234567' }));
    const el = await mountFlow('job-application');
    next(el); // intro
    const name = $(el, 'input[name=fullName]');
    expect(name.value).toBe('Hana Tesfaye');
    const note = $(el, '.op-prefilled');
    expect(note.textContent).toBe('Filled in from your earlier answers. You can change it.');
    expect(name.getAttribute('aria-describedby')).toContain(note.id);
    next(el);
    expect($(el, 'input[type=tel]').value).toBe('911234567');
    expect($(el, '.op-prefilled')).not.toBeNull();
    type($(el, 'input[type=tel]'), '0711 111 222'); // the learner's own answer now
    next(el);
    button(el, 'Back').click();
    expect($(el, '.op-prefilled')).toBeNull();
  });

  it('also prefills from onboarding answers still in progress on this device', async () => {
    localStorage.setItem('openpath:alx-onboarding', JSON.stringify({ flowVersion: onboarding.version, answers: { fullName: 'Abebe Kebede' } }));
    const el = await mountFlow('job-application');
    next(el);
    expect($(el, 'input[name=fullName]').value).toBe('Abebe Kebede');
  });

  it('sends the job with the application; the private support answer is left out of openpath:complete', async () => {
    const context = { jobId: 'sample-data-entry-addis', jobTitle: 'Data entry clerk', organisation: 'Addis Digital Services (sample)' };
    const el = await mountFlow('job-application', { context });
    let detail;
    el.addEventListener('openpath:complete', (e) => (detail = e.detail));
    next(el);
    type($(el, 'input[name=fullName]'), 'Hana Tesfaye');
    next(el);
    type($(el, 'input[type=tel]'), '0911 234 567');
    next(el);
    pick(el, '1-3');
    next(el);
    button(el, 'Skip this question').click(); // experience
    pick(el, 'now');
    next(el);
    pick(el, 'part-time');
    next(el);
    pick(el, 'extra-time');
    next(el);
    button(el, 'Send my answers').click();
    await vi.waitFor(() => expect(detail).toBeDefined());
    expect(detail.context).toEqual(context);
    expect(detail.answers).toEqual({ fullName: 'Hana Tesfaye', phone: '+251911234567', experienceYears: '1-3', startDate: 'now', workHours: ['part-time'] });
    expect('interviewSupport' in detail.answers).toBe(false);
  });

  it('keeps each job application apart on the device', async () => {
    const a = await mountFlow('job-application', { context: { jobId: 'job-a' } });
    next(a);
    type($(a, 'input[name=fullName]'), 'For job A');
    a.remove();
    expect(JSON.parse(localStorage.getItem('openpath:job-application:job-a')).answers.fullName).toBe('For job A');
    const b = await mountFlow('job-application', { context: { jobId: 'job-b' } });
    expect(b.store.state.answers.fullName).toBeUndefined();
  });

  it('shows an error, not the onboarding questions, when a named flow cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = await mountFlow('no-such-flow');
    expect($(el, '.op-error').textContent).toBe('This form could not be loaded. Please try again later.');
    expect($(el, 'h2')).toBeNull();
  });
});

describe('remembering the name and phone for next time', () => {
  async function sendOnboarding() {
    const el = await mountFlow('onboarding');
    el.store.setAnswer('fullName', 'Hana Tesfaye');
    el.store.setAnswer('phone', '+251911234567');
    el.store.setAnswer('dateOfBirth', { date: '2001-03-27', calendar: 'gregorian' });
    el.store.setAnswer('language', 'am');
    el.store.setAnswer('location', 'Adama');
    el.store.setAnswer('idType', 'passport');
    el.store.setAnswer('course', 'data-analytics');
    el.go('review');
    button(el, 'Send my answers').click();
    await vi.waitFor(() => expect($(el, '.op-remember')).not.toBeNull());
    return el;
  }
  const question = 'Remember my name and phone on this device for job applications?';

  it('keeps nothing by default: it asks after sending, with No first', async () => {
    const el = await sendOnboarding();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
    const group = $(el, '.op-remember');
    expect(group.getAttribute('role')).toBe('group');
    expect(el.shadowRoot.getElementById(group.getAttribute('aria-labelledby')).textContent).toBe(question);
    expect([...group.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['No, do not remember', 'Yes, remember them']);
  });

  it('No keeps nothing and clears an earlier copy of the same answers', async () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ 'alx-onboarding.fullName': 'Someone Else', 'other.flow': 'x' }));
    const el = await sendOnboarding();
    button(el, 'No, do not remember').click();
    expect(JSON.parse(localStorage.getItem(PROFILE_KEY))).toEqual({ 'other.flow': 'x' });
    expect($(el, '.op-remember')).toBeNull();
    expect($(el, '.op-profile-note').textContent).toBe('Your name and phone number are not kept on this device.');
    expect(el.shadowRoot.activeElement).toBe($(el, '.op-profile-note'));
  });

  it('Yes keeps the "reuse" answers, says so, and forgets them on request', async () => {
    const el = await sendOnboarding();
    button(el, 'Yes, remember them').click();
    expect(JSON.parse(localStorage.getItem(PROFILE_KEY))).toEqual({ 'alx-onboarding.fullName': 'Hana Tesfaye', 'alx-onboarding.phone': '+251911234567' });
    expect($(el, '.op-profile-note').textContent).toMatch(/kept on this device/);
    expect(el.shadowRoot.activeElement).toBe($(el, '.op-profile-note'));
    button(el, 'Forget them on this device').click();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect($(el, '.op-profile-note').textContent).toBe('Done. They are no longer kept on this device.');
    expect(el.shadowRoot.activeElement).toBe($(el, '.op-profile-note'));
  });

  it('Settings has "Forget my details" when details are kept, and says so when they are not', async () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ 'alx-onboarding.fullName': 'Hana Tesfaye' }));
    const el = await mountFlow('onboarding');
    button(el, 'Settings').click();
    expect($(el, '.op-details h3').textContent).toBe('My details on this device');
    button(el, 'Forget my details').click();
    expect(localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect($(el, '.op-details-note').textContent).toBe('Done. They are no longer kept on this device.');
    expect(el.shadowRoot.activeElement).toBe($(el, '.op-details-note'));
    expect(button(el, 'Forget my details')).toBeUndefined();

    button(el, "Continue with my device's own tools").click();
    button(el, 'Settings').click();
    expect($(el, '.op-details-note').textContent).toBe('Your name and phone number are not kept on this device.');
    expect(button(el, 'Forget my details')).toBeUndefined();
  });
});
