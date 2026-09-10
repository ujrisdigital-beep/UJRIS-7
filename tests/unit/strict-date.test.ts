import { describe, expect, it } from "vitest";
import {
  isLeapYear,
  parseLegalDate,
  parseNumericDateToken,
  parseStrictCivilDate,
} from "@/lib/legal/strict-date";
import { extractDates } from "@/lib/ai/heuristics";
import { inferLimitationStart } from "@/lib/legal/date-inference";
import { deriveLimitationDeadline } from "@/lib/legal/derived-deadline";

describe("strict civil dates", () => {
  it("rejects 31 February without rolling into March", () => {
    const result = parseStrictCivilDate(2026, 2, 31);
    expect(result.parse_status).toBe("invalid");
    expect(result.normalized_value).toBeNull();
    const extracted = extractDates("I was dismissed on 31 February 2026.");
    expect(extracted[0]?.date).toBeNull();
    expect(extracted[0]?.valid).toBe(false);
    expect(extracted[0]?.parseStatus).toBe("invalid");
    const inference = inferLimitationStart(extracted);
    expect(inference.status).toBe("insufficient_data");
    expect(inference.selected_date).toBeNull();
    expect(inference.warning_date).toBeNull();
    expect(inference.status).not.toBe("confirmed");
  });

  it("rejects 31 April without rolling into May", () => {
    const result = parseStrictCivilDate(2026, 4, 31);
    expect(result.parse_status).toBe("invalid");
    expect(result.normalized_value).toBeNull();
    expect(extractDates("The letter is dated 31 April 2026.")[0]?.valid).toBe(false);
    expect(parseLegalDate("31 April 2026").parse_status).toBe("invalid");
  });

  it("rejects 2026-13-01 and 2026-00-12", () => {
    expect(parseLegalDate("2026-13-01").parse_status).toBe("invalid");
    expect(parseLegalDate("2026-00-12").parse_status).toBe("invalid");
    expect(parseLegalDate("2026-13-01").normalized_value).toBeNull();
  });

  it("accepts leap-year 29 February and rejects non-leap 29 February", () => {
    expect(isLeapYear(2024)).toBe(true);
    const leap = parseStrictCivilDate(2024, 2, 29);
    expect(leap.parse_status).toBe("valid");
    expect(leap.normalized_value?.getUTCDate()).toBe(29);
    expect(isLeapYear(2025)).toBe(false);
    expect(parseStrictCivilDate(2025, 2, 29).parse_status).toBe("invalid");
    expect(extractDates("It happened on 29 February 2025.")[0]?.valid).toBe(false);
    expect(extractDates("It happened on 29 February 2024.")[0]?.valid).toBe(true);
  });

  it("accepts a valid ISO date", () => {
    const parsed = parseLegalDate("2026-04-11");
    expect(parsed.parse_status).toBe("valid");
    expect(parsed.source_type).toBe("iso");
    expect(parsed.normalized_value?.getUTCFullYear()).toBe(2026);
    expect(parsed.normalized_value?.getUTCMonth()).toBe(3);
    expect(parsed.normalized_value?.getUTCDate()).toBe(11);
    expect(parsed.raw_value).toBe("2026-04-11");
  });

  it("accepts a valid UK written date", () => {
    const parsed = parseLegalDate("11 April 2026");
    expect(parsed.parse_status).toBe("valid");
    expect(parsed.source_type).toBe("uk_written");
    expect(parsed.normalized_value?.getUTCDate()).toBe(11);
    expect(parsed.normalized_value?.getUTCMonth()).toBe(3);
  });

  it("marks 03/04/2026 as ambiguous, not confirmed", () => {
    const parsed = parseNumericDateToken(3, 4, 2026);
    expect(parsed.parse_status).toBe("ambiguous");
    expect(parsed.normalized_value).toBeNull();
    const extracted = extractDates("The meeting was on 03/04/2026.");
    const inference = inferLimitationStart(extracted);
    expect(inference.status).toBe("ambiguous");
    expect(inference.selected_date).toBeNull();
    expect(inference.requires_confirmation).toBe(true);
  });

  it("treats a missing year as partial / insufficient", () => {
    expect(parseLegalDate("11 April").parse_status).toBe("partial");
    const extracted = extractDates("They dismissed me on 11 April.");
    expect(extracted[0]?.missingYear).toBe(true);
    expect(inferLimitationStart(extracted).status).toBe("insufficient_data");
  });

  it("parses a timezone-bearing timestamp without using Date rollover", () => {
    const parsed = parseLegalDate("2026-04-11T12:00:00+01:00");
    expect(parsed.parse_status).toBe("valid");
    expect(parsed.source_type).toBe("iso_instant");
    expect(parsed.normalized_value).not.toBeNull();
    expect(Number.isNaN(parsed.normalized_value!.getTime())).toBe(false);
  });

  it("trims whitespace/noise around a valid token", () => {
    const parsed = parseLegalDate("  11 April 2026  ");
    expect(parsed.parse_status).toBe("valid");
    expect(parsed.raw_value).toBe("11 April 2026");
  });

  it("does not treat a hearing date as a limitation start", () => {
    const extracted = extractDates("My hearing is on 11 April 2026.");
    expect(extracted[0]?.eventType).toBe("hearing");
    const inference = inferLimitationStart(extracted);
    expect(inference.status).toBe("insufficient_data");
    expect(inference.selected_date).toBeNull();
    expect(inference.warning_date).toBeNull();
    expect(inference.status).not.toBe("confirmed");
    const derived = deriveLimitationDeadline({
      effectiveDate: extracted[0]?.date ?? null,
      jurisdiction: "england-wales",
      inferenceStatus: inference.status,
      sourceEventType: "hearing",
    });
    expect(derived.ok).toBe(false);
    expect(derived.dueDate).toBeNull();
    expect(derived.confirmationStatus).toBe("unconfirmed");
  });

  it("keeps an extracted dismissal date unconfirmed", () => {
    const extracted = extractDates("I was dismissed on 11 April 2026.");
    const inference = inferLimitationStart(extracted);
    expect(inference.status).toBe("provisional");
    expect(inference.requires_confirmation).toBe(true);
    expect(inference.selected_date).toBeNull();
    expect(inference.warning_date).not.toBeNull();
    expect(inference.status).not.toBe("confirmed");
  });

  it("fails safe when derived deadline inputs are incomplete", () => {
    const missingDate = deriveLimitationDeadline({
      effectiveDate: null,
      jurisdiction: "england-wales",
      inferenceStatus: "provisional",
      sourceEventType: "dismissal",
    });
    expect(missingDate.ok).toBe(false);
    expect(missingDate.dueDate).toBeNull();

    const missingJurisdiction = deriveLimitationDeadline({
      effectiveDate: new Date(Date.UTC(2026, 3, 11)),
      jurisdiction: null,
      inferenceStatus: "provisional",
      sourceEventType: "dismissal",
    });
    expect(missingJurisdiction.ok).toBe(false);
    expect(missingJurisdiction.ruleId).toBe("ERA_EQA_3M_LESS_1D");
  });
});
