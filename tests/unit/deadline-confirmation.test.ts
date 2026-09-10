import { describe, expect, it } from "vitest";
import { extractDates } from "@/lib/ai/heuristics";
import {
  evaluateLimitationConfirmation,
  expectedDueDateFromSource,
  fingerprintFromExtracted,
  qualifyingCandidatesFromDates,
  sourceEventFingerprint,
  utcCivilKey,
  type StoredDeadlineProvenance,
} from "@/lib/legal/deadline-confirmation";
import { LIMITATION_INFERENCE_VERSION, LIMITATION_RULE_ID, stableSourceIdentity } from "@/lib/legal/event-semantics";

const mar12 = new Date(Date.UTC(2026, 2, 12));
const dueFromMar12 = expectedDueDateFromSource(mar12);

function dismissalFingerprint(narrative: string) {
  const dates = extractDates(narrative);
  const hit = dates.find((d) => d.eventType === "dismissal" && d.civilDate === "2026-03-12") ?? dates.find((d) => d.eventType === "dismissal");
  return { dates, fingerprint: hit ? fingerprintFromExtracted(hit) : null };
}

function confirm(partial: Partial<StoredDeadlineProvenance> & Pick<StoredDeadlineProvenance, "narrative">) {
  return evaluateLimitationConfirmation({
    clockKind: "legal_limitation",
    dueDate: dueFromMar12,
    ruleId: LIMITATION_RULE_ID,
    inferenceVersion: LIMITATION_INFERENCE_VERSION,
    sourceEventDate: null,
    sourceEventType: "unknown",
    ...partial,
  });
}

