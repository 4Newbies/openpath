// axe-core on every question type, in the normal and the error state, plus
// the review and done screens. Fails on any serious or critical issue.
// jsdom can't compute colour contrast or layout; `npm run test:browser`
// covers those in a real browser.
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QUESTION_TYPES } from '../../shared/flow.js';
import { $, button, mount } from './helpers.js';

const options = [
  { value: 'one', label: { en: 'Option one' }, hint: { en: 'With a hint' } },
  { value: 'two', label: { en: 'Option two' } },
];
const questionOf = (type) => ({
  id: `q_${type}`,
  type,
  label: { en: `A ${type} question` },
  hint: { en: 'Some help text' },
  icon: 'info',
  ...(type === 'info' ? {} : { required: true }),
  ...(['single', 'multi'].includes(type) ? { options } : {}),
  ...(type === 'text' ? { autocomplete: 'name' } : {}),
});
const flowOf = (questions) => ({ version: '1', flowId: 'axe', title: { en: 'Axe' }, questions });

async function serious() {
  const results = await axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => JSON.stringify(n.target)).join(', ')})`);
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.lang = 'en';
  document.title = 'axe test';
});
afterEach(() => {
  document.body.textContent = '';
});

describe('axe: each question type', () => {
  for (const type of QUESTION_TYPES) {
    it(`${type}: no serious or critical issues, also with an error shown`, async () => {
      const el = await mount(flowOf([questionOf(type)]));
      expect(await serious()).toEqual([]);
      if (type !== 'info') {
        button(el, 'Next').click();
        expect($(el, '.op-error')).not.toBeNull();
        expect(await serious()).toEqual([]);
      }
    });
  }

  it('optional text question with Skip, multiline and the review and done screens', async () => {
    const el = await mount(
      flowOf([
        { id: 'note', type: 'text', multiline: true, label: { en: 'A note' } },
        { id: 'yn', type: 'yesno', label: { en: 'Yes or no' } },
      ]),
    );
    expect(await serious()).toEqual([]);
    button(el, 'Skip this question').click();
    button(el, 'Skip this question').click();
    expect($(el, 'h2').textContent).toBe('Check your answers');
    expect(await serious()).toEqual([]);
    button(el, 'Send my answers').click();
    await new Promise((r) => setTimeout(r, 10));
    expect($(el, 'h2').textContent).toContain('Thank you');
    expect(await serious()).toEqual([]);
  });
});
