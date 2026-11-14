import { h, ids, sr } from '../dom.js';
import { icon } from '../icons.js';
import { pick, t } from '../messages.js';

/**
 * Every step gets a context:
 * { q, value, lang, error (message or null), onChange(value), uid }
 * and returns { node, focusField() }.
 */
export function idsFor(ctx) {
  const base = `op-${ctx.uid}-${ctx.q.id}`;
  return {
    heading: `${base}-heading`,
    hint: ctx.q.hint ? `${base}-hint` : null,
    error: ctx.error ? `${base}-error` : null,
    field: `${base}-field`,
  };
}

/** Text with a lang attribute when it fell back to another language. */
export function localized(tag, attrs, value, lang) {
  const { text, lang: used } = pick(value, lang);
  return h(tag, { ...attrs, lang: used !== lang ? used : undefined, text });
}

/**
 * The question heading. Focus moves here when the step opens.
 * With `labelFor`, the heading text is the field's real <label>.
 */
export function heading(ctx, { labelFor } = {}) {
  const { q, lang } = ctx;
  const i = idsFor(ctx);
  const { text, lang: used } = pick(q.label, lang);
  const textLang = used !== lang ? used : undefined;
  const optional = !q.required && q.type !== 'info' ? [' ', h('span', { class: 'op-optional', text: t(lang, 'optional') })] : [];
  const inner = labelFor
    ? h('label', { for: labelFor }, h('span', { lang: textLang, text }), optional)
    : h('span', {}, h('span', { lang: textLang, text }), optional);
  return h('h2', { id: i.heading, class: 'op-question', tabindex: '-1' }, icon(q.icon), inner);
}

export function hint(ctx) {
  const i = idsFor(ctx);
  return i.hint ? localized('p', { id: i.hint, class: 'op-hint' }, ctx.q.hint, ctx.lang) : null;
}

export function errorText(ctx) {
  const i = idsFor(ctx);
  return i.error ? h('p', { id: i.error, class: 'op-error' }, sr(t(ctx.lang, 'errorPrefix')), ctx.error) : null;
}

export function describedBy(ctx) {
  const i = idsFor(ctx);
  return ids(i.hint, i.error);
}

/** fieldset + legend wrapper used by every choice and the date question. */
export function group(ctx, children) {
  return h(
    'fieldset',
    { class: 'op-group', 'aria-describedby': describedBy(ctx) },
    h('legend', { class: 'op-legend' }, heading(ctx)),
    hint(ctx),
    errorText(ctx),
    children,
  );
}

/** One radio or checkbox row. The whole row is the click target. */
export function choice(ctx, { type, value, checked, label, hintText, onChange, index }) {
  const i = idsFor(ctx);
  const id = `${i.field}-${index}`;
  const hintId = hintText ? `${id}-hint` : undefined;
  const input = h('input', {
    type,
    id,
    name: `op-${ctx.uid}-${ctx.q.id}`,
    value,
    checked,
    'aria-invalid': ctx.error ? 'true' : undefined,
    'aria-describedby': hintId,
    onchange: onChange,
  });
  const row = h(
    'div',
    { class: 'op-option' },
    input,
    h('label', { for: id }, localized('span', {}, label, ctx.lang), hintText ? localized('span', { id: hintId, class: 'op-option-hint' }, hintText, ctx.lang) : null),
  );
  return { row, input };
}
