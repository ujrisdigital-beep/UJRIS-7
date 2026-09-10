/**
 * Pure Gregorian civil dates for legal limitation arithmetic.
 *
 * Authoritative representation is { year, month, day } / YYYY-MM-DD.
 * JavaScript Date is an I/O carrier only: interpret and emit UTC Y-M-D
 * of that civil date. Host timezone must not change the result.
 *
 * ERA_EQA_3M_LESS_1D month-end policy: adding N calendar months clamps
 * the day to the last valid day of the target month, then one calendar
 * day is subtracted. Example: 31 January + 3 months = 30 April; −1 day
 * = 29 April.
 */

export type CivilDate = {
  year: number;
  month: number;
  day: number;
};

const PAD = (n: number) => String(n).padStart(2, "0");

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month1to12: number): number {
  if (month1to12 === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month1to12)) return 30;
  return 31;
}

export function isValidCivilDate(c: CivilDate): boolean {
  if (!Number.isInteger(c.year) || !Number.isInteger(c.month) || !Number.isInteger(c.day)) return false;
  if (c.year < 1000 || c.year > 9999) return false;
  if (c.month < 1 || c.month > 12) return false;
  if (c.day < 1 || c.day > daysInMonth(c.year, c.month)) return false;
  return true;
}

export function formatCivilDate(c: CivilDate): string {
  return `${c.year}-${PAD(c.month)}-${PAD(c.day)}`;
}

export function parseCivilDate(value: string): CivilDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const c = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  return isValidCivilDate(c) ? c : null;
}

export function civilDatesEqual(a: CivilDate, b: CivilDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Read a Date as a civil date using UTC Y-M-D only. */
export function civilFromUtcDate(d: Date): CivilDate {
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** I/O carrier: UTC midnight of the civil date. Not a local midnight. */
export function utcDateFromCivil(c: CivilDate): Date {
  return new Date(Date.UTC(c.year, c.month - 1, c.day));
}

/**
 * Add calendar months. If the source day does not exist in the target
 * month, clamp to that month's last day.
 */
export function addCivilMonths(c: CivilDate, delta: number): CivilDate {
  const total = c.year * 12 + (c.month - 1) + delta;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12 + 1;
  const dim = daysInMonth(year, month);
  return { year, month, day: Math.min(c.day, dim) };
}

/** Add (or subtract) whole Gregorian calendar days. No Date, no milliseconds. */
export function addCivilDays(c: CivilDate, delta: number): CivilDate {
  let year = c.year;
  let month = c.month;
  let day = c.day;
  if (delta === 0) return { year, month, day };
  if (delta > 0) {
    let left = delta;
    while (left > 0) {
      const remainingInMonth = daysInMonth(year, month) - day;
      if (left <= remainingInMonth) {
        day += left;
        left = 0;
      } else {
        left -= remainingInMonth + 1;
        day = 1;
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
    }
    return { year, month, day };
  }
  let left = -delta;
  while (left > 0) {
    if (left < day) {
      day -= left;
      left = 0;
    } else {
      left -= day;
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      day = daysInMonth(year, month);
    }
  }
  return { year, month, day };
}

/**
 * ERA 1996 s.111 / EqA 2010 s.123 general rule: three calendar months
 * less one calendar day from the source civil date.
 */
export function eraEqaPrimaryDueCivil(source: CivilDate): CivilDate {
  return addCivilDays(addCivilMonths(source, 3), -1);
}

/** String I/O for ERA/EQA due-date arithmetic. Host timezone is irrelevant. */
export function eraEqaPrimaryDueCivilKey(sourceKey: string): string {
  const source = parseCivilDate(sourceKey);
  if (!source) {
    throw new Error(`Invalid civil date: ${sourceKey}`);
  }
  return formatCivilDate(eraEqaPrimaryDueCivil(source));
}
