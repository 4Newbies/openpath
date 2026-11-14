import { beforeEach, describe, expect, it } from 'vitest';
import { cleanAnswer, formatPhone, normalizePhone, validateAnswer, validateFlow } from '../../shared/flow.js';
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

  it.each(['12', '0811 234 567', '0911 234 56', '09112345678', '+44 7700 900123', 'call me', '+251 911 234 567 ext 2'])(
    'rejects %s',
    (typed) => expect(validateAnswer(et, typed)).toBe('invalid_phone'),
  );

  it('formats the stored number for reading back', () => {
    expect(formatPhone('+251911234567')).toBe('+251 911 234 567');
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
    expect(validateFlow(flow({ type: 'phone', country: 'XX' })).join()).toMatch(/country must be one of ET, any/);
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

  it('shows +251 as text and tells screen readers it is already added', async () => {
    const el = await mount(flow);
    expect($(el, '.op-prefix').textContent).toBe('+251');
    expect($(el, '.op-prefix').getAttribute('aria-hidden')).toBe('true');
    const input = $(el, 'input[type=tel]');
    expect(input.getAttribute('autocomplete')).toBe('tel-national');
    expect(input.getAttribute('dir')).toBe('ltr');
    const firstDesc = el.shadowRoot.getElementById(input.getAttribute('aria-describedby').split(' ')[0]);
    expect(firstDesc.textContent).toBe('The country code +251 is already added.');
  });

  it('gives an example in the error message, in the learner’s language', async () => {
    const el = await mount(flow);
    type($(el, 'input[type=tel]'), '0811');
    button(el, 'Next').click();
    expect($(el, '.op-error').textContent).toContain('Type it like this: 0911 234 567.');
    expect(active(el)).toBe($(el, 'input[type=tel]'));
    el.remove();

    const am = await mount(flow, { lang: 'am' });
    type($(am, 'input[type=tel]'), '0811');
    button(am, 'ቀጣይ').click();
    expect($(am, '.op-error').textContent).toContain('እንዲህ ይጻፉት፦ 0911 234 567።');
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
