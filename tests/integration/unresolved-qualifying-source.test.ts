import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedUser } from "../helpers/seed";
import { confirmDeadlineAction } from "@/lib/actions/cases";
import {
  expectedDueDateFromSource,
  fingerprintFromExtracted,
  qualifyingCandidatesFromDates,
  qualifyingSourceOccurrences,
} from "@/lib/legal/deadline-confirmation";
import { extractDates } from "@/lib/ai/heuristics";

const MAR_12 = new Date(Date.UTC(2026, 2, 12));

async function persistDeadline(userId: string, narrative: string, sourceEventId?: string | null) {
  const kase = await db.case.create({
    data: {
      userId,
      title: "Unresolved qualifying source",
      situation: "dismissal",
      narrative,
      urgency: "low",
      readiness: 10,
    },
  });
  const extracted = extractDates(narrative);
  const dismissal =
    extracted.find((d) => d.eventType === "dismissal" && d.civilDate === "2026-03-12") ?? extracted[0];
  const deadline = await db.deadline.create({
    data: {
      caseId: kase.id,
      label: "Primary limitation",
      dueDate: expectedDueDateFromSource(MAR_12),
      basis: "ERA_EQA_3M_LESS_1D",
      ruleId: "ERA_EQA_3M_LESS_1D",
      ruleVersion: "1.0.0",
      sourceEventDate: MAR_12,
      sourceEventType: "dismissal",
      sourceEventId: sourceEventId === undefined ? fingerprintFromExtracted(dismissal!) : sourceEventId,
      sourceRawDate: "12 March 2026",
      clockKind: "legal_limitation",
      confirmationStatus: "unconfirmed",
      resolutionStatus: "unresolved",
    },
  });
  return { kase, deadline };
}

describe("confirmDeadlineAction unresolved qualifying source", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("A: one resolved qualifying source may confirm", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 12 March 2026.";
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(1);
    expect(qualifyingSourceOccurrences(extractDates(narrative)).filter((o) => !o.resolved)).toHaveLength(0);
    const { deadline } = await persistDeadline(user.id, narrative);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toEqual({ ok: true });
    const stored = await db.deadline.findUnique({ where: { id: deadline.id } });
    expect(stored?.confirmationStatus).toBe("confirmed");
    expect(stored?.confidence).toBe("high");
  });

  it("B: resolved + later-that-month unresolved qualifying source refuses", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 12 March 2026 and dismissed again later that month.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(1);
    expect(qualifyingSourceOccurrences(dates).some((o) => !o.resolved)).toBe(true);
    const { deadline } = await persistDeadline(user.id, narrative);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({
      ok: false,
      error: "invalid",
      reason: "unresolved_qualifying_source",
    });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe(
      "unconfirmed"
    );
  });

  it("C: resolved + invalid second dismissal date refuses", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 12 March 2026 and dismissed again on 31 February 2026.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(1);
    expect(qualifyingSourceOccurrences(dates).some((o) => !o.resolved && o.parseStatus === "invalid")).toBe(
      true
    );
    const { deadline } = await persistDeadline(user.id, narrative);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({
      ok: false,
      error: "invalid",
      reason: "unresolved_qualifying_source",
    });
  });

  it("D: resolved + partial second dismissal date refuses", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 12 March 2026 and dismissed again in April.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(1);
    expect(qualifyingSourceOccurrences(dates).some((o) => !o.resolved && o.parseStatus === "partial")).toBe(
      true
    );
    const { deadline } = await persistDeadline(user.id, narrative);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({
      ok: false,
      error: "invalid",
      reason: "unresolved_qualifying_source",
    });
  });

  it("E: dismissal + unresolved hearing does not block confirmation", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 12 March 2026 and later attended a hearing.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(1);
    expect(qualifyingSourceOccurrences(dates).filter((o) => !o.resolved)).toHaveLength(0);
    const { deadline } = await persistDeadline(user.id, narrative);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toEqual({ ok: true });
  });

  it("F: unresolved grievance is not a second limitation source", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 12 March 2026 and the grievance meeting date is unclear.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(1);
    expect(qualifyingSourceOccurrences(dates).filter((o) => !o.resolved)).toHaveLength(0);
    const { deadline } = await persistDeadline(user.id, narrative);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toEqual({ ok: true });
  });

  it("G: two resolved qualifying dismissals refuse", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 12 March 2026. They dismissed me again on 18 March 2026.";
    expect(qualifyingCandidatesFromDates(extractDates(narrative)).length).toBeGreaterThan(1);
    const { deadline } = await persistDeadline(user.id, narrative);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({
      ok: false,
      error: "invalid",
      reason: "ambiguous",
    });
  });

  it("H: two same-day resolved qualifying dismissals at different spans refuse", async () => {
    const user = await seedUser();
    const narrative =
      "I was dismissed on 12 March 2026 after the morning meeting. They dismissed me on 12 March 2026 after the afternoon meeting.";
    const candidates = qualifyingCandidatesFromDates(extractDates(narrative));
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.sourceStartOffset).not.toBe(candidates[1]!.sourceStartOffset);
    const { deadline } = await persistDeadline(user.id, narrative, candidates[0]!.fingerprint);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({
      ok: false,
      error: "invalid",
      reason: "ambiguous",
    });
  });

  it("I: duplicate parser output of the exact same span remains one source", async () => {
    const narrative = "I was dismissed on 12 March 2026.";
    const dates = extractDates(narrative).filter((d) => d.civilDate === "2026-03-12" && d.eventType === "dismissal");
    const spans = new Set(dates.map((d) => `${d.sourceId}:${d.sourceStartOffset}:${d.sourceEndOffset}`));
    expect(spans.size).toBe(1);
    expect(qualifyingSourceOccurrences(extractDates(narrative))).toHaveLength(1);
  });

  it("J: malformed unrelated calendar reference does not false-block", async () => {
    const user = await seedUser();
    const narrative =
      "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work. The archive stamp 31 February 2026 is unrelated.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(1);
    expect(qualifyingSourceOccurrences(dates).filter((o) => !o.resolved)).toHaveLength(0);
    const { deadline } = await persistDeadline(user.id, narrative);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toEqual({ ok: true });
  });
});
