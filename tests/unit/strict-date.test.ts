import { describe, expect, it } from "vitest";
import { isLeapYear, parseNumericDateToken, parseStrictCivilDate } from "@/lib/legal/strict-date";
import { extractDates } from "@/lib/ai/heuristics";
import { inferLimitationStart } from "@/lib/legal/date-inference";
import { deriveLimitationDeadline } from "@/lib/legal/derived-deadline";

describe("strict civil dates", () => {
  it("rejects 31 February without rolling into March", () => {
    const result = parseStrictCivilDate(2026, 2, 31);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("round_trip_mismatch");
    const extracted = extractDates("I was dismissed on 31 February 2026.");
    expect(extracted[0]?.date).toBeNull();
    expect(extracted[0]?.valid).toBe(false);
    expect(inferLimitationStart(extracted).status).toBe("insufficient_data");
    expect(inferLimitationStart(extracted).requiresConfirmation).toBe(true);
  });

  it("rejects 30 February", () => {
    expect(parseStrictCivilDate(2026, 2, 30).ok).toBe(false);
    expect(extractDates("It happened on 30 February 2026.")[0]?.valid).toBe(false);
  });

  it("rejects 31 April", () => {
    expect(parseStrictCivilDate(2026, 4, 31).ok).toBe(false);
    expect(extractDates("The letter is dated 31 April 2026.")[0]?.valid).toBe(false);
  });

  it("accepts leap-year 29 February", () => {
    expect(isLeapYear(2024)).toBe(true);
    const result = parseStrictCivilDate(2024, 2, 29);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.date.getUTCFullYear()).toBe(2024);
      expect(result.date.getUTCMonth()).toBe(1);
      expect(result.date.getUTCDate()).toBe(29);
    }
  });

  it("rejects non-leap-year 29 February", () => {
    expect(isLeapYear(2025)).toBe(false);
    expect(parseStrictCivilDate(2025, 2, 29).ok).toBe(false);
    expect(extractDates("It happened on 29 February 2025.")[0]?.valid).toBe(false);
  });

  it("accepts valid month-end dates", () => {
    expect(parseStrictCivilDate(2026, 1, 31).ok).toBe(true);
    expect(parseStrictCivilDate(2026, 4, 30).ok).toBe(true);
    expect(parseStrictCivilDate(2026, 2, 28).ok).toBe(true);
  });

  it("marks ambiguous numeric dates as unconfirmed", () => {
    const parsed = parseNumericDateToken(1, 2, 2026);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toBe("ambiguous_numeric");
    const extracted = extractDates("The meeting was on 01/02/2026.");
    const inference = inferLimitationStart(extracted);
    expect(inference.status).toBe("ambiguous");
    expect(inference.selectedDate).toBeNull();
    expect(inference.requiresConfirmation).toBe(true);
  });

  it("treats a missing year as insufficient and unconfirmed", () => {
    const extracted = extractDates("They dismissed me on 11 April.");
    expect(extracted[0]?.missingYear).toBe(true);
    expect(extracted[0]?.valid).toBe(false);
    const inference = inferLimitationStart(extracted);
    expect(inference.status).toBe("insufficient_data");
    expect(inference.requiresConfirmation).toBe(true);
  });

  it("does not treat a hearing date as a confirmed limitation", () => {
    const extracted = extractDates("My hearing is on 11 April 2026.");
    expect(extracted[0]?.kind).toBe("hearing");
    const inference = inferLimitationStart(extracted);
    expect(inference.status).toBe("insufficient_data");
    expect(inference.selectedDate).toBeNull();
    const derived = deriveLimitationDeadline({
      effectiveDate: extracted[0]?.date ?? null,
      jurisdiction: "england-wales",
      inferenceStatus: inference.status,
      sourceEventKind: "hearing",
    });
    expect(derived.ok).toBe(false);
    expect(derived.confirmationStatus).toBe("unconfirmed");
    expect(derived.dueDate).toBeNull();
  });

  it("keeps an extracted date unconfirmed even when it is the only valid date", () => {
    const extracted = extractDates("I was dismissed on 11 April 2026.");
    const inference = inferLimitationStart(extracted);
    expect(inference.status).toBe("provisional");
    expect(inference.requiresConfirmation).toBe(true);
    expect(inference.status).not.toBe("confirmed");
  });

  it("fails safe when derived deadline inputs are incomplete", () => {
    const missingDate = deriveLimitationDeadline({
      effectiveDate: null,
      jurisdiction: "england-wales",
      inferenceStatus: "provisional",
    });
    expect(missingDate.ok).toBe(false);
    expect(missingDate.dueDate).toBeNull();

    const missingJurisdiction = deriveLimitationDeadline({
      effectiveDate: new Date(Date.UTC(2026, 3, 11)),
      jurisdiction: null,
      inferenceStatus: "provisional",
    });
    expect(missingJurisdiction.ok).toBe(false);
    expect(missingJurisdiction.ruleId).toBe("ERA_EQA_3M_LESS_1D");
  });
});
