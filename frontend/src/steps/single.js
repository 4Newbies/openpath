import { h } from '../dom.js';
import { choice, group } from './common.js';

export function renderSingle(ctx) {
  const inputs = ctx.q.options.map((o, index) =>
    choice(ctx, {
      type: 'radio',
      value: o.value,
      checked: ctx.value === o.value,
      label: ctx.simple && o.simple ? o.simple : o.label,
      hintText: o.hint,
      index,
      onChange: () => ctx.onChange(o.value),
    }),
  );
  return {
    node: h('div', { class: 'op-step' }, group(ctx, h('div', { class: 'op-options' }, inputs.map((x) => x.row)))),
    focusField: () => (inputs.find((x) => x.input.checked) ?? inputs[0]).input.focus(),
  };
}
