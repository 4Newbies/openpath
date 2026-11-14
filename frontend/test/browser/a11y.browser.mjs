// Real-browser accessibility check for <openpath-flow>, using the Chrome or
// Edge already installed on this machine (playwright-core, no download).
//
//   npm run build && npm run test:browser
//
// Walks the whole default flow twice:
//   A. 1280px wide, default settings
//   B. 320px wide (= 1280px at 400% zoom) with "larger text" and "high contrast"
// and on every screen checks: axe (WCAG 2.2 AA, incl. colour contrast) has no
// serious/critical issues, no sideways scroll, targets >= 44x44px, text >= 18px,
// focus lands on the question heading, errors are linked and announced, the
// focus ring is 3px, and openpath:complete leaves out the private answer.
// The API is optional: without it the form saves to the device only.

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
  throw new Error('No Chrome or Edge found. Install one, or set PLAYWRIGHT channel.');
}

const shadow = (page, fn, arg) => page.evaluate(([src, a]) => {
  const host = document.querySelector('openpath-flow');
  // eslint-disable-next-line no-new-func
  return new Function('host', 'root', 'arg', src)(host, host.shadowRoot, a);
}, [fn, arg]);

async function checkScreen(page, where) {
  // 1. axe, including colour contrast, inside the shadow root.
  const violations = await page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    });
    return r.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
  violations.forEach((v) => fail(where, `axe ${v}`));

  // 2. No sideways scroll.
  const scroll = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  if (scroll[0] > scroll[1]) fail(where, `sideways scroll: content ${scroll[0]}px in a ${scroll[1]}px viewport`);

  // 3 + 4. Target sizes and text size.
  const problems = await shadow(page, `
    const out = [];
    for (const el of root.querySelectorAll('button, input:not([type=radio]):not([type=checkbox]), textarea, .op-option')) {
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) out.push('target ' + (el.className || el.tagName) + ' is ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    for (const el of root.querySelectorAll('p, label, button, input, textarea, dt, dd, legend, h2')) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (el.closest('.op-sr')) continue;
      if (fs < 18) out.push('text ' + el.tagName + ' "' + el.textContent.trim().slice(0, 30) + '" is ' + fs + 'px');
    }
    if (root.querySelector('.op-root').getAttribute('lang') !== host.getAttribute('lang')) out.push('lang attribute missing');
    return out;
  `);
  problems.forEach((p) => fail(where, p));
}

async function focusedIsHeading(page) {
  return shadow(page, `return root.activeElement && root.activeElement.matches('h2.op-question[tabindex="-1"]');`);
}

async function next(page, where, { expectHeadingFocus = true } = {}) {
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  if (expectHeadingFocus && !(await focusedIsHeading(page))) fail(where, 'focus did not move to the next question heading');
}

