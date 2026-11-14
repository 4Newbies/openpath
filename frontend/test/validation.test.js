import { describe, expect, it } from 'vitest';
import { validateAnswer, validateAnswers, validateFlow } from '../../shared/flow.js';
import { defaultFlow } from '../src/loader.js';

const q = (extra) => ({ id: 'q', label: { en: 'Q' }, ...extra });

describe('validateFlow', () => {
  it('accepts the default onboarding flow', () => {
    expect(validateFlow(defaultFlow)).toEqual([]);
  });

  it('explains every problem in plain words', () => {
    const errors = validateFlow({
      version: '1',
      flowId: 'Bad Id',
      title: { en: 'T', fr: 'x' },
      questions: [
        { id: 'a', type: 'single', label: { en: 'A' } },
        { id: 'a', type: 'text', label: { en: 'dup' } },
        { id: 'b', type: 'nope', label: { en: 'B' } },
        { id: 'c', type: 'text', label: { en: 'C' }, showIf: { id: 'later', equals: 'x' } },
        { id: 'later', type: 'text', label: { en: 'L' } },
        { id: 'd', type: 'info', label: { en: 'D' }, required: true },
        { id: 'e', type: 'text', label: { en: 'E' }, options: [] },
      ],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/flowId/),
        expect.stringMatching(/title\.fr is not a supported language/),
        expect.stringMatching(/"a"\) needs a non-empty options list/),
        expect.stringMatching(/id is used twice/),
        expect.stringMatching(/type must be one of/),
        expect.stringMatching(/must be an earlier question/),
        expect.stringMatching(/info screen and cannot be required/),
        expect.stringMatching(/cannot have options/),
      ]),
    );
  });

  it('rejects a showIf value that is not an option of the target', () => {
    const flow = structuredClone(defaultFlow);
    flow.questions.find((x) => x.id === 'referringPartner').showIf.equals = 'no-such-option';
    expect(validateFlow(flow).join()).toMatch(/not an option of "idType"/);
  });

  it('rejects non-objects', () => {
    expect(validateFlow(null)).toHaveLength(1);
    expect(validateFlow([])).toHaveLength(1);
  });
});

describe('validateAnswer', () => {
  it('requires an answer only for required questions', () => {
    expect(validateAnswer(q({ type: 'text', required: true }), '  ')).toBe('required');
    expect(validateAnswer(q({ type: 'text' }), '')).toBeNull();
    expect(validateAnswer(q({ type: 'text', required: true }), '', { checkRequired: false })).toBeNull();
  });

  it('checks text length', () => {
    expect(validateAnswer(q({ type: 'text', maxLength: 3 }), 'abcd')).toBe('too_long');
    expect(validateAnswer(q({ type: 'text', maxLength: 3 }), ' abc ')).toBeNull();
    expect(validateAnswer(q({ type: 'text' }), 'x'.repeat(501))).toBe('too_long');
  });

  it('checks phone numbers', () => {
    const phone = q({ type: 'phone' });
    expect(validateAnswer(phone, '+251 911 234 567')).toBeNull();
    expect(validateAnswer(phone, '0911-234-567')).toBeNull();
    expect(validateAnswer(phone, '12345')).toBe('invalid_phone');
    expect(validateAnswer(phone, 'call me')).toBe('invalid_phone');
    expect(validateAnswer(phone, 12345678)).toBe('invalid_type');
  });

  it('checks dates', () => {
    const date = q({ type: 'date' });
    expect(validateAnswer(date, '2001-03-27')).toBeNull();
    expect(validateAnswer(date, '2001-02-30')).toBe('invalid_date');
    expect(validateAnswer(date, '2001--27')).toBe('invalid_date');
    expect(validateAnswer(date, '1850-01-01')).toBe('invalid_date');
    expect(validateAnswer(date, '2999-01-01')).toBe('future_date');
  });

  it('checks choices', () => {
    const options = [{ value: 'a', label: { en: 'A' } }, { value: 'b', label: { en: 'B' } }];
    expect(validateAnswer(q({ type: 'single', options }), 'a')).toBeNull();
    expect(validateAnswer(q({ type: 'single', options }), 'z')).toBe('invalid_option');
    expect(validateAnswer(q({ type: 'multi', options }), ['a', 'b'])).toBeNull();
    expect(validateAnswer(q({ type: 'multi', options }), ['a', 'a'])).toBe('invalid_option');
    expect(validateAnswer(q({ type: 'multi', options }), 'a')).toBe('invalid_type');
    expect(validateAnswer(q({ type: 'multi', options, required: true }), [])).toBe('required');
    expect(validateAnswer(q({ type: 'yesno' }), false)).toBeNull();
    expect(validateAnswer(q({ type: 'yesno' }), 'yes')).toBe('invalid_type');
  });

  it('does not take answers on info screens', () => {
    expect(validateAnswer(q({ type: 'info' }), undefined)).toBeNull();
    expect(validateAnswer(q({ type: 'info' }), 'x')).toBe('not_answerable');
  });
});

describe('validateAnswers', () => {
  const complete = {
    fullName: ' Hana ',
    phone: '0911234567',
    dateOfBirth: '2001-03-27',
    language: 'am',
    location: 'Adama',
    idType: 'passport',
    course: 'data-analytics',
  };

  it('saves partial progress but flags unknown ids and bad formats', () => {
    const { errors } = validateAnswers(defaultFlow, { fullName: 'A', nope: 1, phone: 'x' });
    expect(errors).toEqual([
      { field: 'nope', code: 'unknown_question' },
      { field: 'phone', code: 'invalid_phone' },
    ]);
  });

  it('on submit, requires visible required answers and drops hidden ones', () => {
    const { errors, clean } = validateAnswers(defaultFlow, { ...complete, referringPartner: 'UNHCR' }, { mode: 'submit' });
    expect(errors).toEqual([]);
    expect(clean.fullName).toBe('Hana');
    expect(clean).not.toHaveProperty('referringPartner'); // idType is not refer-me
    expect(validateAnswers(defaultFlow, { fullName: 'A' }, { mode: 'submit' }).errors[0]).toEqual({ field: 'phone', code: 'required' });
  });
});
