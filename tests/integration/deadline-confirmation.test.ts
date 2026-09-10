import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedCase, seedUser } from "../helpers/seed";
import { confirmDeadlineAction, refreshCaseIntelligence } from "@/lib/actions/cases";
import { expectedDueDateFromSource, fingerprintFromExtracted } from "@/lib/legal/deadline-confirmation";
import { extractDates } from "@/lib/ai/heuristics";

describe("explicit deadline confirmation", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("confirms only an allow-listed dismissal through an auditable owner action", async () => {
    const user = await seedUser();
    const narrative = "I was dismissed on 11 April 2026 after raising a complaint about discrimination at work.";
    const kase = await db.case.create({
      data: {
        userId: user.id,
        title: "Dismissal case",
        situation: "dismissal",
        narrative,
        urgency: "low",
        readiness: 10,
      },
    });
    const sourceEventDate = new Date(Date.UTC(2026, 3, 11));
    const sourceEventId = fingerprintFromExtracted(
      extractDates(narrative).find((d) => d.eventType === "dismissal")!
    );
    const deadline = await db.deadline.create({
      data: {
        caseId: kase.id,
        label: "Primary limitation",
        dueDate: expectedDueDateFromSource(sourceEventDate),
        basis: "test",
        sourceKind: "derived_deadline",
        ruleId: "ERA_EQA_3M_LESS_1D",
        ruleVersion: "1.0.0",
        sourceEventDate,
        sourceEventType: "dismissal",
        sourceEventId,
        calculationInputs: JSON.stringify({ effectiveDate: "2026-04-11" }),
        confirmationStatus: "unconfirmed",
        resolutionStatus: "unresolved",
      },
    });

    const denied = await confirmDeadlineAction(deadline.id);
    expect(denied).toEqual({ ok: false, error: "unauthenticated" });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("unconfirmed");

    await loginAs(user);
    const confirmed = await confirmDeadlineAction(deadline.id);
    expect(confirmed.ok).toBe(true);
    const stored = await db.deadline.findUnique({ where: { id: deadline.id } });
    expect(stored?.confirmationStatus).toBe("confirmed");
    expect(stored?.confirmedBy).toBe(user.id);
    const audit = await db.auditLog.findFirst({ where: { action: "DEADLINE_CONFIRMED" } });
    expect(audit).not.toBeNull();
  });

  it("refuses to confirm a hearing-sourced deadline", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const deadline = await db.deadline.create({
      data: {
        caseId: kase.id,
        label: "Hearing mis-tagged as limitation",
        dueDate: addDays(new Date(), 10),
        basis: "test",
        sourceKind: "derived_deadline",
        ruleId: "ERA_EQA_3M_LESS_1D",
        ruleVersion: "1.0.0",
        sourceEventDate: new Date(Date.UTC(2026, 3, 11)),
        sourceEventType: "hearing",
        confirmationStatus: "unconfirmed",
        resolutionStatus: "unresolved",
      },
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("unconfirmed");
  });

  it("does not confirm after refresh", async () => {
    const user = await seedUser();
    const kase = await db.case.create({
      data: {
        userId: user.id,
        title: "Dismissal case",
        situation: "dismissal",
        narrative: "I was dismissed on 11 April 2026 after raising a complaint about discrimination at work.",
        urgency: "low",
        readiness: 10,
      },
    });
    const deadline = await db.deadline.create({
      data: {
        caseId: kase.id,
        label: "Primary limitation",
        dueDate: addDays(new Date(), 10),
        basis: "test",
        sourceKind: "derived_deadline",
        ruleId: "ERA_EQA_3M_LESS_1D",
        ruleVersion: "1.0.0",
        sourceEventDate: new Date(Date.UTC(2026, 3, 11)),
        sourceEventType: "dismissal",
        confirmationStatus: "unconfirmed",
        resolutionStatus: "unresolved",
      },
    });
    await loginAs(user);
    await refreshCaseIntelligence(kase.id);
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("unconfirmed");
  });

  it("refuses confirmation when dismissal and incident dates conflict", async () => {
    const user = await seedUser();
    const kase = await db.case.create({
      data: {
        userId: user.id,
        title: "Conflict",
        situation: "dismissal",
        narrative: "I was dismissed on 11 April 2026. The discrimination happened on 14 March 2026.",
        urgency: "low",
        readiness: 10,
      },
    });
    const deadline = await db.deadline.create({
      data: {
        caseId: kase.id,
        label: "Primary limitation",
        dueDate: addDays(new Date(), 10),
        basis: "test",
        ruleId: "ERA_EQA_3M_LESS_1D",
        ruleVersion: "1.0.0",
        sourceEventDate: new Date(Date.UTC(2026, 3, 11)),
        sourceEventType: "dismissal",
        confirmationStatus: "unconfirmed",
        resolutionStatus: "unresolved",
      },
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("unconfirmed");
  });

  it("refuses to confirm a stored dismissal date that is not the narrative source", async () => {
    const user = await seedUser();
    const kase = await db.case.create({
      data: {
        userId: user.id,
        title: "Mismatch",
        situation: "dismissal",
        narrative: "I was dismissed on 18 April 2026 after raising a complaint about discrimination at work.",
        urgency: "low",
        readiness: 10,
      },
    });
    const deadline = await db.deadline.create({
      data: {
        caseId: kase.id,
        label: "Primary limitation",
        dueDate: addDays(new Date(), 10),
        basis: "test",
        ruleId: "ERA_EQA_3M_LESS_1D",
        ruleVersion: "1.0.0",
        sourceEventDate: new Date(Date.UTC(2026, 2, 12)),
        sourceEventType: "dismissal",
        sourceRawDate: "12 March 2026",
        clockKind: "legal_limitation",
        confirmationStatus: "unconfirmed",
        resolutionStatus: "unresolved",
      },
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("unconfirmed");
  });
});
