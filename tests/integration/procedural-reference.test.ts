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

/** Codex R8 HIGH fixtures. CURSOR_BLOCKERS.md was not on this host; these are the ticket's three named phrases. */
export const CODEX_PROCEDURAL_REFERENCE_PHRASES = [
  "The appeal against my dismissal was on 20 April 2026.",
  "The tribunal hearing related to my dismissal was on 20 April 2026.",
  "The hearing re my dismissal was on 20 April 2026.",
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
      title: "Procedural reference",
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

describe("procedural-reference classification", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it.each([...CODEX_PROCEDURAL_REFERENCE_PHRASES])(
    "Codex fixture refuses confirmation: %s",
    async (narrative) => {
      const user = await seedUser();
      const dates = extractDates(narrative);
      expect(aprilDate(narrative)?.eventType).not.toBe("dismissal");
      expect(["hearing", "appeal", "grievance"]).toContain(aprilDate(narrative)?.eventType);
      expect(qualifyingCandidatesFromDates(dates)).toHaveLength(0);
      expect(inferLimitationStart(dates).status).not.toBe("confirmed");
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
      expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe(
        "unconfirmed"
      );
    }
  );

  it("appeal against / hearing related to / hearing re do not date the dismissal", () => {
    expect(aprilDate("The appeal against my dismissal was on 20 April 2026.")?.eventType).toBe("appeal");
    expect(aprilDate("The tribunal hearing related to my dismissal was on 20 April 2026.")?.eventType).toBe(
      "hearing"
    );
    expect(aprilDate("The hearing re my dismissal was on 20 April 2026.")?.eventType).toBe("hearing");
  });

  it("date-first procedural references keep 20 April on the procedural event", () => {
    const phrases = [
      "On 20 April 2026 there was an appeal about my dismissal.",
      "On 20 April 2026, the hearing about my dismissal took place.",
      "The 20 April 2026 hearing concerned my dismissal.",
      "The 20 April 2026 tribunal hearing related to my dismissal.",
    ];
    for (const narrative of phrases) {
      expect(aprilDate(narrative)?.eventType).not.toBe("dismissal");
      expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
    }
  });

  it("compound procedural nouns do not invent a dismissal date", () => {
    expect(aprilDate("My dismissal hearing was on 20 April 2026.")?.eventType).toBe("hearing");
    expect(aprilDate("My dismissal appeal was on 20 April 2026.")?.eventType).toBe("appeal");
    expect(aprilDate("My dismissal tribunal hearing was on 20 April 2026.")?.eventType).toBe("hearing");
    expect(aprilDate("My dismissal grievance meeting was on 20 April 2026.")?.eventType).toBe("grievance");
    expect(qualifyingCandidatesFromDates(extractDates("My dismissal hearing was on 20 April 2026."))).toHaveLength(
      0
    );
  });

  it("My dismissal was on 20 April remains a real dismissal occurrence", () => {
    const hit = aprilDate("My dismissal was on 20 April 2026.");
    expect(hit?.eventType).toBe("dismissal");
    expect(hit?.mentionRole).toBe("occurrence");
    expect(qualifyingCandidatesFromDates(extractDates("My dismissal was on 20 April 2026."))).toHaveLength(1);
  });

  it("real qualifying occurrences remain detectable", () => {
    const phrases = [
      "I was dismissed on 12 March 2026.",
      "My dismissal happened on 12 March 2026.",
      "My employment was terminated on 12 March 2026.",
    ];
    for (const narrative of phrases) {
      const hit = marchDismissal(narrative);
      expect(hit?.eventType).toBe("dismissal");
      expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(1);
    }
  });

  it("real occurrence plus later procedural reference may confirm 12 March", async () => {
    const user = await seedUser();
    const narrative =
      "I was dismissed on 12 March 2026. The appeal against my dismissal was on 20 April 2026.";
    expect(aprilDate(narrative)?.eventType).toBe("appeal");
    const dismissal = marchDismissal(narrative)!;
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

  it("a second real unresolved dismissal still blocks confirmation", async () => {
    const user = await seedUser();
    const narrative =
      "I was dismissed on 12 March 2026. The appeal against my dismissal was on 20 April 2026. I was dismissed again later that month.";
    const dates = extractDates(narrative);
    expect(aprilDate(narrative)?.eventType).toBe("appeal");
    expect(qualifyingCandidatesFromDates(dates)).toHaveLength(1);
    expect(qualifyingSourceOccurrences(dates).some((o) => !o.resolved && o.eventType === "dismissal")).toBe(
      true
    );
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
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("confirmation defence: reference-only mention cannot confirm even if stored as dismissal", async () => {
    const user = await seedUser();
    const narrative = "The appeal against my dismissal was on 20 April 2026.";
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

  it("mutation: R7 preposition list / nearest qualifying mention would re-date Codex fixtures", () => {
    for (const narrative of CODEX_PROCEDURAL_REFERENCE_PHRASES) {
      expect(qualifyingCandidatesFromDates(extractDates(narrative))).toHaveLength(0);
      expect(aprilDate(narrative)?.eventType).not.toBe("dismissal");
    }
    expect(aprilDate("The hearing relating to my dismissal was on 20 April 2026.")?.eventType).not.toBe(
      "dismissal"
    );
    expect(aprilDate("The review related to my resignation was on 20 April 2026.")?.eventType).not.toBe(
      "resignation"
    );
  });
});
