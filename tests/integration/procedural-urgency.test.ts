import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedCase, seedUser } from "../helpers/seed";
import { acknowledgeDeadlineAction, refreshCaseIntelligence } from "@/lib/actions/cases";
import { mostImportantUnresolvedDeadline } from "@/lib/legal/deadline-state";

describe("procedural urgency persistence", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("refresh keeps hearing-tomorrow urgency and does not treat it as a limitation start", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const hearingDate = addDays(new Date(), 1);
    await db.deadline.create({
      data: {
        caseId: kase.id,
        label: "Hearing / tribunal listing (procedural — not a limitation start)",
        dueDate: hearingDate,
        basis: "procedural",
        sourceKind: "source_event",
        ruleId: "PROCEDURAL_ATTENTION",
        clockKind: "procedural_attention",
        sourceEventType: "hearing",
        sourceEventDate: hearingDate,
        confirmationStatus: "unconfirmed",
        resolutionStatus: "unresolved",
      },
    });
    await db.case.update({ where: { id: kase.id }, data: { urgency: "standard" } });
    await loginAs(user);
    await refreshCaseIntelligence(kase.id);
    const stored = await db.case.findUnique({ where: { id: kase.id }, include: { deadlines: true } });
    expect(stored?.urgency).toBe("critical");
    expect(stored?.deadlines[0]?.clockKind).toBe("procedural_attention");
    expect(stored?.deadlines[0]?.ruleId).not.toBe("ERA_EQA_3M_LESS_1D");
  });

  it("acknowledged unresolved hearing remains the most important date", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const deadline = await db.deadline.create({
      data: {
        caseId: kase.id,
        label: "Hearing tomorrow",
        dueDate: addDays(new Date(), 1),
        basis: "procedural",
        clockKind: "procedural_attention",
        sourceEventType: "hearing",
        confirmationStatus: "unconfirmed",
        resolutionStatus: "unresolved",
      },
    });
    await loginAs(user);
    await acknowledgeDeadlineAction(deadline.id);
    const kaseAfter = await db.case.findUnique({ where: { id: kase.id }, include: { deadlines: true } });
    const shown = mostImportantUnresolvedDeadline(kaseAfter!.deadlines);
    expect(shown?.id).toBe(deadline.id);
    expect(shown?.acknowledged).toBe(true);
    expect(shown?.resolutionStatus).toBe("unresolved");
  });
});
