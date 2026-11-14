import { PHONE_COUNTRIES, phoneCountry } from '../../../shared/flow.js';
import { h, ids } from '../dom.js';
import { t } from '../messages.js';
import { describedBy, errorText, heading, hint, idsFor } from './common.js';
import { renderText } from './text.js';

// Phone numbers for a country (default ET): the calling code is shown as
// text before the box (+251), so the learner types the number the way they
// know it: 0911 234 567, 0711 234 567 or 911 234 567. Screen readers hear
// "The country code +251 is already added." The number is stored as
// +251911234567. Always left to right, also in a right-to-left form.
// "country": "any" is a plain phone box (no prefix, any format).

export function renderPhone(ctx) {
  const country = PHONE_COUNTRIES[phoneCountry(ctx.q)];
  if (!country) return renderText(ctx, { type: 'tel', autocomplete: 'tel', inputmode: 'tel', dir: 'ltr' });

  const { q, lang, simple } = ctx;
  const i = idsFor(ctx);
  const code = `+${country.callingCode}`;
  const prefixId = `${i.field}-prefix`;
  // Show the number without the calling code that is already on screen.
  const raw = typeof ctx.value === 'string' ? ctx.value : '';
  const shown = raw.startsWith(code) ? raw.slice(code.length) : raw;

  const field = h('input', {
    id: i.field,
    name: q.id,
    type: 'tel',
    class: 'op-input',
    dir: 'ltr',
    inputmode: 'tel',
    autocomplete: q.autocomplete ?? 'tel-national',
    'aria-required': q.required ? 'true' : undefined,
    'aria-invalid': ctx.error ? 'true' : undefined,
    'aria-describedby': ids(prefixId, describedBy(ctx)),
    value: shown,
    oninput: (e) => ctx.onChange(e.target.value),
  });
  const box = h(
    'div',
    { class: 'op-phone', dir: 'ltr' },
    h('span', { class: 'op-prefix', 'aria-hidden': 'true', text: code }),
    field,
  );
  return {
    node: h(
      'div',
      { class: 'op-step' },
      heading(ctx, { labelFor: i.field }),
      hint(ctx),
      errorText(ctx),
      h('span', { id: prefixId, class: 'op-sr', text: t(lang, 'phonePrefix', { code }, simple) }),
      box,
    ),
    focusField: () => field.focus(),
  };
}
