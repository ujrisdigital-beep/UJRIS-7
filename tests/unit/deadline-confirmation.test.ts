import { describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import { extractDates } from "@/lib/ai/heuristics";
import { evaluateLimitationConfirmation } from "@/lib/legal/deadline-confirmation";
import { LIMITATION_INFERENCE_VERSION, LIMITATION_RULE_ID, stableSourceIdentity } from "@/lib/legal/event-semantics";

const due = addDays(new Date(), 10);
const mar12 = new Date(Date.UTC(2026, 2, 12));
const mar18 = new Date(Date.UTC(2026, 2, 18));

function confirm(partial: Parameters<typeof evaluateLimitationConfirmation>[0]) {
  return evaluateLimitationConfirmation({
    clockKind: "legal_limitation",
    dueDate: due,
    ruleId: LIMITATION_RULE_ID,
    inferenceVersion: LIMITATION_INFERENCE_VERSION,
    ...partial,
  });
}

describe("deadline confirmation source binding", () => {
  it("A: stored dismissal 12 March with matching narrative may confirm", () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: stableSourceIdentity("dismissal", mar12),
      sourceRawDate: "12 March 2026",
      narrative,
      extractedDates: extractDates(narrative),
    });
    expect(decision.allowed).toBe(true);
  });

  it("B: stored dismissal 12 March with narrative dismissal 18 March is refused", () => {
    const narrative = "I was dismissed on 18 March 2026 after raising a complaint about discrimination at work.";
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: stableSourceIdentity("dismissal", mar12),
      sourceRawDate: "12 March 2026",
      narrative,
      extractedDates: extractDates(narrative),
    });
    expect(decision.allowed).toBe(false);
  });

  it("C: stored hearing 12 March cannot become a dismissal-derived confirmation", () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "hearing",
      sourceEventId: stableSourceIdentity("hearing", mar12),
      sourceRawDate: "12 March 2026",
      narrative,
      extractedDates: extractDates(narrative),
    });
    expect(decision.allowed).toBe(false);
  });

  it("D: two dismissal dates cannot be uniquely confirmed", () => {
    const narrative =
      "I was dismissed on 12 March 2026. They dismissed me again on 18 March 2026.";
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceRawDate: "12 March 2026",
      narrative,
      extractedDates: extractDates(narrative),
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.status).toBe("ambiguous");
  });

  it("E: source date removed from the narrative is refused", () => {
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceRawDate: "12 March 2026",
      narrative: "They treated me unfairly at work last year and I have no exact dates.",
    });
    expect(decision.allowed).toBe(false);
  });

  it("F: a changed rule id is refused", () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const decision = confirm({
      ruleId: "SOME_OTHER_RULE",
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceRawDate: "12 March 2026",
      narrative,
    });
    expect(decision.allowed).toBe(false);
  });

  it("G: equivalent UTC civil dates from an ISO instant match the stored date", () => {
    const narrative = "I was dismissed on 2026-03-12T23:00:00+00:00 after raising a complaint about discrimination.";
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceRawDate: "2026-03-12",
      narrative,
    });
    expect(decision.allowed).toBe(true);
  });

  it("stored source_event_id for a different date is refused", () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: stableSourceIdentity("dismissal", mar18),
      sourceRawDate: "12 March 2026",
      narrative,
    });
    expect(decision.allowed).toBe(false);
  });

  it("inference version mismatch is refused", () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const decision = confirm({
      inferenceVersion: "limitation-inference/0.0.1",
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceRawDate: "12 March 2026",
      narrative,
    });
    expect(decision.allowed).toBe(false);
  });

  it("H: invalid stored raw source is refused", () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceRawDate: "31 February 2026",
      narrative,
    });
    expect(decision.allowed).toBe(false);
  });

  it("procedural clock kind cannot be confirmed as a limitation start", () => {
    const narrative = "My hearing is on 12 March 2026.";
    const decision = confirm({
      clockKind: "procedural_attention",
      sourceEventDate: mar12,
      sourceEventType: "hearing",
      narrative,
    });
    expect(decision.allowed).toBe(false);
  });
});
