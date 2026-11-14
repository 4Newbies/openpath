// Real-browser accessibility check for <openpath-flow>, using the Chrome or
// Edge already installed on this machine (playwright-core, no download).
//
//   npm run build && npm run test:browser
//
// Walks the whole default flow once per mode: every helper off, each helper
// on by itself, bigger text + high contrast at 320px (= 400% zoom), dark mode
// at 320px, and 640px (200% zoom). On every screen it checks:
//   axe (WCAG 2.2 AA, incl. colour contrast) has no serious/critical issues,
//   no sideways scroll, targets >= 44x44px, text >= 18px, focus lands on the
//   question heading, errors are linked and announced, the 3px focus ring,
//   no requests leave this machine, and nothing is spoken unless read-aloud
//   is on. Read-aloud and voice use fake providers registered by the page
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

async function checkScreen(page, where) {
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

  const problems = await shadow(page, `
    const out = [];
    for (const el of root.querySelectorAll('button, input:not([type=radio]):not([type=checkbox]), textarea, .op-option')) {
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) out.push('target ' + (el.className || el.tagName) + ' is ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    for (const el of root.querySelectorAll('p, label, button, input, textarea, dt, dd, legend, h2')) {
      if (el.closest('.op-sr')) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 18) out.push('text ' + el.tagName + ' "' + el.textContent.trim().slice(0, 30) + '" is ' + fs + 'px');
    }
    if (root.querySelector('.op-root').getAttribute('lang') !== host.getAttribute('lang')) out.push('lang attribute missing');
    return out;
  `);
  problems.forEach((p) => fail(where, p));
}

const focusedIsHeading = (page) => shadow(page, `return !!root.activeElement && root.activeElement.matches('h2.op-question[tabindex="-1"]');`);

async function next(page, where) {
  await page.locator('openpath-flow').getByRole('button', { name: 'Next', exact: true }).click();
  if (!(await focusedIsHeading(page))) fail(where, 'focus did not move to the next question heading');
}

async function checkError(page, where, { field }) {
  await page.locator('openpath-flow').getByRole('button', { name: 'Next', exact: true }).click();
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
}

// Answer by voice: consent the first time, then check the result went in.
async function speak(page, where, words, check) {
  const host = page.locator('openpath-flow');
  await page.evaluate((w) => window.__say.push(w), words);
  const mic = host.getByRole('button', { name: 'Speak your answer' });
  if ((await mic.getAttribute('aria-pressed')) !== null) fail(where, 'mic button should not have aria-pressed');
  await mic.click();
  const allow = host.getByRole('button', { name: 'Allow' });
  if (await allow.isVisible().catch(() => false)) {
    await checkScreen(page, `${where} (consent)`);
    await allow.click();
  }
  await host.locator('.op-voice-status').filter({ hasText: 'You said' }).waitFor();
  if (!(await check())) fail(where, `the spoken answer "${words}" was not filled in`);
}

const MODES = [
  { label: 'all helpers off, 1280px', width: 1280, helpers: [] },
  { label: 'simple words', width: 1280, helpers: ['Simple words'] },
  { label: 'read aloud', width: 1280, helpers: ['Read questions to me'] },
  { label: 'voice input', width: 1280, helpers: ['I want to speak my answers'] },
  { label: 'bigger text + high contrast, 320px', width: 320, helpers: ['Bigger text', 'High contrast'] },
  { label: 'dark mode, 320px', width: 320, helpers: [], colorScheme: 'dark' },
  { label: '640px (200% zoom)', width: 640, helpers: [] },
];

