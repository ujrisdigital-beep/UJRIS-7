import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedUser } from "../helpers/seed";
import { confirmDeadlineAction } from "@/lib/actions/cases";
import { extractDates } from "@/lib/ai/heuristics";
import { inferLimitationStart } from "@/lib/legal/date-inference";
import {
  expectedDueDateFromSource,
  fingerprintFromExtracted,
  qualifyingCandidatesFromDates,
  qualifyingSourceOccurrences,
} from "@/lib/legal/deadline-confirmation";

const MAR_12 = new Date(Date.UTC(2026, 2, 12));
const APR_20 = new Date(Date.UTC(2026, 3, 20));

async function persistLimitation(
  userId: string,
  narrative: string,
  sourceEventDate: Date,
  sourceEventType: string,
  sourceEventId: string | null,
  sourceRawDate: string
) {
  const kase = await db.case.create({
    data: {
      userId,
      title: "Event date ownership",
      situation: "dismissal",
      narrative,
      urgency: "low",
      readiness: 10,
    },
  });
  const deadline = await db.deadline.create({
    data: {
      caseId: kase.id,
      label: "Primary limitation",
      dueDate: expectedDueDateFromSource(sourceEventDate),
      basis: "ERA_EQA_3M_LESS_1D",
      ruleId: "ERA_EQA_3M_LESS_1D",
      ruleVersion: "1.0.0",
      sourceEventDate,
      sourceEventType,
      sourceEventId,
      sourceRawDate,
      clockKind: "legal_limitation",
      confirmationStatus: "unconfirmed",
      resolutionStatus: "unresolved",
    },
  });
  return { kase, deadline };
}

function aprilHearing(narrative: string) {
  return extractDates(narrative).find((d) => d.civilDate === "2026-04-20");
}

function marchDismissal(narrative: string) {
  return extractDates(narrative).find(
    (d) => d.eventType === "dismissal" && d.civilDate === "2026-03-12"
  );
}

