import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedCase, seedUser } from "../helpers/seed";
import { confirmDeadlineAction } from "@/lib/actions/cases";

describe("explicit deadline confirmation", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("confirms only through an auditable owner action", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
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
});
