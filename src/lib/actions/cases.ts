"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generateCaseAnalysis } from "@/lib/ai/gateway";
import { entitlementsFor } from "@/lib/plans";
import { appendAuditLog } from "@/lib/audit";
import { estimateReadinessScore, analyzeNarrative, detectIssues } from "@/lib/ai/heuristics";
import { urgencyFromDays, daysUntil } from "@/lib/legal/deadlines";

export interface CaseActionResult {
  ok: boolean;
  error?: string;
  caseId?: string;
}

const onboardingSchema = z.object({
  situation: z.string().min(1),
  narrative: z.string().trim().min(20, "Please add a bit more detail (at least a couple of sentences) so UJRIS can help."),
});

export async function createCaseAction(
  _prev: CaseActionResult | undefined,
  formData: FormData
): Promise<CaseActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const parsed = onboardingSchema.safeParse({
    situation: formData.get("situation"),
    narrative: formData.get("narrative"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please complete the form." };
  }

  const plan = entitlementsFor(user.plan);
  const existingCaseCount = await db.case.count({ where: { userId: user.id, status: { not: "archived" } } });
  if (existingCaseCount >= plan.maxCases) {
    return {
      ok: false,
      error: `Your ${plan.name} plan supports up to ${plan.maxCases} active case(s). Upgrade to start a new one.`,
    };
  }

  const { situation, narrative } = parsed.data;
  const analysis = await generateCaseAnalysis({ situation, narrative, evidenceCount: 0 });

  const title = deriveCaseTitle(situation);

  const created = await db.case.create({
    data: {
      userId: user.id,
      title,
      situation,
      narrative,
      readiness: analysis.readiness,
      urgency: analysis.urgency,
      stage: "understand",
      people: { create: analysis.people.map((p) => ({ name: p.name, role: p.role })) },
      events: {
        create: analysis.timelineEvents.map((e) => ({
          date: e.date,
          title: e.title,
          description: e.description,
          source: "ai_inference",
        })),
      },
      issues: {
        create: analysis.issues.map((i) => ({
          title: i.label,
          description: `Heuristically detected from keywords in your account. This is a starting point, not a legal conclusion.`,
          basis: "Detected from your case narrative",
          authority: i.authority,
          confidence: i.confidence,
        })),
      },
      deadlines: {
        create: analysis.deadlines.map((d) => ({
          label: d.label,
          dueDate: d.dueDate,
          basis: d.basis,
          confidence: d.confidence,
          source: "ai_inference",
        })),
      },
      actions: {
        create: buildInitialActions(analysis),
      },
      briefs: {
        create: [
          {
            whatHappened: analysis.ujuBrief.whatHappened,
            whatMatters: analysis.ujuBrief.whatMatters,
            supportedByEvidence: analysis.ujuBrief.supportedByEvidence,
            uncertain: analysis.ujuBrief.uncertain,
            keyDates: JSON.stringify(analysis.ujuBrief.keyDates),
            keyPeople: JSON.stringify(analysis.ujuBrief.keyPeople),
            nextBestAction: analysis.ujuBrief.nextBestAction,
            questionsOutstanding: JSON.stringify(analysis.ujuBrief.questionsOutstanding),
          },
        ],
      },
    },
  });

  await appendAuditLog({ userId: user.id, caseId: created.id, action: "CASE_CREATED", detail: `situation=${situation}` });
  revalidatePath("/home");
  redirect(`/cases/${created.id}`);
}

function buildInitialActions(analysis: Awaited<ReturnType<typeof generateCaseAnalysis>>) {
  const actions: { title: string; description: string; kind: string; priority: string }[] = [
    {
      title: analysis.nextBestAction.title,
      description: analysis.nextBestAction.description,
      kind: "general",
      priority: analysis.urgency === "critical" || analysis.urgency === "high" ? "high" : "medium",
    },
  ];
  if (analysis.deadlines.length > 0) {
    actions.push({
      title: "Acknowledge your deadline",
      description: "Review the deadline UJRIS identified and confirm you've seen it.",
      kind: "acknowledge_deadline",
      priority: "high",
    });
  }
  actions.push({
    title: "Preserve your evidence",
    description: "Upload emails, messages, letters or documents related to what happened. UJRIS hashes and timestamps everything.",
    kind: "preserve_evidence",
    priority: "medium",
  });
  return actions;
}

function deriveCaseTitle(situation: string): string {
  const labels: Record<string, string> = {
    unfair_treatment: "Unfair treatment case",
    discrimination: "Discrimination case",
    dismissal: "Dismissal case",
    grievance: "Grievance case",
    dispute: "Workplace dispute",
    allegation_received: "Response to allegation",
    hearing: "Hearing preparation",
    unsure: "New case",
  };
  return labels[situation] ?? "New case";
}

export async function completeActionItemAction(actionId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const action = await db.actionItem.findUnique({ where: { id: actionId }, include: { case: true } });
  if (!action || action.case.userId !== user.id) return;
  await db.actionItem.update({
    where: { id: actionId },
    data: { status: "done", completedAt: new Date() },
  });
  await appendAuditLog({ userId: user.id, caseId: action.caseId, action: "ACTION_COMPLETED", detail: action.title });
  revalidatePath(`/cases/${action.caseId}`);
}

export async function acknowledgeDeadlineAction(deadlineId: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const deadline = await db.deadline.findUnique({ where: { id: deadlineId }, include: { case: true } });
  if (!deadline || deadline.case.userId !== user.id) return;
  await db.deadline.update({ where: { id: deadlineId }, data: { acknowledged: true } });
  await appendAuditLog({ userId: user.id, caseId: deadline.caseId, action: "DEADLINE_ACKNOWLEDGED", detail: deadline.label });
  revalidatePath(`/cases/${deadline.caseId}`);
}

/** Recomputes readiness/urgency after evidence or facts change. Called by evidence/document actions. */
export async function refreshCaseIntelligence(caseId: string): Promise<void> {
  const kase = await db.case.findUnique({
    where: { id: caseId },
    include: { evidence: true, events: true, issues: true, people: true, deadlines: true },
  });
  if (!kase) return;

  const nextDeadline = kase.deadlines
    .filter((d) => !d.acknowledged)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];

  const urgency = nextDeadline ? urgencyFromDays(daysUntil(nextDeadline.dueDate)) : "standard";

  const readiness = estimateReadinessScore({
    evidenceCount: kase.evidence.length,
    hasTimeline: kase.events.length > 0,
    hasDeadlineIdentified: kase.deadlines.length > 0,
    issueCount: kase.issues.length,
    peopleIdentified: kase.people.length,
  });

  await db.case.update({ where: { id: caseId }, data: { readiness, urgency } });
  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/home");
}

