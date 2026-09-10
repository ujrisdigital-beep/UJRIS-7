/**
 * Strict legal-date parsing. JavaScript Date rollover is never trusted.
 *
 * A parsed token always retains raw_value, normalized_value, parse_status,
 * source, source_type, and confidence. INVALID is never coerced to VALID.
 */

export type ParseStatus = "valid" | "invalid" | "partial" | "ambiguous";
export type DateSourceType = "iso" | "iso_instant" | "uk_written" | "numeric" | "unknown";

export interface StrictDateParts {
  year: number;
  month: number;
  day: number;
}

export interface ParsedLegalDate {
  raw_value: string;
  normalized_value: Date | null;
  parse_status: ParseStatus;
  source: string;
  source_type: DateSourceType;
  confidence: "low" | "medium" | "high";
  parts?: Partial<StrictDateParts>;
}

function isInt(n: number): boolean {
  return Number.isInteger(n) && Number.isFinite(n);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function parseStrictCivilDate(year: number, month1to12: number, day: number): ParsedLegalDate {
  const raw = `${year}-${String(month1to12).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!isInt(year) || !isInt(month1to12) || !isInt(day)) {
    return {
      raw_value: raw,
      normalized_value: null,
      parse_status: "invalid",
      source: "civil_components",
      source_type: "iso",
      confidence: "low",
      parts: { year, month: month1to12, day },
    };
  }
  if (year < 1000 || year > 9999 || month1to12 < 1 || month1to12 > 12 || day < 1 || day > 31) {
    return {
      raw_value: raw,
      normalized_value: null,
      parse_status: "invalid",
      source: "civil_components",
      source_type: "iso",
      confidence: "low",
      parts: { year, month: month1to12, day },
    };
  }

  const constructed = new Date(Date.UTC(year, month1to12 - 1, day));
  const ok =
    !Number.isNaN(constructed.getTime()) &&
    constructed.getUTCFullYear() === year &&
    constructed.getUTCMonth() + 1 === month1to12 &&
    constructed.getUTCDate() === day;

  if (!ok) {
    return {
      raw_value: raw,
      normalized_value: null,
      parse_status: "invalid",
      source: "civil_components",
      source_type: "iso",
      confidence: "low",
      parts: { year, month: month1to12, day },
    };
  }

  return {
    raw_value: raw,
    normalized_value: constructed,
    parse_status: "valid",
    source: "civil_components",
    source_type: "iso",
    confidence: "high",
    parts: { year, month: month1to12, day },
  };
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

export function parseNumericDateToken(a: number, b: number, year: number): ParsedLegalDate {
  const dmy = parseStrictCivilDate(year, b, a);
  const mdy = parseStrictCivilDate(year, a, b);
  if (dmy.parse_status === "valid" && mdy.parse_status === "valid" && (dmy.parts?.month !== mdy.parts?.month || dmy.parts?.day !== mdy.parts?.day)) {
    return {
      raw_value: `${a}/${b}/${year}`,
      normalized_value: null,
      parse_status: "ambiguous",
      source: "numeric_token",
      source_type: "numeric",
      confidence: "low",
      parts: { year },
    };
  }
  if (dmy.parse_status === "valid" && mdy.parse_status !== "valid") {
    return { ...dmy, source: "numeric_token", source_type: "numeric", confidence: "medium" };
  }
  if (mdy.parse_status === "valid" && dmy.parse_status !== "valid") {
    return { ...mdy, source: "numeric_token", source_type: "numeric", confidence: "medium" };
  }
  if (dmy.parse_status === "valid") {
    return { ...dmy, source: "numeric_token", source_type: "numeric", confidence: "medium" };
  }
  return {
    raw_value: `${a}/${b}/${year}`,
    normalized_value: null,
    parse_status: "invalid",
    source: "numeric_token",
    source_type: "numeric",
    confidence: "low",
    parts: { year },
  };
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_INSTANT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parse a single date token or phrase. Trims whitespace/noise around the token.
 */
export function parseLegalDate(rawInput: string, source = "user_supplied"): ParsedLegalDate {
  const raw_value = rawInput.trim().replace(/\s+/g, " ");
  if (!raw_value) {
    return {
      raw_value,
      normalized_value: null,
      parse_status: "invalid",
      source,
      source_type: "unknown",
      confidence: "low",
    };
  }

  const iso = raw_value.match(ISO_DATE);
  if (iso) {
    const parsed = parseStrictCivilDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return { ...parsed, raw_value, source, source_type: "iso" };
  }

  const instant = raw_value.match(ISO_INSTANT);
  if (instant) {
    const civil = parseStrictCivilDate(Number(instant[1]), Number(instant[2]), Number(instant[3]));
    if (civil.parse_status !== "valid") {
      return { ...civil, raw_value, source, source_type: "iso_instant" };
    }
    const asInstant = new Date(raw_value);
    if (Number.isNaN(asInstant.getTime())) {
      return {
        raw_value,
        normalized_value: null,
        parse_status: "invalid",
        source,
        source_type: "iso_instant",
        confidence: "low",
      };
    }
    return {
      raw_value,
      normalized_value: asInstant,
      parse_status: "valid",
      source,
      source_type: "iso_instant",
      confidence: "high",
      parts: civil.parts,
    };
  }

  const numeric = raw_value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (numeric) {
    const parsed = parseNumericDateToken(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));
    return { ...parsed, raw_value, source };
  }

  const uk = raw_value.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?$/i);
  if (uk) {
    const month = monthNameToNumber(uk[2]);
    if (!uk[3]) {
      return {
        raw_value,
        normalized_value: null,
        parse_status: "partial",
        source,
        source_type: "uk_written",
        confidence: "low",
        parts: { day: Number(uk[1]), month: month ?? undefined },
      };
    }
    if (month == null) {
      return {
        raw_value,
        normalized_value: null,
        parse_status: "invalid",
        source,
        source_type: "uk_written",
        confidence: "low",
      };
    }
    const parsed = parseStrictCivilDate(Number(uk[3]), month, Number(uk[1]));
    return { ...parsed, raw_value, source, source_type: "uk_written" };
  }

  return {
    raw_value,
    normalized_value: null,
    parse_status: "invalid",
    source,
    source_type: "unknown",
    confidence: "low",
  };
}

/** @deprecated Compatibility wrapper used by older tests. */
export type StrictDateResult =
  | { ok: true; date: Date; parts: StrictDateParts }
  | { ok: false; reason: "invalid_components" | "non_integer" | "round_trip_mismatch" | "ambiguous_numeric" | "missing_year"; parts?: Partial<StrictDateParts> };

export function parseStrictCivilDateLegacy(year: number, month1to12: number, day: number): StrictDateResult {
  const parsed = parseStrictCivilDate(year, month1to12, day);
  if (parsed.parse_status === "valid" && parsed.normalized_value && parsed.parts?.year && parsed.parts.month && parsed.parts.day) {
    return { ok: true, date: parsed.normalized_value, parts: { year: parsed.parts.year, month: parsed.parts.month, day: parsed.parts.day } };
  }
  return { ok: false, reason: "round_trip_mismatch", parts: parsed.parts };
}
