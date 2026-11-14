// Real-browser accessibility check for <openpath-flow> and <openpath-jobs>, using the Chrome or
// Edge already installed on this machine (playwright-core, no download).
//
//   npm run build && npm run test:browser          (all languages)
//   OPENPATH_LANGS=ar npm run test:browser         (only some languages)
//   OPENPATH_PAGES=jobs,employer npm run test:browser  (only some pages: flow, jobs, employer)
//
// The employer walks post test jobs to the API; run against the in-memory
// API (npm run dev:memory) if you don't want them in your database.
//
// Walks the whole default flow in English, Amharic and Arabic (right to
// left), once per mode: every helper off, each helper on by itself, bigger
// text + high contrast at 320px (= 400% zoom), dark mode at 320px, and 640px
// (200% zoom). The language is chosen with the form's own language switcher.
// On every screen it checks:
//   axe (WCAG 2.2 AA, incl. colour contrast) has no serious/critical issues,
//   no sideways scroll, targets >= 44x44px, text >= 18px, lang and dir on the
//   form, focus lands on the question heading, errors are linked and
//   announced, the 3px focus ring, no requests leave this machine, and
//   nothing is spoken unless read-aloud is on. It also checks that Back/Next
//   follow the reading direction and the phone box stays left to right.
//   Read-aloud and voice use fake providers registered by the page
//   (OpenPath.setSpeechProvider / setVoiceProvider), so the run is the same
//   on every machine. The API is optional.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const PORT = Number(process.env.DEMO_PORT || 5173);
const BASE = `http://localhost:${PORT}`;
const axeSource = fs.readFileSync(path.join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const FLOW = readJson('public/questions/onboarding.json');
const LANGS = (process.env.OPENPATH_LANGS || 'en,am,ar').split(',');
const PACKS = Object.fromEntries(['en', ...LANGS].map((l) => [l, readJson(`lang/${l}.json`)]));

// The same lookup the form uses: [lang simple, lang, en simple, en].
function S(lang, key, simple = false, vars = {}) {
  const p = PACKS[lang];
  const en = PACKS.en;
  const list = simple ? [p.simple, p.strings, en.simple, en.strings] : [p.strings, en.strings];
  for (const c of list) {
    const v = key.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), c);
    if (typeof v === 'string') return v.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));
  }
  throw new Error(`no string ${key}`);
}
// Question text as the form shows it (English when there is no translation).
function Q(lang, id, simple = false) {
  const q = FLOW.questions.find((x) => x.id === id);
  const text = simple && q.simple ? q.simple : q.label;
  return text[lang] ?? text.en;
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Fake providers, registered the moment openpath.js defines window.OpenPath
// (the page itself is served unchanged).
const FAKE_PROVIDERS = () => {
  window.__speech = { log: [], stops: 0 };
  window.__say = [];
  let value;
  Object.defineProperty(window, 'OpenPath', {
    configurable: true,
    get: () => value,
    set(v) {
      value = v;
      v.setSpeechProvider({
        isAvailable: () => true,
        speak: (text) => {
          window.__speech.log.push(text);
          return new Promise((r) => (window.__speech.end = r));
        },
        stop: () => {
          window.__speech.stops++;
          window.__speech.end?.();
        },
      });
      v.setVoiceProvider({ isAvailable: () => true, listen: () => Promise.resolve(window.__say.shift() || ''), stop: () => {} });
    },
  });
};

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

async function reachable(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* try the next one */
    }
  }
  throw new Error('No Chrome or Edge found.');
}

const shadow = (page, fn, arg) =>
  page.evaluate(([src, a]) => {
    const host = document.querySelector('openpath-flow');
    // eslint-disable-next-line no-new-func
    return new Function('host', 'root', 'arg', src)(host, host.shadowRoot, a);
  }, [fn, arg]);