export async function reanalyzeNarrativeAddendum(caseId: string, addendumText: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const kase = await db.case.findUnique({ where: { id: caseId } });
  if (!kase || kase.userId !== user.id) return;

  const analysis = analyzeNarrative(addendumText);
  const issues = detectIssues(addendumText);

  if (analysis.dates.length > 0) {
    await db.caseEvent.createMany({
      data: analysis.dates
        .filter((d) => d.date)
        .map((d) => ({
          caseId,
          date: d.date as Date,
          title: d.context.slice(0, 80),
          description: d.context,
          source: "ai_inference",
        })),
    });
  }
  if (analysis.people.length > 0) {
    await db.person.createMany({
      data: analysis.people.map((p) => ({ caseId, name: p.name, role: p.role })),
    });
  }
  if (issues.length > 0) {
    const existingTitles = new Set((await db.issue.findMany({ where: { caseId } })).map((i) => i.title));
    const newIssues = issues.filter((i) => !existingTitles.has(i.label));
    if (newIssues.length > 0) {
      await db.issue.createMany({
        data: newIssues.map((i) => ({
          caseId,
          title: i.label,
          description: "Heuristically detected from keywords in your update.",
          basis: "Detected from a case update",
          authority: i.authority,
          confidence: "medium",
        })),
      });
    }
  }

  await appendAuditLog({ userId: user.id, caseId, action: "NARRATIVE_ADDENDUM_ANALYZED" });
  await refreshCaseIntelligence(caseId);
}
