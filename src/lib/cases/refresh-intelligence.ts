import { db } from "@/lib/db";
import { estimateReadinessScore } from "@/lib/ai/heuristics";
import { extractDates } from "@/lib/ai/heuristics";
import { now } from "@/lib/clock";
import { computeCaseUrgencyFromDeadlines } from "@/lib/legal/deadline-state";
import { sourceEventFingerprint, utcCivilKey } from "@/lib/legal/deadline-confirmation";
import {
  isProceduralAttentionEvent,
  LIMITATION_INFERENCE_VERSION,
  PROCEDURAL_RULE_ID,
  PROCEDURAL_RULE_VERSION,
} from "@/lib/legal/event-semantics";

export type RefreshResult = { ok: true } | { ok: false; error: "not_found" | "forbidden" };

const RELATIVE_RAW = /^(today|tomorrow|yesterday|in \d+ days?|next (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))$/i;

/**
 * Recompute readiness/urgency. Caller must pass the authenticated user id;
 * User A cannot refresh User B's case.
 *
 * Refresh must not rebuild the deadline collection from limitation
 * candidates only. Unresolved procedural attention (a hearing tomorrow)
 * is preserved, and is created from the narrative if it was never persisted.
 * Relative tokens are not re-resolved onto a new civil day when an
 * unresolved procedural row of that type already exists.
 */
export async function refreshCaseIntelligenceForOwner(userId: string, caseId: string): Promise<RefreshResult> {
  const kase = await db.case.findUnique({
    where: { id: caseId },
    include: { evidence: true, events: true, issues: true, people: true, deadlines: true },
  });
  if (!kase) return { ok: false, error: "not_found" };
  if (kase.userId !== userId) return { ok: false, error: "forbidden" };

  await syncProceduralAttentionFromNarrative(kase);

  const withDeadlines = await db.case.findUnique({
    where: { id: caseId },
    include: { deadlines: true, evidence: true, events: true, issues: true, people: true },
  });
  if (!withDeadlines) return { ok: false, error: "not_found" };

  const urgency = computeCaseUrgencyFromDeadlines(withDeadlines.deadlines);

  const readiness = estimateReadinessScore({
    evidenceCount: withDeadlines.evidence.length,
    hasTimeline: withDeadlines.events.length > 0,
    hasDeadlineIdentified: withDeadlines.deadlines.length > 0,
    issueCount: withDeadlines.issues.length,
    peopleIdentified: withDeadlines.people.length,
  });

  // Acknowledgement is not resolution. Refresh must not confirm dates,
  // clear acknowledged_at, or reduce urgency because a warning was seen.
  await db.case.update({ where: { id: caseId }, data: { readiness, urgency } });
  return { ok: true };
}

async function syncProceduralAttentionFromNarrative(kase: {
  id: string;
  narrative: string;
  deadlines: Array<{
    sourceEventId: string | null;
    sourceEventType: string;
    sourceRawDate: string | null;
    dueDate: Date;
    clockKind: string;
    resolutionStatus: string;
  }>;
}): Promise<void> {
  const extracted = extractDates(kase.narrative, now());

  for (const item of extracted) {
    if (!item.date || item.parseStatus !== "valid") continue;
    if (!isProceduralAttentionEvent(item.eventType)) continue;
    const eventDate = item.date;

    const fingerprint = sourceEventFingerprint({
      eventType: item.eventType,
      sourceDate: eventDate,
      raw: item.raw,
      occurrenceIndex: item.occurrenceIndex,
    });

    const already = kase.deadlines.some(
      (d) =>
        d.clockKind === "procedural_attention" &&
        (d.sourceEventId === fingerprint ||
          (d.sourceEventType === item.eventType && utcCivilKey(d.dueDate) === utcCivilKey(eventDate)) ||
          (d.sourceRawDate != null && d.sourceRawDate.toLowerCase() === item.raw.toLowerCase()))
    );
    if (already) continue;

    const hasSameType = kase.deadlines.some(
      (d) => d.clockKind === "procedural_attention" && d.sourceEventType === item.eventType
    );
    if (hasSameType && RELATIVE_RAW.test(item.raw.trim())) {
      // Do not move "tomorrow" to a new civil day on later refreshes,
      // and do not resurrect a resolved relative hearing.
      continue;
    }

    await db.deadline.create({
      data: {
        caseId: kase.id,
        label:
          item.eventType === "hearing"
            ? "Hearing / tribunal listing (procedural — not a limitation start)"
            : `Procedural date (${item.eventType}) — not a limitation start`,
        dueDate: eventDate,
        basis:
          "This date requires attention. It is not an Employment Tribunal limitation-start date under ERA_EQA_3M_LESS_1D.",
        confidence: "low",
        source: "ai_inference",
        sourceKind: "source_event",
        ruleId: PROCEDURAL_RULE_ID,
        ruleVersion: PROCEDURAL_RULE_VERSION,
        calculationInputs: JSON.stringify({
          eventType: item.eventType,
          date: eventDate.toISOString(),
          clockKind: "procedural_attention",
        }),
        sourceEventDate: eventDate,
        sourceEventType: item.eventType,
        sourceEventId: fingerprint,
        sourceRawDate: item.raw,
        sourceReference: item.context.slice(0, 120),
        inferenceVersion: LIMITATION_INFERENCE_VERSION,
        clockKind: "procedural_attention",
        confirmationStatus: "unconfirmed",
        resolutionStatus: "unresolved",
      },
    });
    kase.deadlines.push({
      sourceEventId: fingerprint,
      sourceEventType: item.eventType,
      sourceRawDate: item.raw,
      dueDate: eventDate,
      clockKind: "procedural_attention",
      resolutionStatus: "unresolved",
    });
  }
}
