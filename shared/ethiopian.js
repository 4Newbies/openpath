// Ethiopian calendar <-> Gregorian calendar, by way of the Julian Day Number.
// No dependencies; used by the browser tag and the API.
//
// The Ethiopian year has 12 months of 30 days and a 13th month, Pagume, of
// 5 days, or 6 when the Ethiopian year mod 4 is 3 (the year before an
// Ethiopian leap year starts). Years are counted in the Amete Mihret era.

const ETHIOPIAN_EPOCH = 1723856; // JDN of the day before 1 Meskerem 1 (Amete Mihret) minus 365

const div = (a, b) => Math.floor(a / b);
const isInt = (n) => Number.isInteger(n);

export function daysInEthiopianMonth(year, month) {
  if (month >= 1 && month <= 12) return 30;
  if (month === 13) return year % 4 === 3 ? 6 : 5;
  return 0;
}

export function isValidEthiopianDate(e) {
  return (
    !!e &&
    isInt(e.year) &&
    isInt(e.month) &&
    isInt(e.day) &&
    e.year >= 1 &&
    e.year <= 9999 &&
    e.day >= 1 &&
    e.day <= daysInEthiopianMonth(e.year, e.month)
  );
}

export function ethiopianToJdn({ year, month, day }) {
  return ETHIOPIAN_EPOCH + 365 + 365 * (year - 1) + div(year, 4) + 30 * month + day - 31;
}

export function jdnToEthiopian(jdn) {
  const r = (jdn - ETHIOPIAN_EPOCH) % 1461;
  const n = (r % 365) + 365 * div(r, 1460);
  return {
    year: 4 * div(jdn - ETHIOPIAN_EPOCH, 1461) + div(r, 365) - div(r, 1460),
    month: div(n, 30) + 1,
    day: (n % 30) + 1,
  };
}

export function gregorianToJdn({ year, month, day }) {
  const a = div(14 - month, 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + div(153 * m + 2, 5) + 365 * y + div(y, 4) - div(y, 100) + div(y, 400) - 32045;
}

export function jdnToGregorian(jdn) {
  const a = jdn + 32044;
  const b = div(4 * a + 3, 146097);
  const c = a - div(146097 * b, 4);
  const d = div(4 * c + 3, 1461);
  const e = c - div(1461 * d, 4);
  const m = div(5 * e + 2, 153);
  return {
    year: 100 * b + d - 4800 + div(m, 10),
    month: m + 3 - 12 * div(m, 10),
    day: e - div(153 * m + 2, 5) + 1,
  };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** { year, month, day } (Ethiopian) -> "YYYY-MM-DD" (Gregorian), or null if not a real date. */
export function ethiopianToIso(e) {
  if (!isValidEthiopianDate(e)) return null;
  const g = jdnToGregorian(ethiopianToJdn(e));
  return `${pad(g.year, 4)}-${pad(g.month)}-${pad(g.day)}`;
}

/** "YYYY-MM-DD" (Gregorian) -> { year, month, day } (Ethiopian), or null if not a real date. */
export function isoToEthiopian(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return null;
  const g = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  const back = jdnToGregorian(gregorianToJdn(g));
  if (back.year !== g.year || back.month !== g.month || back.day !== g.day) return null;
  return jdnToEthiopian(gregorianToJdn(g));
}

/** Today's Ethiopian date (in UTC, like the rest of the date checks). */
export function ethiopianToday(now = new Date()) {
  return jdnToEthiopian(gregorianToJdn({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() }));
}
