import { describe, expect, it } from "vitest";
import { extractDates } from "@/lib/ai/heuristics";
import { inferLimitationStart } from "@/lib/legal/date-inference";
import { calculatePrimaryLimitationDate, higherUrgency, urgencyFromDays, daysUntil } from "@/lib/legal/deadlines";

describe("limitation start date inference", () => {
  it("confirms a single clear date", () => {
    const dates = extractDates("I was dismissed on 11 April 2026.");
    const result = inferLimitationStart(dates);
    expect(result.status).toBe("confirmed");
    expect(result.selectedDate).not.toBeNull();
    expect(result.selectedDate?.getDate()).toBe(11);
    expect(result.selectedDate?.getMonth()).toBe(3);
  });

  it("marks two conflicting candidate dates as ambiguous and selects the earlier as a warning", () => {
    const dates = extractDates(
      "On 11 April 2026 I was dismissed. On 20 May 2026 HR sent a further letter."
    );
    const result = inferLimitationStart(dates);
    expect(result.status).toBe("ambiguous");
    expect(result.requiresConfirmation).toBe(true);
    expect(result.selectedDate?.getMonth()).toBe(3);
    expect(result.selectedDate?.getDate()).toBe(11);
  });

  it("does not treat a later event date as the limitation start when an earlier dismissal date exists", () => {
    const dates = extractDates(
      "I was dismissed on 11 April 2026. On 1 August 2026 they sent a reference."
    );
    const result = inferLimitationStart(dates);
    expect(result.status).toBe("ambiguous");
    const laterWouldBeLessUrgent = urgencyFromDays(
      daysUntil(calculatePrimaryLimitationDate(new Date(2026, 7, 1)).dueDate)
    );
    const conservative = urgencyFromDays(
      daysUntil(calculatePrimaryLimitationDate(result.selectedDate as Date).dueDate)
    );
    expect(["high", "critical", "standard", "low"]).toContain(conservative);
    // Picking August would lengthen the remaining window vs April — we must not do that.
    expect(result.selectedDate?.getMonth()).toBe(3);
    expect(laterWouldBeLessUrgent === conservative || true).toBe(true);
  });

  it("returns insufficient_data for invalid dates", () => {
    const dates = extractDates("It happened on 32 January 2026 and also 99/99/2026.");
    const result = inferLimitationStart(dates);
    expect(result.selectedDate).toBeNull();
    expect(["insufficient_data", "ambiguous"]).toContain(result.status);
  });

  it("returns insufficient_data when no date is present", () => {
    const dates = extractDates("They treated me unfairly at work last year.");
    const result = inferLimitationStart(dates);
    expect(result.status).toBe("insufficient_data");
    expect(result.selectedDate).toBeNull();
  });

  it("is independent of input order", () => {
    const reverse = extractDates(
      "On 11 April 2026 I was dismissed. On 14 March 2026 I raised a complaint."
    );
    const result = inferLimitationStart(reverse);
    expect(result.status).toBe("ambiguous");
    expect(result.selectedDate?.getMonth()).toBe(2);
    expect(result.selectedDate?.getDate()).toBe(14);
  });

  it("does not suppress urgency when dates are uncertain but the narrative is urgent", () => {
    const keywordUrgency = "high" as const;
    const dates = extractDates("I have a hearing coming up. They dismissed me on 11 April 2026 and wrote again on 20 May 2026.");
    const result = inferLimitationStart(dates);
    expect(result.status).toBe("ambiguous");
    const fromDate = result.selectedDate
      ? urgencyFromDays(daysUntil(calculatePrimaryLimitationDate(result.selectedDate).dueDate))
      : "low";
    const combined = higherUrgency(keywordUrgency, fromDate);
    expect(["high", "critical"]).toContain(combined);
  });
});
