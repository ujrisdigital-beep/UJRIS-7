import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedUser } from "../helpers/seed";
import { confirmDeadlineAction } from "@/lib/actions/cases";
import {
  expectedDueDateFromSource,
  fingerprintFromExtracted,
  qualifyingCandidatesFromDates,
} from "@/lib/legal/deadline-confirmation";
import { extractDates } from "@/lib/ai/heuristics";

const MAR_12 = new Date(Date.UTC(2026, 2, 12));

async function persistDeadline(userId: string, narrative: string, sourceEventId?: string | null) {
  const kase = await db.case.create({
    data: {
      userId,
      title: "Source identity",
      situation: "dismissal",
      narrative,
      urgency: "low",
      readiness: 10,
    },
  });
  const extracted = extractDates(narrative);
  const dismissal = extracted.find((d) => d.eventType === "dismissal" && d.civilDate === "2026-03-12") ?? extracted[0];
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

describe("confirmDeadlineAction source occurrence identity", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("A: one dismissal occurrence on 12 March is a unique confirmable candidate", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(1);
    const { deadline } = await persistDeadline(user.id, narrative);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toEqual({ ok: true });
  });

  it("B: two same-day dismissals in different sentences refuse confirmation", async () => {
    const user = await seedUser();
    const narrative =
      "I was dismissed on 12 March 2026 after the morning meeting. They dismissed me on 12 March 2026 after the afternoon meeting.";
    expect(qualifyingCandidatesFromDates(extractDates(narrative)).length).toBe(2);
    const { deadline } = await persistDeadline(user.id, narrative);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({
      ok: false,
      error: "invalid",
      reason: "ambiguous",
    });
  });

  it("C: two same-day dismissals in the SAME sentence refuse confirmation", async () => {
    const user = await seedUser();
    const narrative =
      "I was dismissed on 12 March 2026, and the later dismissal decision was also made on 12 March 2026.";
    const candidates = qualifyingCandidatesFromDates(extractDates(narrative));
    expect(candidates).toHaveLength(2);
    const { deadline } = await persistDeadline(user.id, narrative, candidates[0]!.fingerprint);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({
      ok: false,
      error: "invalid",
      reason: "ambiguous",
    });
  });

  it("D: the same phrase at two offsets is two candidates", async () => {
    const user = await seedUser();
    const narrative = "Dismissed on 12 March 2026 then dismissed on 12 March 2026 after the second process.";
    const dates = extractDates(narrative).filter((d) => d.raw === "12 March 2026");
    expect(dates.length).toBeGreaterThanOrEqual(2);
    expect(dates[0]!.sourceStartOffset).not.toBe(dates[1]!.sourceStartOffset);
    const { deadline } = await persistDeadline(user.id, narrative);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({
      ok: false,
      error: "invalid",
      reason: "ambiguous",
    });
  });

  it("E: replacing source A with same-date source B refuses confirmation", async () => {
    const user = await seedUser();
    const sourceA = "I was dismissed on 12 March 2026 after the morning meeting about discrimination.";
    const sourceB = "They dismissed me on 12 March 2026 following a different afternoon process.";
    const storedId = fingerprintFromExtracted(extractDates(sourceA).find((d) => d.eventType === "dismissal")!);
    const { kase, deadline } = await persistDeadline(user.id, sourceA, storedId);
    await db.case.update({ where: { id: kase.id }, data: { narrative: sourceB } });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({
      ok: false,
      error: "invalid",
      reason: "source_no_longer_present",
    });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("unconfirmed");
  });

  it("F: stored source text change with same type/date refuses confirmation", async () => {
    const user = await seedUser();
    const original = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const changed = "I was dismissed on 12 March 2026 once the appeal outcome was issued in writing.";
    const storedId = fingerprintFromExtracted(extractDates(original).find((d) => d.eventType === "dismissal")!);
    const { kase, deadline } = await persistDeadline(user.id, original, storedId);
    await db.case.update({ where: { id: kase.id }, data: { narrative: changed } });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({
      ok: false,
      error: "invalid",
      reason: "source_no_longer_present",
    });
  });

  it("G: an unrelated same-date hearing does not block a unique dismissal span", async () => {
    const user = await seedUser();
    const narrative =
      "I was dismissed on 12 March 2026 after raising a complaint. My hearing is on 12 March 2026.";
    const candidates = qualifyingCandidatesFromDates(extractDates(narrative));
    expect(candidates).toHaveLength(1);
    const { deadline } = await persistDeadline(user.id, narrative, candidates[0]!.fingerprint);
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toEqual({ ok: true });
  });

  it("H: identical source spans from overlapping parsers collapse to one occurrence", async () => {
    const narrative = "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.";
    const dates = extractDates(narrative).filter((d) => d.civilDate === "2026-03-12" && d.eventType === "dismissal");
    const spans = new Set(dates.map((d) => `${d.sourceStartOffset}:${d.sourceEndOffset}`));
    expect(spans.size).toBe(1);
  });
});
