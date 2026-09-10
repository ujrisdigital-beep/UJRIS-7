import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedCase, seedUser } from "../helpers/seed";
import {
  acknowledgeDeadlineAction,
  refreshCaseIntelligence,
  resolveDeadlineAction,
} from "@/lib/actions/cases";
import { refreshCaseIntelligenceForOwner } from "@/lib/cases/refresh-intelligence";
import { issueSession, revokeSession, SESSION_COOKIE } from "@/lib/auth";
import { setTestCookie } from "../helpers/next-runtime";

async function urgentDeadline(caseId: string) {
  return db.deadline.create({
    data: {
      caseId,
      label: "Urgent limitation",
      dueDate: addDays(new Date(), 3),
      basis: "test",
      sourceKind: "derived_deadline",
      ruleId: "ERA_EQA_3M_LESS_1D",
      ruleVersion: "1.0.0",
        sourceEventDate: addDays(new Date(), -80),
        sourceEventType: "dismissal",
        confirmationStatus: "unconfirmed",
      resolutionStatus: "unresolved",
    },
  });
}

describe("urgent deadline acknowledgement", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("keeps urgency through acknowledgement, refresh, recomputation, and a new session", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const deadline = await urgentDeadline(kase.id);

    await loginAs(user);
    await refreshCaseIntelligenceForOwner(user.id, kase.id);
    const before = await db.case.findUnique({ where: { id: kase.id } });
    expect(before?.urgency).toBe("critical");

    const ack = await acknowledgeDeadlineAction(deadline.id);
    expect(ack.ok).toBe(true);
    const afterAck = await db.deadline.findUnique({ where: { id: deadline.id } });
    expect(afterAck?.acknowledged).toBe(true);
    expect(afterAck?.resolutionStatus).toBe("unresolved");
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");

    await refreshCaseIntelligence(kase.id);
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");

    await refreshCaseIntelligenceForOwner(user.id, kase.id);
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");

    const next = await issueSession({ userId: user.id, email: user.email, name: user.name, role: user.role });
    setTestCookie(SESSION_COOKIE, next.token);
    await refreshCaseIntelligence(kase.id);
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");
  });

  it("rejects unauthorised downgrades and client-supplied status", async () => {
    const owner = await seedUser("owner-urg@example.com");
    const other = await seedUser("other-urg@example.com");
    const kase = await seedCase(owner.id);
    const deadline = await urgentDeadline(kase.id);
    await refreshCaseIntelligenceForOwner(owner.id, kase.id);

    await loginAs(other);
    expect(await acknowledgeDeadlineAction(deadline.id)).toEqual({ ok: false, error: "forbidden" });
    expect(await resolveDeadlineAction(deadline.id, "please drop this")).toEqual({ ok: false, error: "forbidden" });
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");

    await loginAs(owner);
    expect(
      await acknowledgeDeadlineAction(deadline.id, { urgency: "low", resolutionStatus: "resolved" })
    ).toEqual({ ok: false, error: "invalid" });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.resolutionStatus).toBe("unresolved");
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");
  });

  it("allows authorised acknowledgement without resolution and resolution with reason plus audit", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const deadline = await urgentDeadline(kase.id);
    await loginAs(user);
    await refreshCaseIntelligenceForOwner(user.id, kase.id);

    expect(await acknowledgeDeadlineAction(deadline.id)).toEqual({ ok: true });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.resolutionStatus).toBe("unresolved");
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");

    expect(await resolveDeadlineAction(deadline.id, "short")).toEqual({ ok: false, error: "invalid" });
    expect(await resolveDeadlineAction(deadline.id, "Claim filed at the tribunal")).toEqual({ ok: true });
    const resolved = await db.deadline.findUnique({ where: { id: deadline.id } });
    expect(resolved?.resolutionStatus).toBe("resolved");
    expect(resolved?.resolutionReason).toBe("Claim filed at the tribunal");
    expect(await db.auditLog.findFirst({ where: { action: "DEADLINE_RESOLVED" } })).not.toBeNull();
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("standard");
  });

  it("preserves urgency when acknowledgement and refresh race", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const deadline = await urgentDeadline(kase.id);
    await loginAs(user);
    await refreshCaseIntelligenceForOwner(user.id, kase.id);

    await Promise.all([acknowledgeDeadlineAction(deadline.id), refreshCaseIntelligence(kase.id)]);
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.acknowledged).toBe(true);
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");
  });

  it("revoked session cannot acknowledge", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const deadline = await urgentDeadline(kase.id);
    const { token, jti } = await issueSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
    setTestCookie(SESSION_COOKIE, token);
    await revokeSession(jti);
    expect(await acknowledgeDeadlineAction(deadline.id)).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("keeps urgency when an unresolved urgent deadline is acknowledged and refreshed", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const deadline = await urgentDeadline(kase.id);
    await loginAs(user);
    await refreshCaseIntelligence(kase.id);
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");

    await acknowledgeDeadlineAction(deadline.id);
    await refreshCaseIntelligence(kase.id);
    const after = await db.deadline.findUnique({ where: { id: deadline.id } });
    expect(after?.acknowledged).toBe(true);
    expect(after?.acknowledgedAt).not.toBeNull();
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");
  });

  it("may drop urgency after the deadline is resolved", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    const deadline = await urgentDeadline(kase.id);
    await loginAs(user);
    await refreshCaseIntelligence(kase.id);
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");
    await resolveDeadlineAction(deadline.id, "Claim filed at the tribunal");
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("standard");
  });

  it("does not change a confirmed source date when the warning is acknowledged", async () => {
    const user = await seedUser();
    const kase = await db.case.create({
      data: {
        userId: user.id,
        title: "Confirmed",
        situation: "dismissal",
        narrative: "I was dismissed on 11 April 2026 after raising a complaint about discrimination at work.",
        urgency: "low",
        readiness: 10,
      },
    });
    const source = new Date(Date.UTC(2026, 3, 11));
    const due = addDays(new Date(), 10);
    const deadline = await db.deadline.create({
      data: {
        caseId: kase.id,
        label: "Primary limitation",
        dueDate: due,
        basis: "test",
        ruleId: "ERA_EQA_3M_LESS_1D",
        ruleVersion: "1.0.0",
        sourceEventDate: source,
        sourceEventType: "dismissal",
        confirmationStatus: "confirmed",
        confirmedAt: new Date(),
        resolutionStatus: "unresolved",
      },
    });
    await loginAs(user);
    await acknowledgeDeadlineAction(deadline.id);
    await refreshCaseIntelligence(kase.id);
    const stored = await db.deadline.findUnique({ where: { id: deadline.id } });
    expect(stored?.sourceEventDate?.toISOString()).toBe(source.toISOString());
    expect(stored?.dueDate.toISOString()).toBe(due.toISOString());
    expect(stored?.confirmationStatus).toBe("confirmed");
  });

  it("can increase urgency when a new earlier unresolved deadline appears", async () => {
    const user = await seedUser();
    const kase = await seedCase(user.id);
    await db.deadline.create({
      data: {
        caseId: kase.id,
        label: "Distant limitation",
        dueDate: addDays(new Date(), 80),
        basis: "test",
        ruleId: "ERA_EQA_3M_LESS_1D",
        sourceEventType: "dismissal",
        confirmationStatus: "unconfirmed",
        resolutionStatus: "unresolved",
      },
    });
    await loginAs(user);
    await refreshCaseIntelligence(kase.id);
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("low");

    await db.deadline.create({
      data: {
        caseId: kase.id,
        label: "Earlier limitation",
        dueDate: addDays(new Date(), 3),
        basis: "test",
        ruleId: "ERA_EQA_3M_LESS_1D",
        sourceEventType: "dismissal",
        confirmationStatus: "unconfirmed",
        resolutionStatus: "unresolved",
      },
    });
    await refreshCaseIntelligence(kase.id);
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");
  });

  it("keeps ambiguous urgency after acknowledgement", async () => {
    const user = await seedUser();
    const kase = await db.case.create({
      data: {
        userId: user.id,
        title: "Ambiguous",
        situation: "dismissal",
        narrative:
          "I was dismissed on 11 April 2026. The discrimination happened on 14 March 2026. This is urgent.",
        urgency: "low",
        readiness: 10,
      },
    });
    const deadline = await db.deadline.create({
      data: {
        caseId: kase.id,
        label: "Warning limitation",
        dueDate: addDays(new Date(), 3),
        basis: "ambiguous warning",
        ruleId: "ERA_EQA_3M_LESS_1D",
        sourceEventDate: new Date(Date.UTC(2026, 2, 14)),
        sourceEventType: "incident",
        confirmationStatus: "unconfirmed",
        resolutionStatus: "unresolved",
      },
    });
    await loginAs(user);
    await refreshCaseIntelligence(kase.id);
    await acknowledgeDeadlineAction(deadline.id);
    await refreshCaseIntelligence(kase.id);
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("unconfirmed");
    expect((await db.case.findUnique({ where: { id: kase.id } }))?.urgency).toBe("critical");
  });
});
