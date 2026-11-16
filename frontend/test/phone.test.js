import { beforeEach, describe, expect, it } from 'vitest';
import { cleanAnswer, countryForNumber, formatPhone, normalizePhone, validateAnswer, validateFlow } from '../../shared/flow.js';
import { resetPacks } from '../src/messages.js';
import { $, active, button, mount, type } from './helpers.js';

describe('phone numbers for a country (default ET)', () => {
  const et = { id: 'p', type: 'phone', label: { en: 'Phone' } };

  it.each([
    ['0911 234 567', '+251911234567'],
    ['0711-234-567', '+251711234567'],
    ['911234567', '+251911234567'],
    ['+251 911 234 567', '+251911234567'],
    ['+251 (0)911 234 567', '+251911234567'],
    ['00251 911 234 567', '+251911234567'],
    ['251911234567', '+251911234567'],
  ])('accepts %s and stores %s', (typed, stored) => {
    expect(validateAnswer(et, typed)).toBeNull();
    expect(normalizePhone(typed)).toBe(stored);
    expect(cleanAnswer(et, typed)).toBe(stored);
  });

  it.each([
    ['+44 7700 900123', '+447700900123'],
    ['+254 712 345 678', '+254712345678'],
    ['+1 (202) 555-0143', '+12025550143'],
  ])('accepts the international number %s and stores %s', (typed, stored) => {
    expect(validateAnswer(et, typed)).toBeNull();
    expect(cleanAnswer(et, typed)).toBe(stored);
  });

  it.each(['12', '0811 234 567', '0911 234 56', '09112345678', '+251 811 234 567', '+1234567', '+1234567890123456', '+44 abc', 'call me', '+251 911 234 567 ext 2'])(
    'rejects %s',
    (typed) => expect(validateAnswer(et, typed)).toBe('invalid_phone'),
  );

  it('formats the stored number for reading back', () => {
    expect(formatPhone('+251911234567')).toBe('+251 911 234 567');
    expect(formatPhone('+254712345678')).toBe('+254 712 345 678');
    expect(formatPhone('+447700900123')).toBe('+44 7700900123');
  });

  // The "Country code" list puts the chosen calling code in front of the number.
  it.each([
    ['+254 0712 345 678', '+254712345678'], // Kenya, typed with its trunk 0
    ['+254 712 345 678', '+254712345678'],
    ['+291 07 123 456', '+2917123456'], // Eritrea
    ['+252 61 234 5678', '+252612345678'], // Somalia
    ['+249 091 234 5678', '+249912345678'], // Sudan
    ['+211 0912 345 678', '+211912345678'], // South Sudan
    ['+253 77 12 34 56', '+25377123456'], // Djibouti: no trunk prefix
    ['+44 07700 900123', '+447700900123'], // elsewhere: the leading 0 is dropped
    ['+39 06 1234 5678', '+390612345678'], // ... except where it is part of the number (Italy)
  ])('checks %s against the chosen country and stores %s', (typed, stored) => {
    expect(validateAnswer(et, typed)).toBeNull();
    expect(cleanAnswer(et, typed)).toBe(stored);
  });

  it.each(['+254 0911 234 567', '+253 0911 2345', '+291 1234', '+44 12'])('rejects %s: not a number for that country', (typed) => {
    expect(validateAnswer(et, typed)).toBe('invalid_phone');
  });

  it('countryForNumber finds the country, preferring the question country for a shared code', () => {
    expect(countryForNumber('+254712345678', 'ET')).toBe('KE');
    expect(countryForNumber('+1 202 555 0143', 'ET')).toBe('US');
    expect(countryForNumber('+1 416 555 0143', 'CA')).toBe('CA');
    expect(countryForNumber('0911234567', 'ET')).toBeNull();
  });

  it('"country": "any" keeps the free format', () => {
    const any = { ...et, country: 'any' };
    expect(validateAnswer(any, '+44 7700 900123')).toBeNull();
    expect(cleanAnswer(any, ' +44 7700 900123 ')).toBe('+44 7700 900123');
    expect(validateAnswer(any, '12')).toBe('invalid_phone');
  });

  it('country is only for phone questions, and must be known', () => {
    const flow = (extra) => ({ version: '1', flowId: 'f', title: { en: 'T' }, questions: [{ id: 'a', label: { en: 'A' }, ...extra }] });
    expect(validateFlow(flow({ type: 'phone', country: 'ET' }))).toEqual([]);
    expect(validateFlow(flow({ type: 'phone', country: 'KE' }))).toEqual([]);
    expect(validateFlow(flow({ type: 'phone', country: 'XX' })).join()).toMatch(/country must be a two-letter country code such as ET or KE, or any/);
    expect(validateFlow(flow({ type: 'text', country: 'ET' })).join()).toMatch(/only applies to phone/);
  });
});

