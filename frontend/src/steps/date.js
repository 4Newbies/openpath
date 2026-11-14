import { ethiopianToday, ethiopianToIso } from '../../../shared/ethiopian.js';
import { h } from '../dom.js';
import { t, tList } from '../messages.js';
import { group, idsFor } from './common.js';

// Gregorian dates: three separate boxes (day, month, year) instead of a
// date picker. They work with every screen reader, accept paste and typing,
// and don't need a calendar widget.
//
// Ethiopian dates ("calendar": "ethiopian"): three native <select>s, each
// with its own label, inside the same fieldset + legend. 13 months; Pagume
// has 5 days, or 6 when the year mod 4 is 3 (checked on Next).

export function splitDate(value) {
  const [year = '', month = '', day = ''] = typeof value === 'string' ? value.split('-') : [];
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

/**
 * The answer for an Ethiopian date: the ISO Gregorian date plus the date
 * the learner chose. Partly chosen dates keep their parts (no ISO date yet);
 * nothing chosen is no answer.
 */
export function ethiopianAnswer({ day, month, year }) {
  const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
  const ethiopian = { year: num(year), month: num(month), day: num(day) };
  if (ethiopian.year === null && ethiopian.month === null && ethiopian.day === null) return undefined;
  const date = ethiopianToIso(ethiopian);
  return date ? { date, ethiopian } : { ethiopian };
}

export function renderDate(ctx) {
  return ctx.q.calendar === 'ethiopian' ? renderEthiopianDate(ctx) : renderGregorianDate(ctx);
}

function renderGregorianDate(ctx) {
  const { q, lang } = ctx;
  const i = idsFor(ctx);
  const parts = splitDate(ctx.value);
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
      oninput: () => ctx.onChange(joinDate({ day: inputs.day.value, month: inputs.month.value, year: inputs.year.value })),
    });
    inputs[part] = input;
    return h('div', { class: 'op-date-part' }, h('label', { for: id, text: t(lang, part, {}, ctx.simple) }), input);
  };

  const fields = h('div', { class: 'op-date' }, box('day', 2), box('month', 2), box('year', 4));
  return {
    node: h('div', { class: 'op-step' }, group(ctx, fields)),
    focusField: () => inputs.day.focus(),
  };
}

const EARLIEST_ETHIOPIAN_YEAR = 1892; // 1900 in the Gregorian calendar

function renderEthiopianDate(ctx) {
  const { lang, simple } = ctx;
  const i = idsFor(ctx);
  const chosen = ctx.value?.ethiopian ?? {};
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

  const fields = h('div', { class: 'op-date' }, list('day'), list('month'), list('year'));
  return {
    node: h('div', { class: 'op-step' }, group(ctx, fields)),
    focusField: () => selects.day.focus(),
  };
}
