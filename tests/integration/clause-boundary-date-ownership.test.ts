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

/**
 * Remaining High fixtures recovered against R8 HEAD 772cb9b.
 * CURSOR_BLOCKERS.md was not mounted; these are the two named R9 clause
 * structures that still assigned 20 April to a dismissal occurrence.
 */
export const CODEX_CLAUSE_BOUNDARY_PHRASES = [
  "The hearing, about my dismissal, is on 20 April 2026.",
  "The tribunal hearing, which concerns my dismissal, is on 20 April 2026.",
] as const;

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
      title: "Clause-boundary date ownership",
      situation: "dismissal",
      narrative,
      urgency: "low",
      readiness: 10,
    },
  });
  return db.deadline.create({
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
}

function aprilDate(narrative: string) {
  return extractDates(narrative).find((d) => d.civilDate === "2026-04-20");
}

function marchDismissal(narrative: string) {
  return extractDates(narrative).find(
    (d) => d.eventType === "dismissal" && d.civilDate === "2026-03-12" && d.mentionRole !== "reference"
  );
}

describe("clause-boundary date ownership", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("Codex repro 1: parenthetical hearing about dismissal does not date the dismissal", async () => {
    const user = await seedUser();
    const narrative = CODEX_CLAUSE_BOUNDARY_PHRASES[0];
    const dates = extractDates(narrative);
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    expect(aprilDate(narrative)?.dateOwnerEventType).toBe("hearing");
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
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("unconfirmed");
  });

  it("Codex repro 2: which-concerns relative clause does not date the dismissal", async () => {
    const user = await seedUser();
    const narrative = CODEX_CLAUSE_BOUNDARY_PHRASES[1];
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
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confidence).not.toBe("high");
  });

  it("relative-clause: hearing for the dismissal I received last month", async () => {
    const user = await seedUser();
    const narrative = "The hearing for the dismissal I received last month is on 20 April 2026.";
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

  it("parenthetical scheduled-for date stays on the hearing", () => {
    const narrative = "The hearing for my dismissal, scheduled for 20 April 2026, was postponed.";
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
  });

  it("date-first equivalents keep 20 April procedural", () => {
    const phrases = [
      "On 20 April 2026, the hearing for the dismissal I received last month took place.",
      "On 20 April 2026, the hearing, about my dismissal, took place.",
      "The 20 April 2026 hearing concerned the dismissal I received earlier.",
    ];
    for (const narrative of phrases) {
      expect(aprilDate(narrative)?.eventType).not.toBe("dismissal");
      expect(qualifyingCandidatesFromDates(extractDates(narrative)).every((c) => c.civilDate !== "2026-04-20")).toBe(
        true
      );
    }
  });

  it("embedded dismissal with its own 12 March keeps April on the hearing", async () => {
    const user = await seedUser();
    const narrative = "The hearing for the dismissal I received on 12 March 2026 is on 20 April 2026.";
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    const dismissal = marchDismissal(narrative);
    expect(dismissal?.dateOwnerEventType).toBe("dismissal");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(1);
    const deadline = await persistLimitation(
      user.id,
      narrative,
      MAR_12,
      "dismissal",
      fingerprintFromExtracted(dismissal!),
      "12 March 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toEqual({ ok: true });
  });

  it("parenthetical with a real inner dismissal date does not cross-assign", async () => {
    const user = await seedUser();
    const narrative = "The hearing, about my dismissal on 12 March 2026, is on 20 April 2026.";
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    expect(marchDismissal(narrative)?.eventType).toBe("dismissal");
    const deadline = await persistLimitation(
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

  it("two-date ownership: dismissal 12 March, hearing 20 April", () => {
    const phrases = [
      "The hearing for my dismissal on 12 March 2026 was listed for 20 April 2026.",
      "The 20 April 2026 hearing concerned my dismissal on 12 March 2026.",
    ];
    for (const narrative of phrases) {
      expect(marchDismissal(narrative)?.eventType).toBe("dismissal");
      expect(aprilDate(narrative)?.eventType).toBe("hearing");
      expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(1);
    }
  });

  it("real dismissal plus hearing reference is not a second candidate", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 12 March 2026. The hearing for my dismissal is on 20 April 2026.";
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(1);
    const deadline = await persistLimitation(
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

  it("a second real unresolved dismissal still blocks confirmation", async () => {
    const user = await seedUser();
    const narrative =
      "I was dismissed on 12 March 2026. The hearing about my dismissal was on 20 April 2026. I was dismissed again later that month.";
    const dates = extractDates(narrative);
    expect(aprilDate(narrative)?.eventType).toBe("hearing");
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(1);
    expect(qualifyingSourceOccurrences(dates).some((o) => !o.resolved && o.eventType === "dismissal")).toBe(true);
    const deadline = await persistLimitation(
      user.id,
      narrative,
      MAR_12,
      "dismissal",
      fingerprintFromExtracted(marchDismissal(narrative)!),
      "12 March 2026"
    );
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("R8 three named procedural-reference cases remain unconfirmable as dismissals", () => {
    const r8 = [
      "The appeal against my dismissal was on 20 April 2026.",
      "The tribunal hearing related to my dismissal was on 20 April 2026.",
      "The hearing re my dismissal was on 20 April 2026.",
    ];
    for (const narrative of r8) {
      expect(aprilDate(narrative)?.eventType).not.toBe("dismissal");
      expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
    }
  });

  it("mutation: nearest qualifying mention must not own the outer procedural date", () => {
    for (const narrative of CODEX_CLAUSE_BOUNDARY_PHRASES) {
      expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
      expect(aprilDate(narrative)?.eventType).not.toBe("dismissal");
      expect(aprilDate(narrative)?.dateOwnerEventType).not.toBe("dismissal");
    }
  });
});
