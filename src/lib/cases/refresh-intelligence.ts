import { db } from "@/lib/db";
import { estimateReadinessScore } from "@/lib/ai/heuristics";
import { urgencyFromDays, daysUntil } from "@/lib/legal/deadlines";

export type RefreshResult = { ok: true } | { ok: false; error: "not_found" | "forbidden" };

/**
 * Recompute readiness/urgency. Caller must pass the authenticated user id;
 * User A cannot refresh User B's case.
 */
export async function refreshCaseIntelligenceForOwner(userId: string, caseId: string): Promise<RefreshResult> {
  const kase = await db.case.findUnique({
    where: { id: caseId },
    include: { evidence: true, events: true, issues: true, people: true, deadlines: true },
  });
  if (!kase) return { ok: false, error: "not_found" };
  if (kase.userId !== userId) return { ok: false, error: "forbidden" };

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
  return { ok: true };
}
