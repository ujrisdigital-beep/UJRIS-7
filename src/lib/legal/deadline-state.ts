import { daysUntil, higherUrgency, urgencyFromDays, type Urgency } from "@/lib/legal/deadlines";

export type DeadlineResolutionStatus = "unresolved" | "resolved";

export interface DeadlineUrgencyInput {
  dueDate: Date;
  resolutionStatus: string;
}

/**
 * Acknowledgement is not resolution. Only resolved deadlines drop out of
 * the urgency calculation.
 */
export function computeCaseUrgencyFromDeadlines(deadlines: DeadlineUrgencyInput[]): Urgency {
  const open = deadlines.filter((d) => d.resolutionStatus !== "resolved");
  if (open.length === 0) return "standard";
  return open.reduce<Urgency>((acc, d) => higherUrgency(acc, urgencyFromDays(daysUntil(d.dueDate))), "low");
}