async function checkError(page, where, { field }) {
  await page.getByRole('button', { name: 'Next', exact: true }).click();
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

async function walk(browser, { width, prefs, label }) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  await page.addInitScript(axeSource);
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.goto(`${BASE}/demo/index.html`);
  await page.evaluate(() => {
    window.__events = [];
    document.addEventListener('openpath:complete', (e) => window.__events.push(e.detail));
  });
  const host = page.locator('openpath-flow');
  await host.getByRole('heading', { name: /Before you start/ }).waitFor();
  const at = (s) => `${label} / ${s}`;

  await checkScreen(page, at('info'));
  await next(page, at('info'));

  // access (multi, optional)
  for (const p of prefs) await host.getByLabel(p).check();
  await checkScreen(page, at('multi'));
  await next(page, at('multi'));

  // text (required, autocomplete=name)
  await checkError(page, at('text'), { field: 'input[text]' });
  await checkScreen(page, at('text with error'));
  const name = host.getByLabel(/full name/);
  if ((await name.getAttribute('autocomplete')) !== 'name') fail(at('text'), 'name field has no autocomplete="name"');
  await name.fill('Hana Tesfaye');
  await next(page, at('text'));

  // phone
  await host.getByLabel(/phone number/).fill('12');
  await checkError(page, at('phone'), { field: 'input[tel]' });
  if ((await host.getByLabel(/phone number/).getAttribute('autocomplete')) !== 'tel') fail(at('phone'), 'no autocomplete="tel"');
  // Paste must not be blocked: nothing may cancel the paste event.
  await host.getByLabel(/phone number/).focus();
  const pasteBlocked = await page.evaluate(() => {
    const el = document.querySelector('openpath-flow').shadowRoot.activeElement;
    const dt = new DataTransfer();
    dt.setData('text/plain', '+251 911 234 567');
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true, composed: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  if (pasteBlocked) fail(at('phone'), 'paste is blocked');
  await host.getByLabel(/phone number/).fill('+251 911 234 567');
  await checkScreen(page, at('phone'));
  await next(page, at('phone'));

  // date
  await checkError(page, at('date'), { field: 'input[text]' });
  await checkScreen(page, at('date with error'));
  await host.getByLabel('Day').fill('27');
  await host.getByLabel('Month').fill('3');
  await host.getByLabel('Year').fill('2001');
  await next(page, at('date'));

  // single
  await checkError(page, at('single'), { field: 'input[radio]' });
  await host.getByLabel(/Amharic/).check();
  await checkScreen(page, at('single'));
  await next(page, at('single'));

  // location
  await host.getByLabel(/city or region/).fill('Addis Ababa');
  await next(page, at('location'));

  // idType -> showIf
  const before = await host.locator('.op-progress').textContent();
  await host.getByLabel(/refer me to a partner/).check();
  await next(page, at('idType'));
  await host.getByRole('heading', { name: /organisation is helping/ }).waitFor();
  const after = await host.locator('.op-progress').textContent();
  const total = (s) => Number(s.match(/of (\d+)/)[1]);
  if (total(after) !== total(before) + 1) fail(at('showIf'), `step count did not grow by one (${before} -> ${after})`);

  // optional text: Skip
  await host.getByRole('button', { name: 'Skip this question' }).click();
  if (!(await focusedIsHeading(page))) fail(at('skip'), 'focus did not move after Skip');

  await host.getByLabel(/Data Analytics/).check();
  await next(page, at('course'));

  // private multiline
  await host.getByLabel(/support team to know privately/).fill('I use a wheelchair.');
  await checkScreen(page, at('textarea'));
  await next(page, at('support'));

  // review
  await host.getByRole('heading', { name: 'Check your answers' }).waitFor();
  await checkScreen(page, at('review'));
  // Edit returns to review after Next.
  await host.getByRole('button', { name: /Edit your answer to: Which course/ }).click();
  if (!(await focusedIsHeading(page))) fail(at('edit'), 'focus did not move to the question when editing');
  await host.getByLabel(/Virtual Assistant/).check();
  await next(page, at('edit'));
  if (!(await host.getByRole('heading', { name: 'Check your answers' }).isVisible())) fail(at('edit'), 'Next after Edit did not return to the review');

  // Focus ring: keyboard focus on a button has a 3px outline.
  await host.getByRole('button', { name: 'Back', exact: true }).focus();
  await page.keyboard.press('Tab');
  const ring = await shadow(page, `const s = getComputedStyle(root.activeElement); return s.outlineStyle + ' ' + s.outlineWidth;`);
  if (ring !== 'solid 3px') fail(at('focus ring'), `keyboard focus outline is "${ring}"`);

  await host.getByRole('button', { name: 'Send my answers' }).click();
  await host.getByRole('heading', { name: /Thank you/ }).waitFor();
  await checkScreen(page, at('done'));
  const events = await page.evaluate(() => window.__events);
  if (events.length !== 1) fail(at('complete'), `expected 1 openpath:complete event, got ${events.length}`);
  else {
    if ('supportRequest' in events[0].answers) fail(at('complete'), 'the private support request was included in the event');
    if (events[0].answers.course !== 'virtual-assistant') fail(at('complete'), 'edited answer missing from the event');
    if ('referringPartner' in events[0].answers) fail(at('complete'), 'skipped answer should be absent');
  }
  const stored = await page.evaluate(() => localStorage.getItem('openpath:alx-onboarding'));
  if (stored) fail(at('complete'), 'localStorage was not cleared after submit');
  consoleErrors.forEach((e) => fail(at('page'), `uncaught error: ${e}`));
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
  const a = await walk(browser, { width: 1280, prefs: [], label: 'A 1280px' });
  const b = await walk(browser, { width: 320, prefs: ['Larger text', /high contrast/], label: 'B 320px, larger text, high contrast' });
  await walk(browser, { width: 640, prefs: [], label: 'C 640px (200% zoom)' });
  if (apiUp && !(a?.sessionId && b?.sessionId)) fail('api', 'the API is running but the complete event has no sessionId');
} finally {
  await browser.close();
  server?.kill();
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('All browser accessibility checks passed.');