describe("deadline confirmation source binding", () => {
  it("A: stored dismissal 12 March with matching span fingerprint may confirm", () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const { dates, fingerprint } = dismissalFingerprint(narrative);
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: fingerprint,
      sourceRawDate: "12 March 2026",
      narrative,
      extractedDates: dates,
    });
    expect(decision.allowed).toBe(true);
  });

  it("B: stored dismissal 12 March with narrative dismissal 18 March is refused", () => {
    const narrative = "I was dismissed on 18 March 2026 after raising a complaint about discrimination at work.";
    const original = dismissalFingerprint(
      "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work."
    );
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: original.fingerprint,
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
      sourceEventId: "span:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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

  it("two distinct same-day dismissals in different sentences are not one unique source", () => {
    const narrative =
      "I was dismissed on 12 March 2026 after the morning meeting. They dismissed me on 12 March 2026 after the afternoon meeting.";
    const dates = extractDates(narrative);
    const candidates = qualifyingCandidatesFromDates(dates);
    expect(candidates.length).toBeGreaterThan(1);
    expect(new Set(candidates.map((c) => c.fingerprint)).size).toBeGreaterThan(1);
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: candidates[0]?.fingerprint,
      sourceRawDate: "12 March 2026",
      narrative,
      extractedDates: dates,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.status).toBe("ambiguous");
      expect(decision.code).toBe("ambiguous");
    }
  });

  it("two distinct same-day dismissals in the SAME sentence are two candidates", () => {
    const narrative =
      "I was dismissed on 12 March 2026, and the later dismissal decision was also made on 12 March 2026.";
    const dates = extractDates(narrative);
    const candidates = qualifyingCandidatesFromDates(dates);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.sourceStartOffset).not.toBe(candidates[1]!.sourceStartOffset);
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: candidates[0]!.fingerprint,
      sourceRawDate: "12 March 2026",
      narrative,
      extractedDates: dates,
    });
    expect(decision.allowed).toBe(false);
  });

  it("identical phrase at two offsets remains two occurrences", () => {
    const narrative = "Dismissed on 12 March 2026 then dismissed on 12 March 2026 again after the appeal.";
    const dates = extractDates(narrative).filter((d) => d.raw === "12 March 2026");
    expect(dates.length).toBeGreaterThanOrEqual(2);
    expect(dates[0]!.sourceStartOffset).not.toBe(dates[1]!.sourceStartOffset);
    expect(fingerprintFromExtracted(dates[0]!)).not.toBe(fingerprintFromExtracted(dates[1]!));
  });

  it("refuses when the stored due date does not equal the recomputed due date", () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const { fingerprint } = dismissalFingerprint(narrative);
    const offByOne = new Date(dueFromMar12);
    offByOne.setUTCDate(offByOne.getUTCDate() + 1);
    const decision = confirm({
      dueDate: offByOne,
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: fingerprint,
      sourceRawDate: "12 March 2026",
      narrative,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe("stored_deadline_mismatch");
    expect(utcCivilKey(expectedDueDateFromSource(mar12))).toBe(utcCivilKey(dueFromMar12));
  });

  it("E: source date removed from the narrative is refused", () => {
    const original = dismissalFingerprint(
      "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work."
    );
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: original.fingerprint,
      sourceRawDate: "12 March 2026",
      narrative: "They treated me unfairly at work last year and I have no exact dates.",
    });
    expect(decision.allowed).toBe(false);
  });

  it("same-date replacement source cannot inherit confirmation provenance", () => {
    const sourceA = "I was dismissed on 12 March 2026 after the morning meeting about discrimination.";
    const sourceB = "They dismissed me on 12 March 2026 following a different afternoon process.";
    const stored = dismissalFingerprint(sourceA);
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: stored.fingerprint,
      sourceRawDate: "12 March 2026",
      narrative: sourceB,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe("source_no_longer_present");
  });

  it("legacy type+date identity cannot confirm a replacement span", () => {
    const narrative = "They dismissed me on 12 March 2026 following a different afternoon process.";
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: stableSourceIdentity("dismissal", mar12),
      sourceRawDate: "12 March 2026",
      narrative,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.code).toBe("source_identity_changed");
  });

  it("F: a changed rule id is refused", () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const { fingerprint } = dismissalFingerprint(narrative);
    const decision = confirm({
      ruleId: "SOME_OTHER_RULE",
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: fingerprint,
      sourceRawDate: "12 March 2026",
      narrative,
    });
    expect(decision.allowed).toBe(false);
  });

  it("G: equivalent UTC civil dates from an ISO instant match the stored date", () => {
    const narrative = "I was dismissed on 2026-03-12T23:00:00+00:00 after raising a complaint about discrimination.";
    const { fingerprint } = dismissalFingerprint(narrative);
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: fingerprint,
      sourceRawDate: "2026-03-12",
      narrative,
    });
    expect(decision.allowed).toBe(true);
  });

  it("stored source_event_id for a different span is refused", () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: "span:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      sourceRawDate: "12 March 2026",
      narrative,
    });
    expect(decision.allowed).toBe(false);
  });

  it("inference version mismatch is refused", () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const { fingerprint } = dismissalFingerprint(narrative);
    const decision = confirm({
      inferenceVersion: "limitation-inference/0.0.1",
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: fingerprint,
      sourceRawDate: "12 March 2026",
      narrative,
    });
    expect(decision.allowed).toBe(false);
  });

  it("H: invalid stored raw source is refused", () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const { fingerprint } = dismissalFingerprint(narrative);
    const decision = confirm({
      sourceEventDate: mar12,
      sourceEventType: "dismissal",
      sourceEventId: fingerprint,
      sourceRawDate: "31 February 2026",
      narrative,
    });
    expect(decision.allowed).toBe(false);
  });

  it("fingerprint identity includes offsets (mutation: type+date alone is insufficient)", () => {
    const a = sourceEventFingerprint({
      sourceStartOffset: 10,
      sourceEndOffset: 24,
      eventType: "dismissal",
      civilDate: "2026-03-12",
      raw: "12 March 2026",
    });
    const b = sourceEventFingerprint({
      sourceStartOffset: 40,
      sourceEndOffset: 54,
      eventType: "dismissal",
      civilDate: "2026-03-12",
      raw: "12 March 2026",
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(stableSourceIdentity("dismissal", mar12));
    expect(a.startsWith("span:")).toBe(true);
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
