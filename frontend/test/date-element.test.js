import { beforeEach, describe, expect, it } from 'vitest';
import { ethiopianToday } from '../../shared/ethiopian.js';
import { resetPacks } from '../src/messages.js';
import { $, $$, active, button, mount } from './helpers.js';

const flow = {
  version: '1',
  flowId: 'date-test',
  title: { en: 'Dates' },
  questions: [
    { id: 'dob', type: 'date', calendar: 'ethiopian', required: true, label: { en: 'When were you born?', am: 'መቼ ተወለዱ?' } },
  ],
};

beforeEach(() => {
  localStorage.clear();
  document.body.textContent = '';
  resetPacks();
});

function choose(el, part, value) {
  const s = $(el, `select.op-date-${part}`);
  s.value = String(value);
  s.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Ethiopian date question', () => {
  it('is a fieldset with a legend and three labelled native selects (day, month, year)', async () => {
    const el = await mount(flow);
    const fieldset = $(el, 'fieldset');
    expect(fieldset.querySelector('legend').textContent).toContain('When were you born?');
    const selects = $$(el, 'fieldset select');
    expect(selects.map((s) => $(el, `label[for="${s.id}"]`).textContent)).toEqual(['Day', 'Month', 'Year']);
    expect(selects[0].options).toHaveLength(31); // "Choose" + 1..30
    const months = [...selects[1].options].slice(1).map((o) => o.textContent);
    expect(months).toHaveLength(13);
    expect(months[0]).toBe('Meskerem');
    expect(months[12]).toBe('Pagume');
    expect(selects[2].options[1].value).toBe(String(ethiopianToday().year)); // this year first
  });

  it('shows Amharic month names in Amharic', async () => {
    const el = await mount(flow, { lang: 'am' });
    const months = [...$(el, 'select.op-date-month').options].slice(1).map((o) => o.textContent);
    expect(months[0]).toBe('መስከረም');
    expect(months[12]).toBe('ጳጉሜን');
    expect($(el, `label[for="${$(el, 'select.op-date-day').id}"]`).textContent).toBe('ቀን');
  });

  it('stores the ISO Gregorian date with the Ethiopian date, and shows it in the learner’s calendar on review', async () => {
    const el = await mount(flow);
    choose(el, 'day', 18);
    choose(el, 'month', 7);
    choose(el, 'year', 1993);
    expect(el.store.state.answers.dob).toEqual({ date: '2001-03-27', calendar: 'ethiopian', ethiopian: { year: 1993, month: 7, day: 18 } });
    button(el, 'Next').click();
    expect($(el, '.op-review-item dd').textContent).toBe('18 Megabit 1993 (Ethiopian calendar)');
  });

  it('review in Amharic uses the Amharic month and date order', async () => {
    localStorage.setItem('openpath:date-test', JSON.stringify({ flowVersion: '1', step: 'review', answers: { dob: { date: '2001-03-27', ethiopian: { year: 1993, month: 7, day: 18 } } } }));
    const el = await mount(flow, { lang: 'am' });
    expect($(el, '.op-review-item dd').textContent).toBe('መጋቢት 18 ቀን 1993 ዓ.ም.');
  });

  it('switches to the Gregorian calendar and back, keeping the same day', async () => {
    const el = await mount(flow);
    expect($(el, '.op-calendar-note').textContent).toContain('Ethiopian calendar');
    expect($(el, 'fieldset').getAttribute('aria-describedby')).toContain($(el, '.op-calendar-note').id);
    choose(el, 'day', 18);
    choose(el, 'month', 7);
    choose(el, 'year', 1993);
    button(el, 'Use Gregorian calendar').click();
    expect(active(el)).toBe($(el, '.op-calendar-switch'));
    expect(active(el).textContent).toBe('Use Ethiopian calendar');
    await new Promise((r) => setTimeout(r, 80));
    expect($(el, '[aria-live]').textContent).toBe('Now using the Gregorian calendar.');
    expect($$(el, '.op-date input').map((i) => i.value)).toEqual(['27', '03', '2001']);
    expect(el.store.state.answers.dob).toEqual({ date: '2001-03-27', calendar: 'gregorian' });
    button(el, 'Next').click();
    expect($(el, '.op-review-item dd').textContent).toBe('27 March 2001');

    button(el, 'Edit').click();
    button(el, 'Use Ethiopian calendar').click();
    expect($(el, 'select.op-date-month').value).toBe('7');
    expect(el.store.state.answers.dob.calendar).toBe('ethiopian');
  });

  it('starts in the calendar the question asks for; the choice is kept without a date', async () => {
    const greg = { ...flow, flowId: 'greg', questions: [{ ...flow.questions[0], calendar: 'gregorian' }] };
    const el = await mount(greg);
    expect($$(el, '.op-date input')).toHaveLength(3);
    button(el, 'Use Ethiopian calendar').click();
    expect($$(el, '.op-date select')).toHaveLength(3);
    expect(el.store.state.answers.dob).toEqual({ calendar: 'ethiopian' });
    button(el, 'Next').click();
    expect($(el, '.op-error').textContent).toContain('Please give the day, month and year.');
  });

  it('keeps partly chosen parts, and explains Pagume when the day does not exist', async () => {
    const el = await mount(flow);
    button(el, 'Next').click();
    expect($(el, '.op-error').textContent).toContain('Please give the day, month and year.');
    expect(active(el)).toBe($(el, 'select.op-date-day'));

    choose(el, 'day', 6);
    choose(el, 'month', 13);
    choose(el, 'year', 2016); // 2016 % 4 = 0: Pagume has 5 days
    button(el, 'Next').click();
    expect($(el, '.op-error').textContent).toContain('Pagume has 5 days, or 6 in a leap year');
    expect($(el, 'select.op-date-day').value).toBe('6');
    expect($(el, 'select.op-date-year').getAttribute('aria-invalid')).toBe('true');

    choose(el, 'year', 2015); // 2015 % 4 = 3: 6 Pagume exists
    button(el, 'Next').click();
    expect($(el, '.op-review-item dd').textContent).toBe('6 Pagume 2015 (Ethiopian calendar)');
    expect(el.store.state.answers.dob.date).toBe('2023-09-11');
  });
});
