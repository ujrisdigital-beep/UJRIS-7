import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { generateCaseAnalysis } from "@/lib/ai/gateway";
import { freezeTime, unfreezeTime } from "@/lib/clock";
import { utcCivilKey } from "@/lib/legal/deadline-confirmation";
import { legalClockStatus, proceduralUrgency } from "@/lib/legal/deadline-state";
import {
  acknowledgeDeadlineAction,
  refreshCaseIntelligence,
  resolveDeadlineAction,
} from "@/lib/actions/cases";
import { refreshCaseIntelligenceForOwner } from "@/lib/cases/refresh-intelligence";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedUser } from "../helpers/seed";

const REFERENCE = "2026-09-10T12:00:00+01:00";

async function persistAnalysis(userId: string, situation: string, narrative: string) {
  const analysis = await generateCaseAnalysis({ situation, narrative, evidenceCount: 0 });
  const created = await db.case.create({
    data: {
      userId,
      title: "Hearing case",
      situation,
      narrative,
      readiness: analysis.readiness,
      urgency: analysis.urgency,
      deadlines: {
        create: analysis.deadlines.map((d) => ({
          label: d.label,
          dueDate: d.dueDate,
          basis: d.basis,
          confidence: d.confidence,
          source: "ai_inference",
          sourceKind: d.sourceKind,
          ruleId: d.ruleId,
          ruleVersion: d.ruleVersion,
          calculationInputs: d.calculationInputs,
          sourceEventDate: d.sourceEventDate,
          sourceEventType: d.sourceEventType,
          sourceEventId: d.sourceEventId,
          sourceRawDate: d.sourceRawDate,
          sourceReference: d.sourceReference,
          inferenceVersion: d.inferenceVersion,
          clockKind: d.clockKind,
          confirmationStatus: d.confirmationStatus,
          resolutionStatus: "unresolved",
        })),
      },
    },
    include: { deadlines: true },
  });
  return { analysis, created };
}

describe("relative hearing urgency through refresh", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    freezeTime(REFERENCE);
  });

  afterEach(() => {
    unfreezeTime();
  });

  it("hearing tomorrow stays HIGH/CRITICAL across refresh and acknowledgement", async () => {
    const user = await seedUser();
    const narrative = "My hearing is tomorrow. I need to prepare my bundle and witnesses.";
    const { created } = await persistAnalysis(user.id, "hearing", narrative);

    const hearing = created.deadlines.find((d) => d.clockKind === "procedural_attention");
    expect(hearing).toBeDefined();
    expect(utcCivilKey(hearing!.dueDate)).toBe("2026-09-11");
    expect(hearing!.sourceEventType).toBe("hearing");
    expect(hearing!.ruleId).not.toBe("ERA_EQA_3M_LESS_1D");
    expect(["high", "critical"]).toContain(created.urgency);
    expect(legalClockStatus(created.deadlines)).toBe("none");
    expect(["high", "critical"]).toContain(proceduralUrgency(created.deadlines));

    await loginAs(user);
    await refreshCaseIntelligence(created.id);
    const afterFirst = await db.case.findUnique({ where: { id: created.id }, include: { deadlines: true } });
    expect(["high", "critical"]).toContain(afterFirst?.urgency);
    const hearingAfter = afterFirst!.deadlines.find((d) => d.clockKind === "procedural_attention" && d.resolutionStatus !== "resolved");
    expect(hearingAfter).toBeDefined();
    expect(utcCivilKey(hearingAfter!.dueDate)).toBe("2026-09-11");

    await refreshCaseIntelligenceForOwner(user.id, created.id);
    const afterSecond = await db.case.findUnique({ where: { id: created.id }, include: { deadlines: true } });
    expect(["high", "critical"]).toContain(afterSecond?.urgency);
    expect(utcCivilKey(afterSecond!.deadlines.find((d) => d.clockKind === "procedural_attention")!.dueDate)).toBe(
      "2026-09-11"
    );

    await acknowledgeDeadlineAction(hearingAfter!.id);
    await refreshCaseIntelligence(created.id);
    const afterAck = await db.case.findUnique({ where: { id: created.id }, include: { deadlines: true } });
    expect(["high", "critical"]).toContain(afterAck?.urgency);
    expect(afterAck?.deadlines.find((d) => d.id === hearingAfter!.id)?.acknowledged).toBe(true);
    expect(afterAck?.deadlines.find((d) => d.id === hearingAfter!.id)?.resolutionStatus).toBe("unresolved");

    await resolveDeadlineAction(hearingAfter!.id, "Hearing concluded and no longer requires attention.");
    const afterResolve = await db.case.findUnique({ where: { id: created.id }, include: { deadlines: true } });
    expect(afterResolve?.deadlines.find((d) => d.id === hearingAfter!.id)?.resolutionStatus).toBe("resolved");
    expect(["low", "standard"]).toContain(afterResolve?.urgency);
  });

  it("refresh backfills a missing procedural hearing from the narrative", async () => {
    const user = await seedUser();
    const kase = await db.case.create({
      data: {
        userId: user.id,
        title: "Hearing only",
        situation: "hearing",
        narrative: "My hearing is tomorrow and I have not uploaded my bundle yet.",
        urgency: "high",
        readiness: 10,
      },
    });
    await loginAs(user);
    await refreshCaseIntelligence(kase.id);
    const stored = await db.case.findUnique({ where: { id: kase.id }, include: { deadlines: true } });
    const hearing = stored!.deadlines.find((d) => d.clockKind === "procedural_attention");
    expect(hearing).toBeDefined();
    expect(utcCivilKey(hearing!.dueDate)).toBe("2026-09-11");
    expect(["high", "critical"]).toContain(stored?.urgency);
  });

  it("hearing today is critical; hearing in 30 days is standard; past hearing is critical", async () => {
    const user = await seedUser();
    await loginAs(user);

    const today = await persistAnalysis(
      user.id,
      "hearing",
      "My hearing is today so I must attend the tribunal listing."
    );
    expect(utcCivilKey(today.created.deadlines[0]!.dueDate)).toBe("2026-09-10");
    expect(today.created.urgency).toBe("critical");

    const month = await persistAnalysis(
      user.id,
      "hearing",
      "My hearing is in 30 days and I am gathering the bundle in good time."
    );
    expect(utcCivilKey(month.created.deadlines[0]!.dueDate)).toBe("2026-10-10");
    await refreshCaseIntelligence(month.created.id);
    expect((await db.case.findUnique({ where: { id: month.created.id } }))?.urgency).toBe("standard");

    const past = await persistAnalysis(
      user.id,
      "hearing",
      "My hearing was yesterday and I still need to follow the tribunal order."
    );
    expect(utcCivilKey(past.created.deadlines[0]!.dueDate)).toBe("2026-09-09");
    expect(past.created.urgency).toBe("critical");
  });
});
