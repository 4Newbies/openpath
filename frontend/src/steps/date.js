import { h } from '../dom.js';
import { t } from '../messages.js';
import { group, idsFor } from './common.js';

// Three separate boxes (day, month, year) instead of a date picker: they
// work with every screen reader, accept paste and typing, and don't need
// a calendar widget.

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

export function renderDate(ctx) {
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
