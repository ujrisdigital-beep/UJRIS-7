import { daysUntil, higherUrgency, urgencyFromDays, type Urgency } from "@/lib/legal/deadlines";

export type DeadlineResolutionStatus = "unresolved" | "resolved";
export type DeadlineClockKind = "legal_limitation" | "procedural_attention";

export interface DeadlineUrgencyInput {
  dueDate: Date;
  resolutionStatus: string;
  clockKind?: string | null;
}

function maxUnresolvedUrgency(deadlines: DeadlineUrgencyInput[]): Urgency | null {
  const open = deadlines.filter((d) => d.resolutionStatus !== "resolved");
  if (open.length === 0) return null;
  return open.reduce<Urgency>((acc, d) => higherUrgency(acc, urgencyFromDays(daysUntil(d.dueDate))), "low");
}

/** Limitation-clock urgency only. Hearings do not contribute. */
export function legalClockStatus(deadlines: DeadlineUrgencyInput[]): Urgency | "none" {
  return (
    maxUnresolvedUrgency(
      deadlines.filter((d) => (d.clockKind ?? "legal_limitation") === "legal_limitation")
    ) ?? "none"
  );
}

/** Procedural attention (hearing, grievance listing, tribunal order, …). */
export function proceduralUrgency(deadlines: DeadlineUrgencyInput[]): Urgency | "none" {
  return maxUnresolvedUrgency(deadlines.filter((d) => d.clockKind === "procedural_attention")) ?? "none";
}

/**
 * Acknowledgement is not resolution. Only resolved items drop out.
 * Legal limitation clocks and procedural attention (e.g. a hearing
 * tomorrow) are aggregated: overall urgency is the highest unresolved risk.
 * Empty classes must not inject a "standard" default that overwrites the other class.
 */
export function computeCaseUrgencyFromDeadlines(deadlines: DeadlineUrgencyInput[]): Urgency {
  return maxUnresolvedUrgency(deadlines) ?? "standard";
}

export function mostImportantUnresolvedDeadline<T extends { dueDate: Date; resolutionStatus: string }>(
  deadlines: T[]
): T | null {
  const open = deadlines.filter((d) => d.resolutionStatus !== "resolved");
  if (open.length === 0) return null;
  const rank: Record<Urgency, number> = { critical: 4, high: 3, standard: 2, low: 1 };
  return [...open].sort((a, b) => {
    const ua = urgencyFromDays(daysUntil(a.dueDate));
    const ub = urgencyFromDays(daysUntil(b.dueDate));
    if (rank[ua] !== rank[ub]) return rank[ub] - rank[ua];
    return a.dueDate.getTime() - b.dueDate.getTime();
  })[0];
}