async function walk(browser, mode) {
  const at = (s) => `${mode.label} / ${s}`;
  const has = (h) => mode.helpers.includes(h);
  const context = await browser.newContext({ viewport: { width: mode.width, height: 800 }, colorScheme: mode.colorScheme ?? 'light' });
  const page = await context.newPage();
  await page.addInitScript(axeSource);
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('response', async (r) => {
    if (r.status() >= 400 && r.url().includes(':4000/')) fail(at('api'), `${r.request().method()} ${r.url()} -> ${r.status()} ${await r.text().catch(() => '')}`);
  });
  page.on('request', (r) => {
    if (new URL(r.url()).hostname !== 'localhost') fail(at('network'), `request left this machine: ${r.url()}`);
  });
  await page.addInitScript(FAKE_PROVIDERS);
  await page.goto(`${BASE}/demo/index.html`);
  await page.evaluate(() => {
    window.__events = [];
    document.addEventListener('openpath:complete', (e) => window.__events.push(e.detail));
  });
  const host = page.locator('openpath-flow');
  const field = (name) => host.locator(`[name="${name}"]`);
  const radio = (value) => host.locator(`input[type=radio][value="${value}"]`);

  // 1. How do you want to use this?
  await host.getByRole('heading', { name: 'How do you want to use this?' }).waitFor();
  await checkScreen(page, at('setup'));
  // After the language switcher (when the host offers languages), the first
  // control keeps every helper off.
  const firstControl = await shadow(page, `return [...root.querySelectorAll('button, input')].find((c) => !c.closest('.op-lang')).textContent;`);
  if (firstControl !== "Continue with my device's own tools") fail(at('setup'), `first control is "${firstControl}"`);
  if (mode.helpers.length) {
    for (const label of mode.helpers) await host.getByLabel(label, { exact: true }).check();
    await host.getByRole('button', { name: 'Continue with these helpers' }).click();
  } else {
    await host.getByRole('button', { name: "Continue with my device's own tools" }).click();
  }
  if (!(await focusedIsHeading(page))) fail(at('setup'), 'focus did not move to the first question');

  // intro (info)
  await checkScreen(page, at('info'));
  if (has('Read questions to me')) {
    await page.waitForFunction(() => window.__speech.log.length > 0);
    const said = await page.evaluate(() => window.__speech.log[0]);
    if (!/Before you start/.test(said)) fail(at('read aloud'), `first step read as "${said}"`);
    if (!(await host.getByRole('button', { name: 'Stop', exact: true }).isVisible())) fail(at('read aloud'), 'no Stop control while reading');
    await page.keyboard.press('Escape');
    if ((await page.evaluate(() => window.__speech.stops)) < 1) fail(at('read aloud'), 'Escape did not stop speech');
    if (!(await host.getByRole('button', { name: 'Listen', exact: true }).isVisible())) fail(at('read aloud'), 'no Listen button');
  }
  await next(page, at('info'));

  // full name (text)
  await checkError(page, at('text'), { field: 'input[text]' });
  await checkScreen(page, at('text with error'));
  if ((await field('fullName').getAttribute('autocomplete')) !== 'name') fail(at('text'), 'no autocomplete="name"');
  if (has('I want to speak my answers')) {
    await speak(page, at('voice text'), 'Hana Tesfaye', async () => (await field('fullName').inputValue()) === 'Hana Tesfaye');
    const focused = await shadow(page, `return root.activeElement && root.activeElement.name;`);
    if (focused !== 'fullName') fail(at('voice text'), 'focus did not return to the field after speaking');
    await checkScreen(page, at('voice text result'));
  } else {
    await field('fullName').fill('Hana Tesfaye');
  }
  await next(page, at('text'));

  // phone
  await field('phone').fill('12');
  await checkError(page, at('phone'), { field: 'input[tel]' });
  if ((await field('phone').getAttribute('autocomplete')) !== 'tel') fail(at('phone'), 'no autocomplete="tel"');
  const pasteBlocked = await shadow(page, `
    const el = root.querySelector('[name=phone]');
    const dt = new DataTransfer();
    dt.setData('text/plain', '+251 911 234 567');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  `);
  if (pasteBlocked) fail(at('phone'), 'paste is blocked');
  await field('phone').fill('+251 911 234 567');
  await checkScreen(page, at('phone'));
  await next(page, at('phone'));

  // date
  await checkError(page, at('date'), { field: 'input[text]' });
  await checkScreen(page, at('date with error'));
  await host.getByLabel('Day').fill('27');
  await host.getByLabel('Month').fill('3');
  await host.getByLabel('Year').fill('2001');
  await next(page, at('date'));

  // language (single)
  await checkError(page, at('single'), { field: 'input[radio]' });
  if (has('I want to speak my answers')) {
    await speak(page, at('voice choice'), 'Amharic please', () => radio('am').isChecked());
  } else {
    await radio('am').check();
  }
  await checkScreen(page, at('single'));
  await next(page, at('single'));

  await field('location').fill('Addis Ababa');
  await next(page, at('location'));

  // ID type -> showIf
  const total = async () => Number((await host.locator('.op-progress').textContent()).match(/of (\d+)/)[1]);
  const before = await total();
  await radio('refer-me').check();
  if ((await total()) !== before + 1) fail(at('showIf'), 'step count did not grow by one');
  await next(page, at('idType'));
  await field('referringPartner').waitFor();
  await host.getByRole('button', { name: /^Skip/ }).click();
  if (!(await focusedIsHeading(page))) fail(at('skip'), 'focus did not move after Skip');

  await radio('data-analytics').check();
  await next(page, at('course'));

  await field('supportRequest').fill('I use a wheelchair.');
  await checkScreen(page, at('textarea'));
  await next(page, at('support'));

  // review
  await host.getByRole('heading', { name: 'Check your answers' }).waitFor();
  await checkScreen(page, at('review'));
  await host.getByRole('button', { name: /Which course/ }).click();
  if (!(await focusedIsHeading(page))) fail(at('edit'), 'focus did not move to the question when editing');
  await radio('virtual-assistant').check();
  await next(page, at('edit'));
  if (!(await host.getByRole('heading', { name: 'Check your answers' }).isVisible())) fail(at('edit'), 'Next after Edit did not return to the review');

  // Settings is on every step and comes back to the same place.
  await host.getByRole('button', { name: 'Settings' }).click();
  await host.getByRole('heading', { name: 'How do you want to use this?' }).waitFor();
  await checkScreen(page, at('settings'));
  await host.getByRole('button', { name: mode.helpers.length ? /with these helpers/ : "Continue with my device's own tools" }).click(); // simple words: 'Go on with these helpers'
  await host.getByRole('heading', { name: 'Check your answers' }).waitFor();

  await host.getByRole('button', { name: 'Back', exact: true }).focus();
  await page.keyboard.press('Tab');
  const ring = await shadow(page, `const s = getComputedStyle(root.activeElement); return s.outlineStyle + ' ' + s.outlineWidth;`);
  if (ring !== 'solid 3px') fail(at('focus ring'), `keyboard focus outline is "${ring}"`);

  await host.getByRole('button', { name: /^Send/ }).click();
  await host.getByRole('heading', { name: /Thank you/ }).waitFor();
  await checkScreen(page, at('done'));

  const events = await page.evaluate(() => window.__events);
  if (events.length !== 1) fail(at('complete'), `expected 1 openpath:complete event, got ${events.length}`);
  else {
    if ('supportRequest' in events[0].answers) fail(at('complete'), 'the private support request was included in the event');
    if (events[0].answers.course !== 'virtual-assistant') fail(at('complete'), 'edited answer missing from the event');
    if ('referringPartner' in events[0].answers) fail(at('complete'), 'skipped answer should be absent');
  }
  if (await page.evaluate(() => localStorage.getItem('openpath:alx-onboarding'))) fail(at('complete'), 'localStorage was not cleared after submit');
  if (!has('Read questions to me')) {
    const spoken = await page.evaluate(() => window.__speech.log.length);
    if (spoken) fail(at('rule'), `spoke ${spoken} time(s) although read-aloud was off`);
  }
  pageErrors.forEach((e) => fail(at('page'), `uncaught error: ${e}`));
  await context.close();
  return events[0];
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
console.log(`demo: ${BASE}/demo/  api: ${apiUp ? 'running (answers go to the server)' : 'not running (device-only mode)'}`);

const browser = await launch();
try {
  for (const mode of MODES) {
    const before = failures.length;
    const done = await walk(browser, mode);
    if (apiUp && !done?.sessionId) fail(mode.label, 'the API is running but the complete event has no sessionId');
    console.log(`${failures.length === before ? 'ok  ' : 'FAIL'} ${mode.label}`);
  }
} finally {
  await browser.close();
  server?.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('All browser accessibility checks passed.');
