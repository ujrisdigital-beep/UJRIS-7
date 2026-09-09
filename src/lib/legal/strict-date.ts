/**
 * Strict civil-date parsing. JavaScript Date rollover is never trusted.
 *
 * 1. Read the submitted year, month, day.
 * 2. Construct a UTC candidate.
 * 3. Round-trip getUTCFullYear/Month/Date.
 * 4. Reject if any component differs.
 */

export interface StrictDateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

export type StrictDateFailure =
  | "invalid_components"
  | "non_integer"
  | "round_trip_mismatch"
  | "ambiguous_numeric"
  | "missing_year";

export interface StrictDateOk {
  ok: true;
  date: Date;
  parts: StrictDateParts;
}

export interface StrictDateErr {
  ok: false;
  reason: StrictDateFailure;
  parts?: Partial<StrictDateParts>;
}

export type StrictDateResult = StrictDateOk | StrictDateErr;

function isInt(n: number): boolean {
  return Number.isInteger(n) && Number.isFinite(n);
}

export function parseStrictCivilDate(year: number, month1to12: number, day: number): StrictDateResult {
  if (!isInt(year) || !isInt(month1to12) || !isInt(day)) {
    return { ok: false, reason: "non_integer", parts: { year, month: month1to12, day } };
  }
  if (year < 1000 || year > 9999 || month1to12 < 1 || month1to12 > 12 || day < 1 || day > 31) {
    return { ok: false, reason: "invalid_components", parts: { year, month: month1to12, day } };
  }

  const constructed = new Date(Date.UTC(year, month1to12 - 1, day));
  if (Number.isNaN(constructed.getTime())) {
    return { ok: false, reason: "invalid_components", parts: { year, month: month1to12, day } };
  }

  const gotYear = constructed.getUTCFullYear();
  const gotMonth = constructed.getUTCMonth() + 1;
  const gotDay = constructed.getUTCDate();
  if (gotYear !== year || gotMonth !== month1to12 || gotDay !== day) {
    return { ok: false, reason: "round_trip_mismatch", parts: { year, month: month1to12, day } };
  }

  return { ok: true, date: constructed, parts: { year, month: month1to12, day } };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_INDEX: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

export function monthNameToNumber(name: string): number | null {
  const n = MONTH_INDEX[name.trim().toLowerCase()];
  return n ?? null;
}

/**
 * Ambiguous when both DMY and MDY are valid civil dates and they differ.
 * Unambiguous when only one order is a valid civil date (e.g. 31/01/2026).
 */
export function parseNumericDateToken(a: number, b: number, year: number): StrictDateResult {
  const dmy = parseStrictCivilDate(year, b, a);
  const mdy = parseStrictCivilDate(year, a, b);
  if (dmy.ok && mdy.ok && (dmy.parts.month !== mdy.parts.month || dmy.parts.day !== mdy.parts.day)) {
    return { ok: false, reason: "ambiguous_numeric", parts: { year } };
  }
  if (dmy.ok && !mdy.ok) return dmy;
  if (mdy.ok && !dmy.ok) return mdy;
  if (dmy.ok && mdy.ok) return dmy;
  return { ok: false, reason: "invalid_components", parts: { year } };
}
