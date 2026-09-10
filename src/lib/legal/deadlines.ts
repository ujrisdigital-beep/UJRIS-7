import { addDays, addMonths, differenceInCalendarDays, subDays } from "date-fns";
import { londonCivilUtcDate, now } from "@/lib/clock";
import { civilFromUtcDate, eraEqaPrimaryDueCivil, utcDateFromCivil } from "@/lib/legal/civil-date";

/**
 * Deterministic UK Employment Tribunal deadline calculators.
 *
 * These are heuristic aids based on the general statutory rules
 * (Employment Rights Act 1996 s.111, Equality Act 2010 s.123, and the
 * ACAS Early Conciliation "stop the clock" rules). They are NOT legal
 * advice, do not account for every extension/exception (e.g. discretion
 * to extend on "just and equitable" grounds, or continuing act doctrine),
 * and every date must be independently verified — ideally with ACAS or a
 * legal adviser — before a user relies on it.
 */

export interface DeadlineResult {
  label: string;
  dueDate: Date;
  basis: string;
  confidence: "low" | "medium" | "high";
  notes: string;
}

/** The general primary limitation window: 3 months less one day (civil). */
export function calculatePrimaryLimitationDate(effectiveDate: Date): DeadlineResult {
  const source = civilFromUtcDate(effectiveDate);
  const dueCivil = eraEqaPrimaryDueCivil(source);
  const dueDate = utcDateFromCivil(dueCivil);
  return {
    label: "Employment Tribunal claim deadline (primary limitation)",
    dueDate,
    basis: "ERA 1996 s.111 / EqA 2010 s.123 — general rule of 3 months less 1 day from the act/dismissal date",
    confidence: "medium",
    notes:
      "This is the general rule for most unfair dismissal and discrimination claims. Some claims (e.g. a 'continuing act' of discrimination, or redundancy pay) can have different start points or tribunal discretion to extend. Always confirm with ACAS or an adviser.",
  };
}

/**
 * ACAS Early Conciliation "stop the clock" extension.
 * Day A = date EC notification received by ACAS.
 * Day B = date the EC certificate is issued.
 * The limitation period pauses between Day A and Day B. If, after adding
 * that pause, the deadline would fall within one month of Day B, it is
 * extended to exactly one month after Day B.
 */
export function applyAcasExtension(
  primaryDeadline: Date,
  dayA: Date,
  dayB: Date
): DeadlineResult {
  const pausedDays = Math.max(0, differenceInCalendarDays(dayB, dayA));
  const extended = addDays(primaryDeadline, pausedDays);
  const oneMonthAfterB = addMonths(dayB, 1);
  const finalDeadline = extended < oneMonthAfterB ? oneMonthAfterB : extended;

  return {
    label: "Employment Tribunal claim deadline (after ACAS Early Conciliation)",
    dueDate: finalDeadline,
    basis: "ACAS Early Conciliation 'stop the clock' rule (Employment Tribunals Act 1996, s.18A)",
    confidence: "medium",
    notes:
      "The clock stops between the date you notified ACAS (Day A) and the date your EC certificate issued (Day B), and is extended to one month after Day B if that is later. Confirm your exact Day A / Day B dates from your ACAS certificate.",
  };
}

/** ACAS EC must be started before submitting most ET claims — this is the reminder deadline. */
export function acasNotificationReminder(effectiveDate: Date): DeadlineResult {
  const primary = calculatePrimaryLimitationDate(effectiveDate);
  return {
    label: "Notify ACAS (Early Conciliation) — required before most claims",
    dueDate: subDays(primary.dueDate, 14),
    basis: "Best-practice buffer before the primary limitation date so EC and drafting time remain",
    confidence: "low",
    notes:
      "You can notify ACAS at any point up to your limitation deadline, but starting early preserves time to negotiate and to prepare your claim if conciliation does not resolve things.",
  };
}

/** Whole Europe/London civil days from the injectable clock to `date`. */
export function daysUntil(date: Date): number {
  const target = londonCivilUtcDate(date);
  const today = londonCivilUtcDate(now());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export type Urgency = "low" | "standard" | "high" | "critical";

const URGENCY_RANK: Record<Urgency, number> = { low: 0, standard: 1, high: 2, critical: 3 };

export function urgencyFromDays(days: number): Urgency {
  if (days < 0) return "critical";
  if (days <= 7) return "critical";
  if (days <= 21) return "high";
  if (days <= 45) return "standard";
  return "low";
}

/** Uncertainty must not suppress a more urgent signal. */
export function higherUrgency(a: Urgency, b: Urgency): Urgency {
  return URGENCY_RANK[a] >= URGENCY_RANK[b] ? a : b;
}