describe('phone question in the form', () => {
  const flow = {
    version: '1',
    flowId: 'phone-test',
    title: { en: 'Phone' },
    questions: [{ id: 'phone', type: 'phone', required: true, label: { en: 'Your phone number', am: 'ስልክ ቁጥርዎ' } }],
  };

  beforeEach(() => {
    localStorage.clear();
    document.body.textContent = '';
    resetPacks();
  });

  const select = (el) => $(el, 'select.op-phone-country');
  const choose = (el, iso) => {
    select(el).value = iso;
    select(el).dispatchEvent(new Event('change', { bubbles: true }));
  };

  it('has a native "Country code" list, starting on the question country (ET)', async () => {
    const el = await mount(flow);
    const list = select(el);
    expect(el.shadowRoot.querySelector(`label[for="${list.id}"]`).textContent).toBe('Country code');
    expect(list.value).toBe('ET');
    expect(list.selectedOptions[0].textContent).toBe('Ethiopia \u2066+251\u2069');
    const input = $(el, 'input[type=tel]');
    expect(input.getAttribute('autocomplete')).toBe('tel-national');
    expect(input.getAttribute('dir')).toBe('ltr');
    expect($(el, '.op-phone').getAttribute('dir')).toBe('ltr');
  });

  it('lists Ethiopia, then its neighbours, then every country A to Z', async () => {
    const el = await mount(flow);
    const [near, all] = [...select(el).querySelectorAll('optgroup')];
    expect(near.label).toBe('Nearby countries');
    expect([...near.children].map((o) => o.value)).toEqual(['ET', 'ER', 'SO', 'SD', 'SS', 'KE', 'DJ']);
    expect(all.label).toBe('All countries');
    const names = [...all.children].map((o) => o.textContent.replace(/ \u2066.*$/, ''));
    expect(names.length).toBeGreaterThan(200);
    expect(names).toEqual([...names].sort(new Intl.Collator('en').compare));
    expect(names).not.toContain('Kenya'); // already at the top
  });

  it('a question with another country starts there', async () => {
    const el = await mount({ ...flow, questions: [{ ...flow.questions[0], country: 'KE' }] });
    expect(select(el).value).toBe('KE');
    expect([...select(el).querySelector('optgroup').children].map((o) => o.value).slice(0, 2)).toEqual(['KE', 'ET']);
  });

  it('names the countries in the form language, and keeps working right to left', async () => {
    const el = await mount(flow, { lang: 'ar' });
    expect($(el, '.op-root').getAttribute('dir')).toBe('rtl');
    expect($(el, '.op-phone-label').textContent).toBe('رمز الدولة');
    expect($(el, '.op-phone-code').getAttribute('dir')).toBe('rtl');
    expect($(el, '.op-phone').getAttribute('dir')).toBe('ltr');
    expect(select(el).selectedOptions[0].textContent).toBe('إثيوبيا \u2066+251\u2069');
    choose(el, 'KE');
    type($(el, 'input[type=tel]'), '0712 345 678');
    button(el, 'التالي').click();
    expect(el.store.state.answers.phone).toBe('+254712345678');
  });

  it('stores a number for the chosen country in international format', async () => {
    const el = await mount(flow);
    choose(el, 'KE');
    type($(el, 'input[type=tel]'), '0712 345 678');
    button(el, 'Next').click();
    expect(el.store.state.answers.phone).toBe('+254712345678');
    expect($(el, '.op-review-item dd').textContent).toBe('+254 712 345 678');
    button(el, 'Edit').click();
    expect(select(el).value).toBe('KE');
    expect($(el, 'input[type=tel]').value).toBe('712345678');
  });

  it('checks the number for the chosen country and names it in the error, in the learner language', async () => {
    const el = await mount(flow);
    choose(el, 'KE');
    type($(el, 'input[type=tel]'), '0911 234 567');
    button(el, 'Next').click();
    expect($(el, '.op-error').textContent).toContain(
      'This is not a phone number for Kenya. Type it like this: 0712 345 678. For a number from another country, choose its country code.',
    );
    expect(active(el)).toBe($(el, 'input[type=tel]'));
    expect(select(el).value).toBe('KE'); // still chosen after the error
    el.remove();
    localStorage.removeItem("openpath:phone-test"); // the Kenya answer was saved

    const am = await mount(flow, { lang: 'am' });
    type($(am, 'input[type=tel]'), '0811');
    button(am, 'ቀጣይ').click();
    expect($(am, '.op-error').textContent).toContain('እንዲህ ይጻፉት፦ 0911 234 567።');
  });

  it('a country without a known format still gets a clear error', async () => {
    const el = await mount(flow);
    choose(el, 'GB');
    type($(el, 'input[type=tel]'), '12');
    button(el, 'Next').click();
    expect($(el, '.op-error').textContent).toContain('This is not a phone number for United Kingdom. Check the number, or choose another country code.');
  });

  it('a number typed with its own + code picks that country in the list', async () => {
    const el = await mount(flow);
    type($(el, 'input[type=tel]'), '+44 7700 900123');
    expect(select(el).value).toBe('GB');
  });

  it('keeps a number from another country as typed, in international format', async () => {
    const el = await mount(flow);
    type($(el, 'input[type=tel]'), '+44 7700 900123');
    button(el, 'Next').click();
    expect(el.store.state.answers.phone).toBe('+447700900123');
    expect($(el, '.op-review-item dd').textContent).toBe('+44 7700900123');
  });

  it('stores the number in international format and reads it back on review', async () => {
    const el = await mount(flow);
    type($(el, 'input[type=tel]'), '0911 234 567');
    button(el, 'Next').click();
    expect(el.store.state.answers.phone).toBe('+251911234567');
    expect($(el, '.op-review-item dd').textContent).toBe('+251 911 234 567');
    button(el, 'Edit').click();
    expect($(el, 'input[type=tel]').value).toBe('911234567'); // without the +251 already on screen
  });
});
