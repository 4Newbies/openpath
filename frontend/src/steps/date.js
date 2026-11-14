import { ethiopianToday, ethiopianToIso, isoToEthiopian } from '../../../shared/ethiopian.js';
import { answerCalendar } from '../../../shared/flow.js';
import { h, ids } from '../dom.js';
import { t, tList } from '../messages.js';
import { describedBy, group, idsFor } from './common.js';

// Date questions in either calendar. The question's "calendar" setting is
// where the learner starts; a button under the fields switches between
// "Use Gregorian calendar" and "Use Ethiopian calendar". The answer stores
// the ISO Gregorian date plus the calendar used:
//   { date: "2001-03-27", calendar: "gregorian" }
//   { date: "2001-03-27", calendar: "ethiopian", ethiopian: { year: 1993, month: 7, day: 18 } }
//
// Gregorian: three boxes (day, month, year) instead of a date picker. They
// work with every screen reader, accept paste and typing, and need no widget.
// Ethiopian: three native <select>s, each with its own label. 13 months;
// Pagume has 5 days, or 6 when the year mod 4 is 3 (checked on Next).
// Both sit in one fieldset whose legend is the question.

/** The calendar this question is answered in now. */
export function currentCalendar(q, value) {
  if (value && typeof value === 'object' && value.calendar) return value.calendar;
  if (value && typeof value === 'object' && value.ethiopian) return 'ethiopian';
  if (typeof value === 'string') return 'gregorian';
  return q.calendar === 'ethiopian' ? 'ethiopian' : 'gregorian';
}

export function splitDate(value) {
  const iso = typeof value === 'string' ? value : value?.date;
  const [year = '', month = '', day = ''] = typeof iso === 'string' ? iso.split('-') : [];
  return { day, month, year };
}

export function joinDate({ day, month, year }) {
  const d = day.trim();
  const m = month.trim();
  const y = year.trim();
  if (!d && !m && !y) return undefined;
  const pad = (s) => (s.length === 1 ? `0${s}` : s);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Answer for the Gregorian boxes (partly typed dates are kept as typed). */
export function gregorianAnswer(parts) {
  const date = joinDate(parts);
  return { ...(date ? { date } : {}), calendar: 'gregorian' };
}

/**
 * Answer for the Ethiopian lists: the ISO Gregorian date plus the date the
 * learner chose. Partly chosen dates keep their parts (no ISO date yet).
 */
export function ethiopianAnswer({ day, month, year }) {
  const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
  const ethiopian = { year: num(year), month: num(month), day: num(day) };
  const date = ethiopianToIso(ethiopian);
  return { ...(date ? { date } : {}), calendar: 'ethiopian', ethiopian };
}

/** The same day in the other calendar (or just the calendar choice if there is no full date yet). */
export function switchCalendar(value, to) {
  const iso = value && typeof value === 'object' ? value.date : value;
  const full = typeof iso === 'string' && isoToEthiopian(iso) ? iso : null;
  if (to === 'ethiopian') return full ? { date: full, calendar: 'ethiopian', ethiopian: isoToEthiopian(full) } : { calendar: 'ethiopian' };
  return full ? { date: full, calendar: 'gregorian' } : { calendar: 'gregorian' };
}

export function renderDate(ctx) {
  const { q, lang, simple } = ctx;
  const i = idsFor(ctx);
  const calendar = currentCalendar(q, ctx.value);
  const other = calendar === 'ethiopian' ? 'gregorian' : 'ethiopian';
  const fields = calendar === 'ethiopian' ? ethiopianFields(ctx, i) : gregorianFields(ctx, i);

  // Which calendar, with an example, read with the question.
  const noteId = `${i.field}-calendar`;
  const note = h('p', {
    id: noteId,
    class: 'op-hint op-calendar-note',
    text: t(lang, calendar === 'ethiopian' ? 'dateExampleEthiopian' : 'dateExampleGregorian', {}, simple),
  });
  const switchButton = h('button', {
    type: 'button',
    class: 'op-button op-secondary op-small op-calendar-switch',
    text: t(lang, other === 'gregorian' ? 'useGregorian' : 'useEthiopian', {}, simple),
    // The element converts the answer as it is now (it may have changed since this step was drawn).
    onclick: () => ctx.onSwitch?.(other, t(lang, other === 'gregorian' ? 'calendarNowGregorian' : 'calendarNowEthiopian', {}, simple)),
  });

  const fieldset = group(ctx, [note, fields.node, h('div', { class: 'op-calendar-tools' }, switchButton)]);
  fieldset.setAttribute('aria-describedby', ids(noteId, describedBy(ctx)));
  return {
    node: h('div', { class: 'op-step' }, fieldset),
    focusField: fields.focus,
    calendar,
  };
}

function gregorianFields(ctx, i) {
  const { q, lang, simple } = ctx;
  const parts = splitDate(answerCalendar(ctx.value) === 'gregorian' ? ctx.value : undefined);
  const bday = q.autocomplete === 'bday';
  const inputs = {};

  const box = (part, size) => {
    const id = `${i.field}-${part}`;
    const input = h('input', {
      id,
      type: 'text',
      inputmode: 'numeric',
      class: `op-input op-date-${part}`,
      autocomplete: bday ? `bday-${part}` : 'off',
      'aria-invalid': ctx.error ? 'true' : undefined,
      size,
      value: parts[part],
      oninput: () => ctx.onChange(gregorianAnswer({ day: inputs.day.value, month: inputs.month.value, year: inputs.year.value })),
    });
    inputs[part] = input;
    return h('div', { class: 'op-date-part' }, h('label', { for: id, text: t(lang, part, {}, simple) }), input);
  };

  return {
    node: h('div', { class: 'op-date' }, box('day', 2), box('month', 2), box('year', 4)),
    focus: () => inputs.day.focus(),
  };
}

const EARLIEST_ETHIOPIAN_YEAR = 1892; // 1900 in the Gregorian calendar

function ethiopianFields(ctx, i) {
  const { lang, simple } = ctx;
  const chosen = (ctx.value && typeof ctx.value === 'object' && ctx.value.ethiopian) || {};
  const months = tList(lang, 'ethiopianMonths');
  const thisYear = ethiopianToday().year;
  const selects = {};

  const options = {
    day: Array.from({ length: 30 }, (_, n) => [n + 1, String(n + 1)]),
    month: Array.from({ length: 13 }, (_, n) => [n + 1, months[n] ?? String(n + 1)]),
    year: Array.from({ length: thisYear - EARLIEST_ETHIOPIAN_YEAR + 1 }, (_, n) => [thisYear - n, String(thisYear - n)]),
  };

  const list = (part) => {
    const id = `${i.field}-${part}`;
    const select = h(
      'select',
      {
        id,
        class: `op-input op-select op-date-${part}`,
        'aria-invalid': ctx.error ? 'true' : undefined,
        onchange: () =>
          ctx.onChange(ethiopianAnswer({ day: selects.day.value, month: selects.month.value, year: selects.year.value })),
      },
      h('option', { value: '', text: t(lang, 'choose', {}, simple) }),
      options[part].map(([value, text]) => h('option', { value: String(value), text, selected: chosen[part] === value })),
    );
    selects[part] = select;
    return h('div', { class: 'op-date-part' }, h('label', { for: id, text: t(lang, part, {}, simple) }), select);
  };

  return {
    node: h('div', { class: 'op-date' }, list('day'), list('month'), list('year')),
    focus: () => selects.day.focus(),
  };
}
