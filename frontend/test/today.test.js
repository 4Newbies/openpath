import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ethiopianToday, ethiopianToIso, isoToEthiopian } from '../../shared/ethiopian.js';
import { localToday } from '../../shared/flow.js';
import { resetPacks } from '../src/messages.js';
import onboarding from '../public/questions/onboarding.json';
import { mount } from './helpers.js';

// The clock is set to 14 November 2026, 10:00 on this device.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 14, 10, 0));
  localStorage.clear();
  resetPacks();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.textContent = '';
});

describe('today, 2026-11-14, is 5 Hidar 2019', () => {
  it('in the shared calendar code', () => {
    expect(localToday()).toBe('2026-11-14');
    expect(ethiopianToday()).toEqual({ year: 2019, month: 3, day: 5 });
    expect(isoToEthiopian('2026-11-14')).toEqual({ year: 2019, month: 3, day: 5 });
    expect(ethiopianToIso({ year: 2019, month: 3, day: 5 })).toBe('2026-11-14');
  });

  it('just after midnight and just before the next midnight, on this device', () => {
    vi.setSystemTime(new Date(2026, 10, 14, 0, 1));
    expect(ethiopianToday()).toEqual({ year: 2019, month: 3, day: 5 });
    vi.setSystemTime(new Date(2026, 10, 14, 23, 59));
    expect(ethiopianToday()).toEqual({ year: 2019, month: 3, day: 5 });
  });

  it.each([
    ['en', 'Day', 'Month', 'Year', 'Choose', 'Meskerem', 'Hidar', 'Pagume'],
    ['am', 'ቀን', 'ወር', 'ዓመት', 'ይምረጡ', 'መስከረም', 'ኅዳር', 'ጳጉሜን'],
  ])('the date of birth question in %s: day, month, year; years 2019 down to 1892', async (lang, day, month, year, choose, first, third, last) => {
    const el = await mount(onboarding, { lang });
    el.go('dateOfBirth');
    const r = el.shadowRoot;
    expect([...r.querySelectorAll('.op-date-part label')].map((l) => l.textContent)).toEqual([day, month, year]);
    const opts = (sel) => [...r.querySelector(sel).options].map((o) => o.textContent);
    expect(opts('select.op-date-day')).toEqual([choose, ...Array.from({ length: 30 }, (_, i) => String(i + 1))]);
    expect(opts('select.op-date-month')).toHaveLength(14);
    expect(opts('select.op-date-month').slice(0, 2)).toEqual([choose, first]);
    expect(opts('select.op-date-month')[3]).toBe(third);
    expect(opts('select.op-date-month')[13]).toBe(last);
    const years = opts('select.op-date-year');
    expect(years[0]).toBe(choose);
    expect(years[1]).toBe('2019'); // this Ethiopian year first
    expect(years.at(-1)).toBe('1892'); // 1900 in the Gregorian calendar
    expect(years).toHaveLength(1 + 128);
  });

  it('5 Hidar 2019 (today) is accepted; 6 Hidar 2019 (tomorrow) is in the future', async () => {
    const el = await mount(onboarding);
    el.go('dateOfBirth');
    const choose = (part, v) => {
      const s = el.shadowRoot.querySelector(`select.op-date-${part}`);
      s.value = String(v);
      s.dispatchEvent(new Event('change'));
    };
    choose('day', 6);
    choose('month', 3);
    choose('year', 2019);
    [...el.shadowRoot.querySelectorAll('button')].find((b) => b.textContent === 'Next').click();
    expect(el.shadowRoot.querySelector('.op-error').textContent).toContain('The date cannot be in the future.');
    choose('day', 5);
    [...el.shadowRoot.querySelectorAll('button')].find((b) => b.textContent === 'Next').click();
    expect(el.store.state.answers.dateOfBirth).toEqual({ date: '2026-11-14', calendar: 'ethiopian', ethiopian: { year: 2019, month: 3, day: 5 } });
  });
});
