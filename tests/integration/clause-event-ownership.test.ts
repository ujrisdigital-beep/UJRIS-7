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
      title: "Clause event ownership",
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
  return deadline;
}

function aprilDate(narrative: string) {
  return extractDates(narrative).find((d) => d.civilDate === "2026-04-20");
}

function marchDismissal(narrative: string) {
  return extractDates(narrative).find(
    (d) => d.eventType === "dismissal" && d.civilDate === "2026-03-12" && d.mentionRole !== "reference"
  );
}

describe("clause-level event/date ownership", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("A: hearing for my dismissal does not give the dismissal 20 April", async () => {
    const user = await seedUser();
    const narrative = "The hearing for my dismissal is on 20 April 2026.";
    const dates = extractDates(narrative);
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    expect(aprilDate(narrative)?.dateOwnerEventType).toBe("hearing");
    expect(dates.some((d) => d.eventType === "dismissal" && d.mentionRole === "reference")).toBe(true);
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(0);
    expect(inferLimitationStart(dates).reason).toMatch(/unresolved/i);
    const deadline = await persistLimitation(
      user.id,
      narrative,
      APR_20,
      "dismissal",
      fingerprintFromExtracted(aprilDate(narrative)!),
      "20 April 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confidence).not.toBe("high");
  });

  it("B: hearing about my dismissal", async () => {
    const user = await seedUser();
    const narrative = "The hearing about my dismissal is on 20 April 2026.";
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
    const deadline = await persistLimitation(
      user.id,
      narrative,
      APR_20,
      "dismissal",
      fingerprintFromExtracted(aprilDate(narrative)!),
      "20 April 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("C: tribunal hearing concerning my dismissal", async () => {
    const narrative = "The tribunal hearing concerning my dismissal is on 20 April 2026.";
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
  });

  it("D: appeal concerning my dismissal", async () => {
    const user = await seedUser();
    const narrative = "The appeal concerning my dismissal took place on 20 April 2026.";
    expect(aprilDate(narrative)?.eventType).toBe("appeal");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
    const deadline = await persistLimitation(
      user.id,
      narrative,
      APR_20,
      "dismissal",
      fingerprintFromExtracted(aprilDate(narrative)!),
      "20 April 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("E: grievance meeting about my resignation", async () => {
    const user = await seedUser();
    const narrative = "The grievance meeting about my resignation was on 20 April 2026.";
    expect(aprilDate(narrative)?.eventType).toBe("grievance");
    expect(extractDates(narrative).some((d) => d.eventType === "resignation" && d.mentionRole === "reference")).toBe(
      true
    );
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
    const deadline = await persistLimitation(
      user.id,
      narrative,
      APR_20,
      "resignation",
      fingerprintFromExtracted(aprilDate(narrative)!),
      "20 April 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("F: hearing for dismissal plus independent dismissed-on date", async () => {
    const user = await seedUser();
    const narrative =
      "The hearing for my dismissal was on 20 April 2026, but I was dismissed on 12 March 2026.";
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    const dismissal = marchDismissal(narrative)!;
    expect(dismissal.dateOwnerEventType).toBe("dismissal");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(1);
    const deadline = await persistLimitation(
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

  it("G: reversed sentences keep independent ownership", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 12 March 2026. The hearing for my dismissal was on 20 April 2026.";
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    const dismissal = marchDismissal(narrative)!;
    const deadline = await persistLimitation(
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

  it("H: my dismissal was on 12 March and my hearing was on 20 April", async () => {
    const narrative = "My dismissal was on 12 March 2026 and my hearing was on 20 April 2026.";
    expect(marchDismissal(narrative)?.eventType).toBe("dismissal");
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(1);
  });

  it("I: unknown dismissal date with hearing for my dismissal refuses confirmation", async () => {
    const user = await seedUser();
    const narrative = "The hearing for my dismissal is on 20 April 2026 and I do not know my dismissal date.";
    expect(qualifyingCandidatesFromDates(extractDates(narrative)).length).toBe(0);
    const deadline = await persistLimitation(
      user.id,
      narrative,
      APR_20,
      "dismissal",
      fingerprintFromExtracted(aprilDate(narrative)!),
      "20 April 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("J: hearing on 20 April followed my dismissal does not date the dismissal", async () => {
    const narrative = "The hearing on 20 April 2026 followed my dismissal.";
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
  });

  it("prepositional variants do not transfer the procedural date", () => {
    const phrases = [
      "The hearing for my dismissal is on 20 April 2026.",
      "The appeal about my dismissal is on 20 April 2026.",
      "The meeting concerning my resignation is on 20 April 2026.",
      "The tribunal hearing regarding my dismissal is on 20 April 2026.",
      "The hearing over my dismissal is on 20 April 2026.",
      "The hearing in relation to my dismissal is on 20 April 2026.",
    ];
    for (const narrative of phrases) {
      expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
      expect(["hearing", "appeal", "grievance"]).toContain(aprilDate(narrative)?.eventType);
    }
  });

  it("My dismissal hearing was on 20 April is a hearing, not a dismissal date", () => {
    const narrative = "My dismissal hearing was on 20 April 2026.";
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
  });

  it("My dismissal was on 20 April is a dismissal occurrence", () => {
    const narrative = "My dismissal was on 20 April 2026.";
    const hit = extractDates(narrative).find((d) => d.civilDate === "2026-04-20");
    expect(hit?.eventType).toBe("dismissal");
    expect(hit?.mentionRole).toBe("occurrence");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(1);
  });

  it("mutation: nearest qualifying mention must not own the procedural date", () => {
    const narratives = [
      "The hearing for my dismissal is on 20 April 2026.",
      "The hearing about my dismissal is on 20 April 2026.",
      "The appeal concerning my dismissal took place on 20 April 2026.",
      "The grievance meeting about my resignation was on 20 April 2026.",
    ];
    for (const narrative of narratives) {
      expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
      expect(aprilDate(narrative)?.eventType).not.toBe("dismissal");
      expect(aprilDate(narrative)?.eventType).not.toBe("resignation");
    }
  });

  it("partial dismissal plus exact hearing still refuses confirmation", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed around April 2026. The hearing for my dismissal was on 20 April 2026.";
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
    const deadline = await persistLimitation(
      user.id,
      narrative,
      APR_20,
      "dismissal",
      fingerprintFromExtracted(aprilDate(narrative)!),
      "20 April 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });
});
