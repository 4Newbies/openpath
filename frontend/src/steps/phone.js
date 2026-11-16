import { callingCode, countryForNumber, phoneCountry } from '../../../shared/flow.js';
import { countryList } from '../countries.js';
import { h } from '../dom.js';
import { packInfo, t } from '../messages.js';
import { describedBy, errorText, heading, hint, idsFor } from './common.js';
import { renderText } from './text.js';

// Phone numbers: a native "Country code" list (the question's country first,
// default ET, then Ethiopia's neighbours, then every country A to Z, named in
// the form's language) and a box for the number the way the learner knows it:
// 0911 234 567, 0711 234 567 or 911 234 567. The answer carries the chosen
// calling code ("+251 0911 234 567"), so it is checked against that country,
// and it is stored as +251911234567. The number box is always left to right;
// the list follows the form's direction. "country": "any" is a plain phone box.

// The country each phone question was last set to, so a re-render (an error,
// a language switch) keeps it; +1 is several countries, the number can't tell.
const chosen = new Map();

export function renderPhone(ctx) {
  const first = phoneCountry(ctx.q);
  if (first === 'any' || !callingCode(first)) return renderText(ctx, { type: 'tel', autocomplete: 'tel', inputmode: 'tel', dir: 'ltr' });

  const { q, lang, simple } = ctx;
  const i = idsFor(ctx);
  const key = `${ctx.uid}:${q.id}`;
  const raw = typeof ctx.value === 'string' ? ctx.value.trim() : '';
  let iso = countryForNumber(raw, chosen.get(key) ?? first) ?? chosen.get(key) ?? first;
  const code = () => `+${callingCode(iso)}`;
  // Show the number without the calling code, which the list already shows.
  const shown = raw.startsWith(code()) ? raw.slice(code().length).trim() : raw;

  const tr = (k) => t(lang, k, {}, simple);
  const option = (c) =>
    h('option', {
      value: c.iso,
      lang: c.lang !== lang ? c.lang : undefined,
      selected: c.iso === iso,
      // The calling code is isolated so it reads +251 in a right-to-left list too.
      text: `${c.name} ⁦+${c.callingCode}⁩`,
    });
  const { near, rest } = countryList(lang, first);
  const selectId = `${i.field}-country`;
  const select = h(
    'select',
    {
      id: selectId,
      class: 'op-input op-phone-country',
      autocomplete: 'tel-country-code',
      onchange: () => {
        iso = select.value;
        chosen.set(key, iso);
        emit();
      },
    },
    h('optgroup', { label: tr('phoneCountriesNear') }, near.map(option)),
    h('optgroup', { label: tr('phoneCountriesAll') }, rest.map(option)),
  );

  const field = h('input', {
    id: i.field,
    name: q.id,
    type: 'tel',
    class: 'op-input op-phone-number',
    dir: 'ltr',
    inputmode: 'tel',
    autocomplete: q.autocomplete ?? 'tel-national',
    'aria-required': q.required ? 'true' : undefined,
    'aria-invalid': ctx.error ? 'true' : undefined,
    'aria-describedby': describedBy(ctx),
    value: shown,
    oninput: () => {
      // A number typed with its own + (or 00) code picks that country in the list.
      const typed = field.value.trim();
      const own = /^(\+|00)/.test(typed) ? countryForNumber(typed, iso) : null;
      if (own && own !== iso) {
        iso = own;
        select.value = own;
        chosen.set(key, own);
      }
      emit();
    },
  });

  function emit() {
    const typed = field.value.trim();
    ctx.onChange(!typed ? '' : /^(\+|00)/.test(typed) ? typed : `${code()} ${typed}`);
  }

  const box = h(
    'div',
    { class: 'op-phone', dir: 'ltr' },
    h(
      'div',
      { class: 'op-phone-part op-phone-code', dir: packInfo(lang).dir },
      h('label', { for: selectId, class: 'op-phone-label', text: tr('phoneCountryLabel') }),
      select,
    ),
    h('div', { class: 'op-phone-part op-phone-main' }, field),
  );
  return {
    node: h('div', { class: 'op-step' }, heading(ctx, { labelFor: i.field }), hint(ctx), errorText(ctx), box),
    focusField: () => field.focus(),
  };
}
