import { h } from '../dom.js';
import { t } from '../messages.js';
import { choice, group } from './common.js';

export function renderYesNo(ctx) {
  const opts = [
    { value: true, key: 'yes' },
    { value: false, key: 'no' },
  ];
  const inputs = opts.map((o, index) =>
    choice(ctx, {
      type: 'radio',
      value: o.key,
      checked: ctx.value === o.value,
      label: { en: t(ctx.lang, o.key, {}, ctx.simple), [ctx.lang]: t(ctx.lang, o.key, {}, ctx.simple) },
      index,
      onChange: () => ctx.onChange(o.value),
    }),
  );
  return {
    node: h('div', { class: 'op-step' }, group(ctx, h('div', { class: 'op-options op-options-inline' }, inputs.map((x) => x.row)))),
    focusField: () => (inputs.find((x) => x.input.checked) ?? inputs[0]).input.focus(),
  };
}
