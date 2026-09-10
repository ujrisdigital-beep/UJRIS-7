import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { resetTestDatabase } from "../helpers/db";
import { loginAs, seedUser } from "../helpers/seed";
import { confirmDeadlineAction } from "@/lib/actions/cases";
import { expectedDueDateFromSource, fingerprintFromExtracted, utcCivilKey } from "@/lib/legal/deadline-confirmation";
import { extractDates } from "@/lib/ai/heuristics";

const MAR_12 = new Date(Date.UTC(2026, 2, 12));
const MAR_18 = new Date(Date.UTC(2026, 2, 18));
const DUE_FROM_MAR_12 = expectedDueDateFromSource(MAR_12);

async function seedLimitationDeadline(input: {
  userId: string;
  narrative: string;
  sourceEventDate?: Date;
  sourceEventType?: string;
  sourceRawDate?: string | null;
  sourceEventId?: string | null;
  dueDate?: Date;
  ruleId?: string;
  clockKind?: string;
  inferenceVersion?: string;
}) {
  const kase = await db.case.create({
    data: {
      userId: input.userId,
      title: "Limitation confirmation",
      situation: "dismissal",
      narrative: input.narrative,
      urgency: "low",
      readiness: 10,
    },
  });
  const sourceEventDate = input.sourceEventDate ?? MAR_12;
  const extracted = extractDates(input.narrative);
  const hit =
    extracted.find((d) => d.eventType === (input.sourceEventType ?? "dismissal") && d.date) ?? extracted[0];
  const autoFingerprint =
    input.sourceEventId !== undefined ? input.sourceEventId : fingerprintFromExtracted(hit);
  const deadline = await db.deadline.create({
    data: {
      caseId: kase.id,
      label: "Primary limitation",
      dueDate: input.dueDate ?? expectedDueDateFromSource(sourceEventDate),
      basis: "ERA_EQA_3M_LESS_1D",
      sourceKind: "derived_deadline",
      ruleId: input.ruleId ?? "ERA_EQA_3M_LESS_1D",
      ruleVersion: "1.0.0",
      sourceEventDate,
      sourceEventType: input.sourceEventType ?? "dismissal",
      sourceEventId: autoFingerprint ?? undefined,
      sourceRawDate: input.sourceRawDate === undefined ? "12 March 2026" : input.sourceRawDate,
      clockKind: input.clockKind ?? "legal_limitation",
      inferenceVersion: input.inferenceVersion ?? "limitation-inference/1.0.0",
      confirmationStatus: "unconfirmed",
      resolutionStatus: "unresolved",
    },
  });
  return { kase, deadline };
}

describe("confirmDeadlineAction invariant (provenance + recomputed due date)", () => {
  beforeEach(async () => {
    await resetTestDatabase();
  });

  it("A: correct source + correct recomputed due date may succeed", async () => {
    const user = await seedUser();
    const { deadline } = await seedLimitationDeadline({
      userId: user.id,
      narrative: "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.",
    });
    await loginAs(user);
    const result = await confirmDeadlineAction(deadline.id);
    expect(result).toEqual({ ok: true });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("confirmed");
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.dueDate.getTime()).toBe(DUE_FROM_MAR_12.getTime());
  });

  it("B: correct source + incorrect stored due date is refused", async () => {
    const user = await seedUser();
    const { deadline } = await seedLimitationDeadline({
      userId: user.id,
      narrative: "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.",
      dueDate: addDays(DUE_FROM_MAR_12, 14),
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("unconfirmed");
  });

  it("C: correct source + due date off by one day is refused", async () => {
    const user = await seedUser();
    const offByOne = new Date(DUE_FROM_MAR_12);
    offByOne.setUTCDate(offByOne.getUTCDate() + 1);
    expect(utcCivilKey(offByOne)).not.toBe(utcCivilKey(DUE_FROM_MAR_12));
    const { deadline } = await seedLimitationDeadline({
      userId: user.id,
      narrative: "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.",
      dueDate: offByOne,
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("unconfirmed");
  });

  it("D: correct source + wrong rule is refused", async () => {
    const user = await seedUser();
    const { deadline } = await seedLimitationDeadline({
      userId: user.id,
      narrative: "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.",
      ruleId: "SOME_OTHER_RULE",
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("E: stored source no longer exists is refused", async () => {
    const user = await seedUser();
    const { deadline } = await seedLimitationDeadline({
      userId: user.id,
      narrative: "They treated me unfairly at work last year and I have no exact dates recorded.",
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("F: same event type/date but two distinct source events is refused", async () => {
    const user = await seedUser();
    const { deadline } = await seedLimitationDeadline({
      userId: user.id,
      narrative:
        "I was dismissed on 12 March 2026 after the morning meeting. They dismissed me on 12 March 2026 after the afternoon meeting.",
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("unconfirmed");
  });

  it("G: competing qualifying events on 12 March and 18 March are refused", async () => {
    const user = await seedUser();
    const { deadline } = await seedLimitationDeadline({
      userId: user.id,
      narrative: "I was dismissed on 12 March 2026. They dismissed me again on 18 March 2026.",
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("H: hearing-derived record with hearing + dismissal on 12 March is refused", async () => {
    const user = await seedUser();
    const { deadline } = await seedLimitationDeadline({
      userId: user.id,
      narrative: "My hearing is on 12 March 2026. I was dismissed on 12 March 2026.",
      sourceEventType: "hearing",
      sourceRawDate: "12 March 2026",
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("I: invalid source date is refused", async () => {
    const user = await seedUser();
    const { deadline } = await seedLimitationDeadline({
      userId: user.id,
      narrative: "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.",
      sourceRawDate: "31 February 2026",
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("J: source date changed after the provisional deadline was created is refused", async () => {
    const user = await seedUser();
    const { deadline } = await seedLimitationDeadline({
      userId: user.id,
      narrative: "I was dismissed on 18 March 2026 after raising a complaint about discrimination at work.",
      sourceEventDate: MAR_12,
      sourceRawDate: "12 March 2026",
      dueDate: DUE_FROM_MAR_12,
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("K: stored due date tampered in the database is refused", async () => {
    const user = await seedUser();
    const { deadline } = await seedLimitationDeadline({
      userId: user.id,
      narrative: "I was dismissed on 12 March 2026 after raising a complaint about discrimination at work.",
    });
    await db.deadline.update({
      where: { id: deadline.id },
      data: { dueDate: expectedDueDateFromSource(MAR_18) },
    });
    await loginAs(user);
    expect(await confirmDeadlineAction(deadline.id)).toMatchObject({ ok: false, error: "invalid" });
    expect((await db.deadline.findUnique({ where: { id: deadline.id } }))?.confirmationStatus).toBe("unconfirmed");
  });
});
