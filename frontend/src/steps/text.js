import { h } from '../dom.js';
import { describedBy, errorText, heading, hint, idsFor } from './common.js';

export function renderText(ctx, { type = 'text', autocomplete, inputmode } = {}) {
  const { q } = ctx;
  const i = idsFor(ctx);
  const attrs = {
    id: i.field,
    name: q.id,
    class: 'op-input',
    autocomplete: q.autocomplete ?? autocomplete ?? 'off',
    inputmode,
    'aria-required': q.required ? 'true' : undefined,
    'aria-invalid': ctx.error ? 'true' : undefined,
    'aria-describedby': describedBy(ctx),
    spellcheck: q.autocomplete === 'name' ? 'false' : undefined,
    oninput: (e) => ctx.onChange(e.target.value),
  };
  // No maxlength attribute: it silently cuts pasted text. Length is checked on Next instead.
  const field = q.multiline ? h('textarea', { ...attrs, rows: '5' }) : h('input', { ...attrs, type });
  field.value = typeof ctx.value === 'string' ? ctx.value : '';
  return {
    node: h('div', { class: 'op-step' }, heading(ctx, { labelFor: i.field }), hint(ctx), errorText(ctx), field),
    focusField: () => field.focus(),
  };
}
