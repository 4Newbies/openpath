import { h } from '../dom.js';
import { choice, group } from './common.js';

export function renderMulti(ctx) {
  const selected = new Set(Array.isArray(ctx.value) ? ctx.value : []);
  const inputs = ctx.q.options.map((o, index) =>
    choice(ctx, {
      type: 'checkbox',
      value: o.value,
      checked: selected.has(o.value),
      label: ctx.simple && o.simple ? o.simple : o.label,
      hintText: o.hint,
      index,
      onChange: () => {
        // Keep the order of the options list, whatever order they were ticked in.
        const values = inputs.filter((x) => x.input.checked).map((x) => x.input.value);
        ctx.onChange(values.length ? values : undefined);
      },
    }),
  );
  return {
    node: h('div', { class: 'op-step' }, group(ctx, h('div', { class: 'op-options' }, inputs.map((x) => x.row)))),
    focusField: () => inputs[0].input.focus(),
  };
}