async function checkScreen(page, where, lang) {
  const violations = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    });
    return r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => JSON.stringify(n.target)).join(', ')}`);
  });
  violations.forEach((v) => fail(where, `axe ${v}`));

  const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  if (scroll[0] > scroll[1]) fail(where, `sideways scroll: content ${scroll[0]}px in a ${scroll[1]}px viewport`);

  const problems = await shadow(
    page,
    `
    const out = [];
    for (const el of root.querySelectorAll('button, input:not([type=radio]):not([type=checkbox]), select, textarea, .op-option')) {
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) out.push('target ' + (el.className || el.tagName) + ' is ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    for (const el of root.querySelectorAll('p, label, button, input, select, textarea, dt, dd, legend, h2')) {
      if (el.closest('.op-sr')) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 18) out.push('text ' + el.tagName + ' "' + el.textContent.trim().slice(0, 30) + '" is ' + fs + 'px');
    }
    const formRoot = root.querySelector('.op-root');
    if (formRoot.getAttribute('lang') !== arg.lang) out.push('lang is "' + formRoot.getAttribute('lang') + '", expected ' + arg.lang);
    if (formRoot.getAttribute('dir') !== arg.dir) out.push('dir is "' + formRoot.getAttribute('dir') + '", expected ' + arg.dir);
    return out;
  `,
    { lang, dir: PACKS[lang].dir },
  );
  problems.forEach((p) => fail(where, p));
}

const focusedIsHeading = (page) => shadow(page, `return !!root.activeElement && root.activeElement.matches('h2.op-question[tabindex="-1"]');`);

async function checkError(page, where, nextName, { field }) {
  await page.locator('openpath-flow').getByRole('button', { name: nextName, exact: true }).click();
  const r = await shadow(page, `
    const a = root.activeElement;
    const err = root.querySelector('.op-error');
    if (!a || !err) return { ok: false, why: 'no focused field or no error text' };
    const group = a.closest('fieldset');
    const described = (a.getAttribute('aria-describedby') || '') + ' ' + (group ? group.getAttribute('aria-describedby') || '' : '');
    return {
      ok: a.getAttribute('aria-invalid') === 'true' && described.split(/\\s+/).includes(err.id),
      why: 'invalid=' + a.getAttribute('aria-invalid') + ' describedby=' + described.trim() + ' errorId=' + err.id,
      tag: a.tagName.toLowerCase() + (a.type ? '[' + a.type + ']' : ''),
      message: err.textContent,
    };
  `);
  if (!r.ok) fail(where, `error not linked to the field: ${r.why}`);
  if (field && r.tag !== field) fail(where, `focus went to ${r.tag}, expected ${field}`);
  await page.waitForTimeout(120);
  const live = await shadow(page, `return root.querySelector('[aria-live=polite]').textContent;`);
  if (!live || !r.message?.includes(live)) fail(where, `live region said "${live}", expected the error "${r.message}"`);
  return r.message;
}

const MODES = [
  { label: 'all helpers off, 1280px', width: 1280, helpers: [] },
  { label: 'simple words', width: 1280, helpers: ['helperSimple'] },
  { label: 'read aloud', width: 1280, helpers: ['helperReadAloud'] },
  { label: 'voice input', width: 1280, helpers: ['helperVoice'] },
  { label: 'bigger text + high contrast, 320px', width: 320, helpers: ['helperLarger', 'helperContrast'] },
  { label: 'dark mode, 320px', width: 320, helpers: [], colorScheme: 'dark' },
  { label: '640px (200% zoom)', width: 640, helpers: [] },
];

async function walk(browser, mode, lang, apiUp) {
  const at = (s) => `${lang} / ${mode.label} / ${s}`;
  const has = (h) => mode.helpers.includes(h);
  const simple = has('helperSimple');
  const s = (key, vars) => S(lang, key, simple, vars); // after the setup screen
  const rtl = PACKS[lang].dir === 'rtl';
  const context = await browser.newContext({ viewport: { width: mode.width, height: 800 }, colorScheme: mode.colorScheme ?? 'light' });
  const page = await context.newPage();
  await page.addInitScript(axeSource);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('response', async (r) => {
    if (r.status() >= 400 && r.url().includes(':4000/')) fail(at('api'), `${r.request().method()} ${r.url()} -> ${r.status()} ${await r.text().catch(() => '')}`);
    if (r.status() >= 400 && r.url().includes('/lang/')) fail(at('pack'), `${r.url()} -> ${r.status()}`);
  });
  page.on('request', (r) => {
    if (new URL(r.url()).hostname !== 'localhost') fail(at('network'), `request left this machine: ${r.url()}`);
  });
  await page.addInitScript(FAKE_PROVIDERS);
  await page.goto(`${BASE}/demo/index.html`);
  await page.evaluate(() => {
    window.__events = [];
    window.__queued = 0;
    document.addEventListener('openpath:complete', (e) => window.__events.push(e.detail));
    document.addEventListener('openpath:queued', () => window.__queued++);
  });
  const host = page.locator('openpath-flow');
  const field = (name) => host.locator(`[name="${name}"]`);
  const radio = (value) => host.locator(`input[type=radio][value="${value}"]`);
  const button = (name, exact = true) => host.getByRole('button', { name, exact });
  const next = async (where) => {
    await button(s('next')).click();
    if (!(await focusedIsHeading(page))) fail(where, 'focus did not move to the next question heading');
  };

  // 1. How do you want to use this? Choose the language with the switcher.
  await host.getByRole('heading', { name: S('en', 'setupTitle') }).waitFor();
  if (lang !== 'en') {
    const choice = host.locator(`.op-lang button[lang="${lang}"]`);
    if ((await choice.textContent()) !== PACKS[lang].name) fail(at('switcher'), `the ${lang} option is not written in ${lang}`);
    await choice.click();
    await host.getByRole('heading', { name: S(lang, 'setupTitle') }).waitFor();
    const focus = await shadow(page, `const a = root.activeElement; return a && a.getAttribute('lang') + ' ' + a.getAttribute('aria-pressed');`);
    if (focus !== `${lang} true`) fail(at('switcher'), `focus after choosing a language: ${focus}`);
  }
  await checkScreen(page, at('setup'), lang);
  // After the language switcher, the first control keeps every helper off.
  const firstControl = await shadow(page, `return [...root.querySelectorAll('button, input')].find((c) => !c.closest('.op-lang')).textContent;`);
  if (firstControl !== S(lang, 'useDeviceTools')) fail(at('setup'), `first control is "${firstControl}"`);
  if (mode.helpers.length) {
    for (const key of mode.helpers) await host.getByLabel(S(lang, key), { exact: true }).check();
    await button(S(lang, 'continueWithHelpers')).click();
  } else {
    await button(S(lang, 'useDeviceTools')).click();
  }
  if (!(await focusedIsHeading(page))) fail(at('setup'), 'focus did not move to the first question');

  // intro (info)
  await checkScreen(page, at('info'), lang);
  if (has('helperReadAloud')) {
    await page.waitForFunction(() => window.__speech.log.length > 0);
    const said = await page.evaluate(() => window.__speech.log[0]);
    if (!said.includes(Q(lang, 'intro'))) fail(at('read aloud'), `first step read as "${said}"`);
    if (!(await button(s('stopReading')).isVisible())) fail(at('read aloud'), 'no Stop control while reading');
    await page.keyboard.press('Escape');
    if ((await page.evaluate(() => window.__speech.stops)) < 1) fail(at('read aloud'), 'Escape did not stop speech');
    if (!(await button(s('listen')).isVisible())) fail(at('read aloud'), 'no Listen button');
  }
  await next(at('info'));

  // full name (text)
  await checkError(page, at('text'), s('next'), { field: 'input[text]' });
  await checkScreen(page, at('text with error'), lang);
  if ((await field('fullName').getAttribute('autocomplete')) !== 'name') fail(at('text'), 'no autocomplete="name"');
  // Back and Next follow the reading direction.
  const [backX, nextX] = await Promise.all([button(s('back')).boundingBox(), button(s('next')).boundingBox()]).then((b) => b.map((x) => x.x));
  if (rtl ? !(nextX < backX) : !(nextX > backX)) fail(at('direction'), `Back at x=${backX}, Next at x=${nextX} in a ${rtl ? 'right-to-left' : 'left-to-right'} form`);
  if (has('helperVoice')) {
    await speak(page, at('voice text'), lang, 'Hana Tesfaye', async () => (await field('fullName').inputValue()) === 'Hana Tesfaye');
    const focused = await shadow(page, `return root.activeElement && root.activeElement.name;`);
    if (focused !== 'fullName') fail(at('voice text'), 'focus did not return to the field after speaking');
    await checkScreen(page, at('voice text result'), lang);
  } else {
    await field('fullName').fill('Hana Tesfaye');
  }
  await next(at('text'));

  // phone: +251 shown as text, local formats accepted, stored internationally
  await field('phone').fill('12');
  const phoneError = await checkError(page, at('phone'), s('next'), { field: 'input[tel]' });
  if (!phoneError.includes('0911 234 567')) fail(at('phone'), `the error gives no example: "${phoneError}"`);
  if ((await field('phone').getAttribute('autocomplete')) !== 'tel-national') fail(at('phone'), 'no autocomplete="tel-national"');
  const phoneBox = await shadow(page, `
    const prefix = root.querySelector('.op-prefix');
    const input = root.querySelector('[name=phone]');
    const p = prefix.getBoundingClientRect();
    const i = input.getBoundingClientRect();
    const cs = getComputedStyle(prefix);
    return { text: prefix.textContent, prefixLeft: p.right <= i.left + 1, dir: getComputedStyle(input).direction,
             rounded: parseFloat(cs.borderTopLeftRadius) > 0 && parseFloat(cs.borderTopRightRadius) === 0 };
  `);
  if (phoneBox.text !== '+251') fail(at('phone'), `prefix shows "${phoneBox.text}"`);
  if (!phoneBox.prefixLeft || phoneBox.dir !== 'ltr') fail(at('phone'), `phone box is not left to right: ${JSON.stringify(phoneBox)}`);
  if (!phoneBox.rounded) fail(at('phone'), 'the +251 box has its rounded corners on the wrong side');
  const pasteBlocked = await shadow(page, `
    const el = root.querySelector('[name=phone]');
    const dt = new DataTransfer();
    dt.setData('text/plain', '0911 234 567');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  `);
  if (pasteBlocked) fail(at('phone'), 'paste is blocked');
  await field('phone').fill('0911 234 567');
  await checkScreen(page, at('phone'), lang);
  await next(at('phone'));

  // date of birth, Ethiopian calendar: three native selects
  await checkError(page, at('date'), s('next'), { field: 'select[select-one]' });
  await checkScreen(page, at('date with error'), lang);
  await host.getByLabel(s('day'), { exact: true }).selectOption('18');
  await host.getByLabel(s('month'), { exact: true }).selectOption('7');
  await host.getByLabel(s('year'), { exact: true }).selectOption('1993');
  // The calendar switch shows the same day in the other calendar, and back.
  await button(s('useGregorian')).click();
  const boxes = await shadow(page, `return [...root.querySelectorAll('.op-date input')].map((i) => i.value).join('/');`);
  if (boxes !== '27/03/2001') fail(at('calendar switch'), `Gregorian boxes show ${boxes}`);
  if ((await shadow(page, `return root.activeElement && root.activeElement.className;`))?.includes('op-calendar-switch') !== true) {
    fail(at('calendar switch'), 'focus did not stay on the calendar switch');
  }
  await checkScreen(page, at('date, Gregorian'), lang);
  await button(s('useEthiopian')).click();
  await next(at('date'));

  // language (single)
  await checkError(page, at('single'), s('next'), { field: 'input[radio]' });
  if (has('helperVoice')) {
    await speak(page, at('voice choice'), lang, 'አማርኛ', () => radio('am').isChecked());
  } else {
    await radio('am').check();
  }
  await checkScreen(page, at('single'), lang);
  await next(at('single'));

  await field('location').fill('Addis Ababa');
  await next(at('location'));

  // ID type -> showIf
  const total = async () => Number((await host.locator('.op-progress').textContent()).match(/(\d+)\D*$/)[1]);
  const before = await total();
  await radio('refer-me').check();
  if ((await total()) !== before + 1) fail(at('showIf'), 'step count did not grow by one');
  await next(at('idType'));
  await field('referringPartner').waitFor();
  await button(s('skip')).click();
  if (!(await focusedIsHeading(page))) fail(at('skip'), 'focus did not move after Skip');

  await radio('data-analytics').check();
  await next(at('course'));

  await field('supportRequest').fill('I use a wheelchair.');
  await checkScreen(page, at('textarea'), lang);
  await next(at('support'));

  // review: the date in the Ethiopian calendar, the phone in international format
  await host.getByRole('heading', { name: s('reviewTitle') }).waitFor();
  await checkScreen(page, at('review'), lang);
  const review = await shadow(page, `return [...root.querySelectorAll('.op-review-item dd:first-of-type')].map((d) => d.textContent);`);
  const months = PACKS[lang].strings.ethiopianMonths ?? PACKS.en.strings.ethiopianMonths;
  const date = S(lang, 'ethiopianDateFormat', false, { day: '18', month: months[6], year: '1993' });
  if (!review.includes(date)) fail(at('review'), `date not shown as "${date}": ${review.join(' | ')}`);
  if (!review.includes('+251 911 234 567')) fail(at('review'), `phone not shown as +251 911 234 567: ${review.join(' | ')}`);
  await host.getByRole('button', { name: new RegExp(escapeRe(Q(lang, 'course', simple))) }).click();
  if (!(await focusedIsHeading(page))) fail(at('edit'), 'focus did not move to the question when editing');
  await radio('virtual-assistant').check();
  await next(at('edit'));
  if (!(await host.getByRole('heading', { name: s('reviewTitle') }).isVisible())) fail(at('edit'), 'Next after Edit did not return to the review');

  // Settings is on every step, shows the language switcher, and comes back to the same place.
  await button(s('settings')).click();
  await host.getByRole('heading', { name: s('setupTitle') }).waitFor();
  if ((await host.locator('.op-lang button').count()) !== 3) fail(at('settings'), 'no language switcher in Settings');
  await checkScreen(page, at('settings'), lang);
  await button(mode.helpers.length ? s('continueWithHelpers') : s('useDeviceTools')).click();
  await host.getByRole('heading', { name: s('reviewTitle') }).waitFor();

  await button(s('back')).focus();
  await page.keyboard.press('Tab');
  const ring = await shadow(page, `const s = getComputedStyle(root.activeElement); return s.outlineStyle + ' ' + s.outlineWidth;`);
  if (ring !== 'solid 3px') fail(at('focus ring'), `keyboard focus outline is "${ring}"`);

  await button(s('submit')).click();
  if (!apiUp) {
    // No server: the answers wait on the device and the learner is told so.
    await host.getByRole('heading', { name: s('queuedTitle') }).waitFor();
    await checkScreen(page, at('queued'), lang);
    if ((await host.locator('.op-offline').textContent()) !== s('savedOffline')) fail(at('queued'), 'no "saved on this device" note');
    if ((await page.evaluate(() => window.__queued)) !== 1) fail(at('queued'), 'no openpath:queued event');
    const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('openpath:alx-onboarding') || '{}').pendingSubmit);
    if (pending !== true) fail(at('queued'), 'the queued submit is not kept on the device');
    pageErrors.forEach((e) => fail(at('page'), `uncaught error: ${e}`));
    await context.close();
    return null;
  }
  await host.getByRole('heading', { name: s('doneTitle') }).waitFor();
  await checkScreen(page, at('done'), lang);

  const events = await page.evaluate(() => window.__events);
  if (events.length !== 1) fail(at('complete'), `expected 1 openpath:complete event, got ${events.length}`);
  else {
    const a = events[0].answers;
    if ('supportRequest' in a) fail(at('complete'), 'the private support request was included in the event');
    if (a.course !== 'virtual-assistant') fail(at('complete'), 'edited answer missing from the event');
    if ('referringPartner' in a) fail(at('complete'), 'skipped answer should be absent');
    if (a.phone !== '+251911234567') fail(at('complete'), `phone is ${a.phone}`);
    if (JSON.stringify(a.dateOfBirth) !== JSON.stringify({ date: '2001-03-27', calendar: 'ethiopian', ethiopian: { year: 1993, month: 7, day: 18 } })) {
      fail(at('complete'), `date of birth is ${JSON.stringify(a.dateOfBirth)}`);
    }
  }
  if (await page.evaluate(() => localStorage.getItem('openpath:alx-onboarding'))) fail(at('complete'), 'localStorage was not cleared after submit');
  if (!has('helperReadAloud')) {
    const spoken = await page.evaluate(() => window.__speech.log.length);
    if (spoken) fail(at('rule'), `spoke ${spoken} time(s) although read-aloud was off`);
  }
  pageErrors.forEach((e) => fail(at('page'), `uncaught error: ${e}`));
  await context.close();
  return events[0];
}

// Answer by voice: consent the first time, then check the result went in.
async function speak(page, where, lang, words, check) {
  const host = page.locator('openpath-flow');
  await page.evaluate((w) => window.__say.push(w), words);
  const mic = host.getByRole('button', { name: S(lang, 'speakAnswer') });
  if ((await mic.getAttribute('aria-pressed')) !== null) fail(where, 'mic button should not have aria-pressed');
  await mic.click();
  const allow = host.getByRole('button', { name: S(lang, 'consentAllow'), exact: true });
  if (await allow.isVisible().catch(() => false)) {
    await checkScreen(page, `${where} (consent)`, lang);
    await allow.click();
  }
  const saidPrefix = S(lang, 'youSaid').split('{text}')[0].trim();
  await host.locator('.op-voice-status').filter({ hasText: saidPrefix }).waitFor();
  if (!(await check())) fail(where, `the spoken answer "${words}" was not filled in`);
}

// ---- Career Gateway pages: job list (+ filter + apply) and employer form -----

const JOB_FLOW = readJson('public/questions/job-application.json');
const EMPLOYER_FLOW = readJson('public/questions/employer-accommodations.json');
const PAGES = (process.env.OPENPATH_PAGES || 'flow,jobs,employer').split(',');
const qText = (flow, lang, id) => {
  const q = flow.questions.find((x) => x.id === id);
  return q.label[lang] ?? q.label.en;
};

// Find elements and focus through nested shadow roots (the application form
// opens inside the job list's shadow root).
const DEEP = () => {
  window.__deepAll = (sel, root = document) => {
    const out = [...root.querySelectorAll(sel)];
    for (const el of root.querySelectorAll('*')) if (el.shadowRoot) out.push(...window.__deepAll(sel, el.shadowRoot));
    return out;
  };
  window.__deepActive = () => {
    let a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  };
};

/** The same checks as checkScreen, across every OpenPath shadow root on the page. */
async function checkDeep(page, where, lang) {
  const violations = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    });
    return r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => JSON.stringify(n.target)).join(', ')}`);
  });
  violations.forEach((v) => fail(where, `axe ${v}`));
  const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  if (scroll[0] > scroll[1]) fail(where, `sideways scroll: content ${scroll[0]}px in a ${scroll[1]}px viewport`);
  const problems = await page.evaluate(({ lang, dir }) => {
    const out = [];
    const visible = (el) => el.getClientRects().length > 0;
    for (const el of window.__deepAll('button, input:not([type=radio]):not([type=checkbox]), select, textarea, .op-option')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) out.push(`target ${el.className || el.tagName} is ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    for (const el of window.__deepAll('.op-root p, .op-root label, .op-root button, .op-root input, .op-root dt, .op-root dd, .op-root li, .op-root legend, .op-root h2, .op-root h3')) {
      if (el.closest('.op-sr') || !visible(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 18) out.push(`text ${el.tagName} "${el.textContent.trim().slice(0, 30)}" is ${fs}px`);
    }
    for (const root of window.__deepAll('.op-root')) {
      if (root.getAttribute('lang') !== lang) out.push(`lang is "${root.getAttribute('lang')}", expected ${lang}`);
      if (root.getAttribute('dir') !== dir) out.push(`dir is "${root.getAttribute('dir')}", expected ${dir}`);
    }
    return out;
  }, { lang, dir: PACKS[lang].dir });
  problems.forEach((p) => fail(where, p));
}

async function careerContext(browser, mode, lang, extra = {}) {
  const context = await browser.newContext({ viewport: { width: mode.width, height: 800 }, colorScheme: mode.colorScheme ?? 'light' });
  const page = await context.newPage();
  await page.addInitScript(axeSource);
  await page.addInitScript(DEEP);
  await page.addInitScript(FAKE_PROVIDERS);
  await page.addInitScript(
    ([prefs, profile]) => {
      if (sessionStorage.getItem('__seeded')) return; // only before the first load
      sessionStorage.setItem('__seeded', '1');
      localStorage.setItem('openpath:prefs', JSON.stringify(prefs));
      if (profile) localStorage.setItem('openpath:profile', JSON.stringify(profile));
    },
    [{ chosen: true, lang, largerText: Boolean(mode.big), highContrast: Boolean(mode.big) }, extra.profile ?? null],
  );
  const pageErrors = [];
  const requests = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('request', (r) => {
    requests.push(`${r.method()} ${r.url()} ${r.postData() ?? ''}`);
    if (new URL(r.url()).hostname !== 'localhost') fail(`${lang} / ${mode.label}`, `request left this machine: ${r.url()}`);
  });
  page.on('response', async (r) => {
    if (r.status() >= 400 && (r.url().includes(':4000/') || r.url().includes('/lang/') || r.url().includes('/questions/'))) {
      fail(`${lang} / ${mode.label}`, `${r.request().method()} ${r.url()} -> ${r.status()}`);
    }
  });
  return { context, page, pageErrors, requests };
}

const CAREER_MODES = [
  { label: '1280px', width: 1280 },
  { label: '640px (200% zoom)', width: 640 },
  { label: 'bigger text + high contrast, 320px (400% zoom)', width: 320, big: true },
];

async function jobsWalk(browser, mode, lang, apiUp) {
  const at = (s) => `${lang} / jobs / ${mode.label} / ${s}`;
  const s = (key, vars) => S(lang, key, false, vars);
  const { context, page, pageErrors, requests } = await careerContext(browser, mode, lang, {
    profile: { 'alx-onboarding.fullName': 'Hana Tesfaye', 'alx-onboarding.phone': '+251911234567' },
  });
  await page.goto(`${BASE}/demo/jobs.html`);
  await page.evaluate(() => {
    window.__events = [];
    document.addEventListener('openpath:complete', (e) => window.__events.push(e.detail));
  });
  const host = page.locator('openpath-jobs');
  await host.locator('.op-job').first().waitFor();
  await checkDeep(page, at('list'), lang);

  // A heading per job and one clearly named Apply button.
  const jobs = await host.locator('.op-job').evaluateAll((els) =>
    els.map((el) => ({ title: el.querySelector('h3')?.textContent, buttons: [...el.querySelectorAll('button')].map((b) => b.textContent), id: el.querySelector('button')?.dataset.job })),
  );
  if (jobs.length < 6) fail(at('list'), `only ${jobs.length} jobs listed`);
  for (const j of jobs) {
    if (!j.title) fail(at('list'), 'a job has no heading');
    if (j.buttons.length !== 1 || j.buttons[0] !== s('applyFor', { title: j.title })) fail(at('list'), `job "${j.title}" buttons: ${j.buttons.join(' | ')}`);
  }
  if ((await host.locator('.op-jobs-count').textContent()) !== s('jobsCount', { count: jobs.length })) fail(at('count'), 'wrong count text');
  const ld = await page.evaluate(() => JSON.parse(document.querySelector('script[type="application/ld+json"][data-openpath-jobs]')?.textContent ?? 'null'));
  if (ld?.['@context'] !== 'https://schema.org' || ld['@graph']?.length !== jobs.length) fail(at('json-ld'), 'no JobPosting JSON-LD for every job in the host page');

  // The private filter: announced, never leaves the browser, not stored.
  if (!(await host.getByText(s('supportFilterPrivacy')).isVisible())) fail(at('filter'), 'the privacy sentence is not shown');
  const url = page.url();
  const sent = requests.length;
  await host.locator('input[value="remote-work"]').check();
  const announced = await host.locator('[aria-live]').filter({ hasText: /\d/ }).first().textContent({ timeout: 3000 }).catch(() => '');
  const countText = await host.locator('.op-jobs-count').textContent();
  if (!announced || announced !== countText) fail(at('filter'), `live region said "${announced}", count says "${countText}"`);
  if (requests.length !== sent) fail(at('filter'), `the filter caused requests: ${requests.slice(sent).join(', ')}`);
  if (requests.some((r) => r.includes('remote-work'))) fail(at('filter'), 'the chosen support was sent somewhere');
  if (page.url() !== url) fail(at('filter'), 'the filter changed the URL');
  if (await page.evaluate(() => localStorage.getItem('openpath:support-filter'))) fail(at('filter'), 'the filter was stored without "Remember"');
  await checkDeep(page, at('filtered'), lang);

  // Apply: the application form, prefilled from onboarding, with the private question.
  const apply = host.locator('.op-apply').first();
  const jobId = await apply.getAttribute('data-job');
  const [jobTitle, jobOrg] = await host.locator('.op-job').first().evaluate((el) => [el.querySelector('h3').textContent, el.querySelector('dd').textContent]);
  await apply.click();
  const focused = await page.evaluate(() => window.__deepActive()?.textContent ?? '');
  if (focused !== s('applyingFor', { title: jobTitle, organisation: jobOrg })) fail(at('apply'), `focus after Apply: "${focused}"`);
  const form = host.locator('openpath-flow');
  const button = (name) => form.getByRole('button', { name, exact: true });
  const next = async (where) => {
    await button(s('next')).click();
    if (!(await page.evaluate(() => window.__deepActive()?.matches('h2.op-question') ?? false))) fail(at(where), 'focus did not move to the next question');
  };
  await form.getByRole('heading', { name: qText(JOB_FLOW, lang, 'intro') }).waitFor();
  await checkDeep(page, at('application intro'), lang);
  await next('intro');
  if ((await form.locator('[name=fullName]').inputValue()) !== 'Hana Tesfaye') fail(at('prefill'), 'name was not prefilled from onboarding');
  if (!(await form.locator('.op-prefilled').isVisible())) fail(at('prefill'), 'no "filled in from your earlier answers" note');
  await checkDeep(page, at('prefilled name'), lang);
  await next('name');
  if ((await form.locator('[name=phone]').inputValue()) !== '911234567') fail(at('prefill'), 'phone was not prefilled');
  await next('phone');
  await form.locator('input[value="1-3"]').check();
  await next('experience years');
  await button(s('skip')).click();
  await form.locator('input[value="now"]').check();
  await next('start');
  await form.locator('input[value="part-time"]').check();
  await next('hours');
  await form.locator('input[value="extra-time"]').check();
  await checkDeep(page, at('private support question'), lang);
  await next('support');
  await form.getByRole('heading', { name: s('reviewTitle') }).waitFor();
  await checkDeep(page, at('application review'), lang);
  await button(s('submit')).click();
  await form.getByRole('heading', { name: apiUp ? s('doneTitle') : s('queuedTitle') }).waitFor();
  await checkDeep(page, at('application sent'), lang);
  if (apiUp) {
    const events = await page.evaluate(() => window.__events);
    const e = events[0];
    if (!e || e.context?.jobId !== jobId) fail(at('complete'), `the application event has no job: ${JSON.stringify(e?.context)}`);
    if (e && ('interviewSupport' in e.answers || 'supportFilter' in e)) fail(at('complete'), 'private answers or the filter are in the event');
    if (e && !e.sessionId) fail(at('complete'), 'no sessionId');
  }
  await host.locator('.op-back-to-jobs').click();
  const back = await page.evaluate(() => window.__deepActive()?.dataset?.job);
  if (back !== jobId) fail(at('back'), 'focus did not return to the Apply button');
  pageErrors.forEach((e) => fail(at('page'), `uncaught error: ${e}`));
  await context.close();
}

async function employerWalk(browser, mode, lang, apiUp) {
  const at = (s) => `${lang} / employer / ${mode.label} / ${s}`;
  const s = (key, vars) => S(lang, key, false, vars);
  const { context, page, pageErrors } = await careerContext(browser, mode, lang);
  await page.goto(`${BASE}/demo/employer.html`);
  const form = page.locator('openpath-flow');
  const button = (name) => form.getByRole('button', { name, exact: true });
  const next = async (where) => {
    await button(s('next')).click();
    if (!(await page.evaluate(() => window.__deepActive()?.matches('h2.op-question') ?? false))) fail(at(where), 'focus did not move to the next question');
  };
  await form.getByRole('heading', { name: qText(EMPLOYER_FLOW, lang, 'intro') }).waitFor();
  await checkDeep(page, at('intro'), lang);
  await next('intro');
  const title = `Browser test job ${lang} ${mode.width}`;
  await button(s('next')).click(); // empty: error
  await checkDeep(page, at('job title with error'), lang);
  await form.locator('[name=jobTitle]').fill(title);
  await next('job title');
  await form.locator('[name=organisation]').fill('OpenPath browser test');
  await next('organisation');
  await form.locator('[name=location]').fill('Adama');
  await next('location');
  await form.locator('input[value="part-time"]').check();
  await next('type');
  await button(s('skip')).click();
  await form.locator('input[value="step-free-workplace"]').check();
  await form.locator('input[value="written-instructions"]').check();
  await checkDeep(page, at('support offered'), lang);
  await next('support offered');
  await form.getByRole('heading', { name: s('reviewTitle') }).waitFor();
  await checkDeep(page, at('review'), lang);
  await button(s('submit')).click();
  await form.getByRole('heading', { name: apiUp ? s('doneTitle') : s('queuedTitle') }).waitFor();
  await checkDeep(page, at('sent'), lang);
  if (apiUp) {
    const list = await (await fetch('http://localhost:4000/v1/jobs')).json();
    const job = list['@graph'].find((j) => JSON.stringify(j.title).includes(title));
    if (!job) fail(at('api'), 'the new job is not in GET /v1/jobs');
    else if (JSON.stringify(job.jobBenefits) !== JSON.stringify(['Step-free workplace', 'Written instructions'])) fail(at('api'), `support stored as ${JSON.stringify(job.jobBenefits)}`);
  }
  pageErrors.forEach((e) => fail(at('page'), `uncaught error: ${e}`));
  await context.close();
}

// ---- run --------------------------------------------------------------------
let server;
if (!(await reachable(`${BASE}/demo/index.html`))) {
  if (!fs.existsSync(path.join(root, 'dist/openpath.js'))) {
    console.error('dist/openpath.js is missing. Run `npm run build` first.');
    process.exit(2);
  }
  server = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await reachable(`${BASE}/demo/index.html`)); i++) await new Promise((r) => setTimeout(r, 100));
}
const apiUp = await reachable('http://localhost:4000/v1/health');
console.log(`demo: ${BASE}/demo/  api: ${apiUp ? 'running (answers go to the server)' : 'not running (answers wait on the device; checks the queued screen)'}`);

const browser = await launch();
try {
  for (const lang of LANGS) {
    for (const mode of PAGES.includes('flow') ? MODES : []) {
      const before = failures.length;
      const done = await walk(browser, mode, lang, apiUp).catch((e) => fail(`${lang} / ${mode.label}`, `stopped: ${e.message.split('\n')[0]}`));
      if (apiUp && done && !done.sessionId) fail(`${lang} / ${mode.label}`, 'the API is running but the complete event has no sessionId');
      console.log(`${failures.length === before ? 'ok  ' : 'FAIL'} ${lang} ${PACKS[lang].dir}  ${mode.label}`);
    }
    // Career Gateway: the job list (filter, apply) and the employer form.
    for (const [page, run, modes] of [['jobs', jobsWalk, CAREER_MODES], ['employer', employerWalk, CAREER_MODES.filter((m) => m.width !== 640)]]) {
      if (!PAGES.includes(page)) continue;
      for (const mode of modes) {
        const before = failures.length;
        await run(browser, mode, lang, apiUp).catch((e) => fail(`${lang} / ${page} / ${mode.label}`, `stopped: ${e.message.split('\n')[0]}`));
        console.log(`${failures.length === before ? 'ok  ' : 'FAIL'} ${lang} ${PACKS[lang].dir}  ${page}: ${mode.label}`);
      }
    }
  }
} finally {
  await browser.close();
  server?.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log(`All browser accessibility checks passed (${LANGS.join(', ')}).`);
