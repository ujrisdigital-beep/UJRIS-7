import { describe, expect, it } from "vitest";
import { extractDates } from "@/lib/ai/heuristics";
import { inferLimitationStart } from "@/lib/legal/date-inference";
import { calculatePrimaryLimitationDate, higherUrgency, urgencyFromDays, daysUntil } from "@/lib/legal/deadlines";
import { evaluateLimitationConfirmation, fingerprintFromExtracted } from "@/lib/legal/deadline-confirmation";

describe("limitation start date inference", () => {
  it("hearing date only is not a confirmed limitation start", () => {
    const dates = extractDates("My Employment Tribunal hearing is listed for 11 April 2026.");
    const result = inferLimitationStart(dates);
    expect(result.candidate_dates[0]?.event_type).toBe("hearing");
    expect(result.status).toBe("insufficient_data");
    expect(result.selected_date).toBeNull();
    expect(result.warning_date).toBeNull();
    expect(result.status).not.toBe("confirmed");
    expect(result.requires_confirmation).toBe(true);
  });

  it("grievance date only is not automatically confirmed", () => {
    const dates = extractDates("I raised a grievance on 11 April 2026.");
    const result = inferLimitationStart(dates);
    expect(result.candidate_dates[0]?.event_type).toBe("grievance");
    expect(result.status).toBe("insufficient_data");
    expect(result.selected_date).toBeNull();
    expect(result.status).not.toBe("confirmed");
  });

  it("tribunal order date is not a claim limitation start", () => {
    const dates = extractDates("The tribunal order is dated 11 April 2026.");
    const result = inferLimitationStart(dates);
    expect(result.candidate_dates[0]?.event_type).toBe("tribunal_order");
    expect(result.status).toBe("insufficient_data");
    expect(result.selected_date).toBeNull();
  });

  it("clear dismissal date is a provisional warning, never confirmed", () => {
    const dates = extractDates("I was dismissed on 11 April 2026.");
    const result = inferLimitationStart(dates);
    expect(result.status).toBe("provisional");
    expect(result.requires_confirmation).toBe(true);
    expect(result.selected_date).toBeNull();
    expect(result.warning_date?.getUTCDate()).toBe(11);
    expect(result.warning_date?.getUTCMonth()).toBe(3);
    expect(result.candidate_dates[0]?.event_type).toBe("dismissal");
    expect(result.candidate_dates[0]?.rule_id).toBe("ERA_EQA_3M_LESS_1D");
    expect(result.status).not.toBe("confirmed");
  });

  it("conflicting dismissal and incident dates are ambiguous", () => {
    const dates = extractDates(
      "I was dismissed on 11 April 2026. The discrimination happened on 14 March 2026."
    );
    const result = inferLimitationStart(dates);
    expect(result.status).toBe("ambiguous");
    expect(result.requires_confirmation).toBe(true);
    expect(result.selected_date).toBeNull();
    expect(result.warning_date?.getUTCMonth()).toBe(2);
    expect(result.warning_date?.getUTCDate()).toBe(14);
  });

  it("is independent of input order", () => {
    const forward = inferLimitationStart(
      extractDates("I was dismissed on 11 April 2026. The discrimination happened on 14 March 2026.")
    );
    const reverse = inferLimitationStart(
      extractDates("The discrimination happened on 14 March 2026. I was dismissed on 11 April 2026.")
    );
    expect(forward.status).toBe("ambiguous");
    expect(reverse.status).toBe("ambiguous");
    expect(forward.warning_date?.toISOString()).toBe(reverse.warning_date?.toISOString());
    expect(forward.selected_date).toBeNull();
    expect(reverse.selected_date).toBeNull();
  });

  it("duplicate candidates on the same calendar day do not create false certainty", () => {
    const dates = extractDates(
      "I was dismissed on 11 April 2026. Dismissal took effect on 11 April 2026."
    );
    const result = inferLimitationStart(dates);
    expect(result.status).toBe("provisional");
    expect(result.status).not.toBe("confirmed");
    expect(result.selected_date).toBeNull();
  });

  it("returns insufficient_data for invalid dates", () => {
    const dates = extractDates("It happened on 32 January 2026 and also 99/99/2026.");
    const result = inferLimitationStart(dates);
    expect(result.selected_date).toBeNull();
    expect(result.status).toBe("insufficient_data");
  });

  it("does not suppress keyword urgency when dates are uncertain", () => {
    const keywordUrgency = "high" as const;
    const dates = extractDates(
      "I have a hearing coming up. They dismissed me on 11 April 2026 and the discrimination happened on 20 May 2026."
    );
    const result = inferLimitationStart(dates);
    expect(result.status).toBe("ambiguous");
    const fromDate = result.warning_date
      ? urgencyFromDays(daysUntil(calculatePrimaryLimitationDate(result.warning_date).dueDate))
      : "low";
    const combined = higherUrgency(keywordUrgency, fromDate);
    expect(["high", "critical"]).toContain(combined);
  });

  it("refuses confirmation when the only date is a hearing", () => {
    const decision = evaluateLimitationConfirmation({
      dueDate: new Date(Date.UTC(2026, 6, 10)),
      ruleId: "ERA_EQA_3M_LESS_1D",
      sourceEventDate: new Date(Date.UTC(2026, 3, 11)),
      sourceEventType: "hearing",
      narrative: "My hearing is on 11 April 2026.",
    });
    expect(decision.allowed).toBe(false);
  });

  it("treats a resolved dismissal plus an unresolved qualifying date as ambiguous, never confirmed", () => {
    const dates = extractDates("I was dismissed on 12 March 2026 and dismissed again later that month.");
    const result = inferLimitationStart(dates);
    expect(result.status).toBe("ambiguous");
    expect(result.selected_date).toBeNull();
    expect(result.status).not.toBe("confirmed");
    expect(result.reason).toMatch(/unresolved/i);
    expect(result.reason).not.toMatch(/high confidence|verified|legal certainty/i);
  });

  it("allows confirmation only for a single allow-listed provisional dismissal", () => {
    const narrative = "I was dismissed on 11 April 2026 after raising a complaint about discrimination.";
    const dates = extractDates(narrative);
    const fingerprint = fingerprintFromExtracted(dates.find((d) => d.eventType === "dismissal")!);
    const ok = evaluateLimitationConfirmation({
      dueDate: new Date(Date.UTC(2026, 6, 10)),
      ruleId: "ERA_EQA_3M_LESS_1D",
      sourceEventDate: new Date(Date.UTC(2026, 3, 11)),
      sourceEventType: "dismissal",
      sourceEventId: fingerprint,
      narrative,
      extractedDates: dates,
    });
    expect(ok.allowed).toBe(true);

    const ambiguous = evaluateLimitationConfirmation({
      dueDate: new Date(Date.UTC(2026, 6, 10)),
      ruleId: "ERA_EQA_3M_LESS_1D",
      sourceEventDate: new Date(Date.UTC(2026, 3, 11)),
      sourceEventType: "dismissal",
      narrative:
        "I was dismissed on 11 April 2026. The discrimination happened on 14 March 2026.",
    });
    expect(ambiguous.allowed).toBe(false);
    if (!ambiguous.allowed) expect(ambiguous.status).toBe("ambiguous");
  });
});
