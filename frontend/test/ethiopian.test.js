import { describe, expect, it } from 'vitest';
import {
  daysInEthiopianMonth,
  ethiopianToday,
  ethiopianToIso,
  isoToEthiopian,
  isValidEthiopianDate,
} from '../../shared/ethiopian.js';
import { validateAnswer, validateAnswers, validateFlow } from '../../shared/flow.js';

const E = (year, month, day) => ({ year, month, day });

describe('Ethiopian calendar conversion', () => {
  it.each([
    [E(2017, 1, 1), '2024-09-11', '1 Meskerem 2017'],
    [E(2016, 1, 1), '2023-09-12', '1 Meskerem 2016'],
    [E(2015, 13, 6), '2023-09-11', '6 Pagume 2015'],
    [E(2019, 3, 5), '2026-11-14', '5 Hidar 2019'],
  ])('%j = %s (%s)', (eth, iso) => {
    expect(ethiopianToIso(eth)).toBe(iso);
    expect(isoToEthiopian(iso)).toEqual(eth);
  });

  it('knows today: 5 Hidar 2019 is 14 November 2026', () => {
    expect(ethiopianToday(new Date(Date.UTC(2026, 10, 14, 12)))).toEqual(E(2019, 3, 5));
  });

  it('Pagume has 5 days, or 6 when the Ethiopian year mod 4 is 3', () => {
    expect(daysInEthiopianMonth(2015, 13)).toBe(6); // 2015 % 4 === 3
    for (const y of [2016, 2017, 2018]) expect(daysInEthiopianMonth(y, 13)).toBe(5);
    expect(daysInEthiopianMonth(2019, 13)).toBe(6);
    expect(daysInEthiopianMonth(2016, 1)).toBe(30);
    expect(isValidEthiopianDate(E(2016, 13, 6))).toBe(false);
    expect(ethiopianToIso(E(2016, 13, 6))).toBeNull();
    expect(isValidEthiopianDate(E(2016, 13, 5))).toBe(true);
    expect(isValidEthiopianDate(E(2016, 14, 1))).toBe(false);
    expect(isValidEthiopianDate(E(2016, 1, 31))).toBe(false);
    expect(isValidEthiopianDate(E(2016, 1, 1.5))).toBe(false);
    expect(isValidEthiopianDate({ year: '2016', month: 1, day: 1 })).toBe(false);
  });

  it('consecutive days stay consecutive across Pagume and the new year', () => {
    const a = new Date(`${ethiopianToIso(E(2015, 13, 6))}T00:00:00Z`);
    const b = new Date(`${ethiopianToIso(E(2016, 1, 1))}T00:00:00Z`);
    expect((b - a) / 86400000).toBe(1);
  });

  // A small seeded generator, so a failure can be reproduced.
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0) / 2 ** 32);
  }

  it('round-trips 200 random Ethiopian dates', () => {
    const r = rng(20261114);
    for (let i = 0; i < 200; i++) {
      const year = 1 + Math.floor(r() * 2100);
      const month = 1 + Math.floor(r() * 13);
      const day = 1 + Math.floor(r() * daysInEthiopianMonth(year, month));
      const iso = ethiopianToIso(E(year, month, day));
      expect(iso, `${day}/${month}/${year}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isoToEthiopian(iso)).toEqual(E(year, month, day));
    }
  });

  it('round-trips 200 random Gregorian dates', () => {
    const r = rng(1993);
    const start = Date.UTC(1900, 0, 1);
    const end = Date.UTC(2100, 11, 31);
    for (let i = 0; i < 200; i++) {
      const iso = new Date(start + Math.floor(r() * ((end - start) / 86400000)) * 86400000).toISOString().slice(0, 10);
      const eth = isoToEthiopian(iso);
      expect(isValidEthiopianDate(eth), iso).toBe(true);
      expect(ethiopianToIso(eth)).toBe(iso);
    }
  });

  it('rejects dates that do not exist', () => {
    expect(isoToEthiopian('2023-02-29')).toBeNull();
    expect(isoToEthiopian('not a date')).toBeNull();
  });
});

describe('Ethiopian date answers', () => {
  const q = { id: 'dob', type: 'date', calendar: 'ethiopian', required: true, label: { en: 'Born' } };
  const answer = { date: '2001-03-27', ethiopian: E(1993, 7, 18) };

  it('accepts the ISO date with the Ethiopian date it came from', () => {
    expect(validateAnswer(q, answer)).toBeNull();
  });

  it('rejects answers where the two dates disagree', () => {
    expect(validateAnswer(q, { ...answer, date: '2001-03-28' })).toBe('calendar_mismatch');
    expect(validateAnswer(q, { ethiopian: E(1993, 7, 18) })).toBe('calendar_mismatch');
  });

  it('rejects impossible, partial, future and wrongly shaped dates', () => {
    expect(validateAnswer(q, { date: '2024-09-11', ethiopian: E(2016, 13, 6) })).toBe('invalid_date');
    expect(validateAnswer(q, { ethiopian: { year: 1993, month: 7, day: null } })).toBe('invalid_date');
    expect(validateAnswer(q, { date: ethiopianToIso(E(2100, 1, 1)), ethiopian: E(2100, 1, 1) })).toBe('future_date');
    expect(validateAnswer(q, { date: ethiopianToIso(E(1890, 1, 1)), ethiopian: E(1890, 1, 1) })).toBe('invalid_date');
    expect(validateAnswer(q, '2001-03-27')).toBe('invalid_type');
    expect(validateAnswer(q, ['2001-03-27'])).toBe('invalid_type');
  });

  it('nothing chosen is no answer', () => {
    expect(validateAnswer(q, undefined)).toBe('required');
    expect(validateAnswer(q, { ethiopian: { year: null, month: null, day: null } })).toBe('required');
    expect(validateAnswer({ ...q, required: false }, { ethiopian: {} })).toBeNull();
  });

  it('stores only the ISO date and the Ethiopian day, month and year', () => {
    const flow = { version: '1', flowId: 'f', title: { en: 'T' }, questions: [q] };
    const { errors, clean } = validateAnswers(flow, { dob: { ...answer, extra: 'x', ethiopian: { ...answer.ethiopian, note: 1 } } });
    expect(errors).toEqual([]);
    expect(clean).toEqual({ dob: answer });
  });

  it('the calendar setting is only for date questions', () => {
    const flow = (extra) => ({ version: '1', flowId: 'f', title: { en: 'T' }, questions: [{ id: 'a', label: { en: 'A' }, ...extra }] });
    expect(validateFlow(flow({ type: 'date', calendar: 'ethiopian' }))).toEqual([]);
    expect(validateFlow(flow({ type: 'date', calendar: 'gregorian' }))).toEqual([]);
    expect(validateFlow(flow({ type: 'date', calendar: 'julian' })).join()).toMatch(/calendar must be/);
    expect(validateFlow(flow({ type: 'text', calendar: 'ethiopian' })).join()).toMatch(/only applies to date/);
  });
});