describe("event/date ownership — confirmDeadlineAction", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("A: undated dismissal does not inherit a dated hearing (separate sentences)", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed. My hearing is on 20 April 2026.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(0);
    expect(dates.some((d) => d.eventType === "dismissal" && d.parseStatus === "missing")).toBe(true);
    expect(aprilHearing(narrative)?.eventType).toBe("hearing");
    expect(aprilHearing(narrative)?.dateOwnerEventType).toBe("hearing");
    const inference = inferLimitationStart(dates);
    expect(inference.status).not.toBe("confirmed");
    expect(inference.reason).toMatch(/unresolved/i);
    const hearing = aprilHearing(narrative)!;
    const { deadline } = await persistLimitation(
      user.id,
      narrative,
      APR_20,
      "dismissal",
      fingerprintFromExtracted(hearing),
      "20 April 2026"
    );
    await loginAs(user);
    const result = await confirmDeadlineAction(deadline.id);
    expect(result).toMatchObject({ ok: false, error: "invalid" });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe(
      "unconfirmed"
    );
  });

  it("B: undated dismissal does not inherit a same-sentence hearing date", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed and my hearing is on 20 April 2026.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(0);
    expect(dates.some((d) => d.eventType === "dismissal" && !d.date)).toBe(true);
    expect(aprilHearing(narrative)?.eventType).toBe("hearing");
    const { deadline } = await persistLimitation(
      user.id,
      narrative,
      APR_20,
      "dismissal",
      fingerprintFromExtracted(aprilHearing(narrative)!),
      "20 April 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("C: undated dismissal does not inherit a grievance meeting date", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed. The grievance meeting was on 20 April 2026.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(0);
    expect(dates.find((d) => d.civilDate === "2026-04-20")?.eventType).toBe("grievance");
    const { deadline } = await persistLimitation(
      user.id,
      narrative,
      APR_20,
      "dismissal",
      fingerprintFromExtracted(dates.find((d) => d.civilDate === "2026-04-20")!),
      "20 April 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("D: undated resignation does not inherit an appeal hearing date", async () => {
    const user = await seedUser();
    const narrative = "I resigned. The appeal hearing was on 20 April 2026.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(0);
    expect(dates.some((d) => d.eventType === "resignation" && !d.date)).toBe(true);
    expect(aprilHearing(narrative)?.eventType).toBe("hearing");
    const { deadline } = await persistLimitation(
      user.id,
      narrative,
      APR_20,
      "resignation",
      fingerprintFromExtracted(aprilHearing(narrative)!),
      "20 April 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("E: dated dismissal and dated hearing keep distinct ownership", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 12 March 2026. My hearing is on 20 April 2026.";
    const dismissal = marchDismissal(narrative)!;
    expect(dismissal.dateOwnerEventType).toBe("dismissal");
    expect(aprilHearing(narrative)?.dateOwnerEventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(1);
    const { deadline } = await persistLimitation(
      user.id,
      narrative,
      MAR_12,
      "dismissal",
      fingerprintFromExtracted(dismissal),
      "12 March 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toEqual({ ok: true });
  });

  it("F: reversed order still assigns each date to the correct event", async () => {
    const user = await seedUser();
    const narrative = "My hearing is on 20 April 2026. I was dismissed on 12 March 2026.";
    expect(aprilHearing(narrative)?.eventType).toBe("hearing");
    const dismissal = marchDismissal(narrative)!;
    expect(dismissal.dateOwnerEventType).toBe("dismissal");
    const { deadline } = await persistLimitation(
      user.id,
      narrative,
      MAR_12,
      "dismissal",
      fingerprintFromExtracted(dismissal),
      "12 March 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toEqual({ ok: true });
  });

  it("G: same-sentence dated dismissal and dated hearing keep distinct ownership", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 12 March 2026 and my hearing is on 20 April 2026.";
    const dates = extractDates(narrative);
    expect(marchDismissal(narrative)?.dateOwnerEventType).toBe("dismissal");
    expect(aprilHearing(narrative)?.dateOwnerEventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(1);
    const { deadline } = await persistLimitation(
      user.id,
      narrative,
      MAR_12,
      "dismissal",
      fingerprintFromExtracted(marchDismissal(narrative)!),
      "12 March 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toEqual({ ok: true });
  });

  it("H: unresolved second dismissal still refuses even with a dated hearing", async () => {
    const user = await seedUser();
    const narrative =
      "I was dismissed on 12 March 2026 and dismissed again later that month. My hearing is on 20 April 2026.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(1);
    expect(qualifyingSourceOccurrences(dates).some((o) => !o.resolved)).toBe(true);
    expect(aprilHearing(narrative)?.eventType).toBe("hearing");
    const { deadline } = await persistLimitation(
      user.id,
      narrative,
      MAR_12,
      "dismissal",
      fingerprintFromExtracted(marchDismissal(narrative)!),
      "12 March 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({
      ok: false,
      error: "invalid",
      reason: "unresolved_qualifying_source",
    });
  });

  it("I: later undated dismissal does not inherit an earlier hearing date", async () => {
    const user = await seedUser();
    const narrative = "I attended a hearing on 20 April 2026 and was dismissed.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(0);
    expect(aprilHearing(narrative)?.eventType).toBe("hearing");
    expect(dates.some((d) => d.eventType === "dismissal" && d.parseStatus === "missing")).toBe(true);
    const { deadline } = await persistLimitation(
      user.id,
      narrative,
      APR_20,
      "dismissal",
      fingerprintFromExtracted(aprilHearing(narrative)!),
      "20 April 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("J: partial dismissal date is not converted to the hearing's exact civil date", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed around April 2026. The hearing was on 20 April 2026.";
    const dates = extractDates(narrative);
    const dismissal = dates.find((d) => d.eventType === "dismissal");
    expect(dismissal?.parseStatus).toBe("partial");
    expect(dismissal?.civilDate).not.toBe("2026-04-20");
    expect(aprilHearing(narrative)?.eventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(0);
    const { deadline } = await persistLimitation(
      user.id,
      narrative,
      APR_20,
      "dismissal",
      fingerprintFromExtracted(aprilHearing(narrative)!),
      "20 April 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("same-sentence undated dismissal + later hearing date stays unresolved", async () => {
    const narrative = "I was dismissed and the hearing took place on 20 April 2026.";
    const dates = extractDates(narrative);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(0);
    expect(aprilHearing(narrative)?.dateOwnerEventType).toBe("hearing");
  });

  it("same-sentence dated dismissal + dated hearing remain attached to the correct events", async () => {
    const narrative = "I was dismissed on 12 March 2026 and the hearing took place on 20 April 2026.";
    expect(marchDismissal(narrative)?.dateOwnerEventType).toBe("dismissal");
    expect(aprilHearing(narrative)?.dateOwnerEventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(1);
  });

  it("mutation: nearest leftover-date borrowing would make A/B/C/I confirmable", async () => {
    const narratives = [
      "I was dismissed. My hearing is on 20 April 2026.",
      "I was dismissed and my hearing is on 20 April 2026.",
      "I was dismissed. The grievance meeting was on 20 April 2026.",
      "I attended a hearing on 20 April 2026 and was dismissed.",
    ];
    for (const narrative of narratives) {
      const dates = extractDates(narrative);
      const resolved = qualifyingCandidatesFromDates(dates);
      expect(resolved).toHaveLength(0);
      expect(dates.some((d) => d.eventType === "dismissal" && d.parseStatus === "missing")).toBe(true);
    }
  });
});
