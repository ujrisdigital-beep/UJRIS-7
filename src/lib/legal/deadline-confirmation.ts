/**
 * Confirmation is bound to a stored source identity, not to "some
 * qualifying date exists in the narrative".
 *
 * Normalization policy: source dates are compared by UTC civil key
 * (`YYYY-MM-DD` from getUTCFullYear/Month/Date). Equivalent timezone
 * representations of the same UTC calendar day match; a different civil
 * day does not, even if wall-clock instants are close.
 */

import { analyzeNarrative, type ExtractedDate } from "@/lib/ai/heuristics";
import { parseLegalDate } from "@/lib/legal/strict-date";
import {
  LIMITATION_INFERENCE_VERSION,
  LIMITATION_RULE_ID,
  mayStartLimitationClock,
  stableSourceIdentity,
  type LegalEventType,
} from "@/lib/legal/event-semantics";

export type ConfirmationRefusalStatus = "provisional" | "ambiguous" | "insufficient_data";

export type ConfirmationDecision =
  | { allowed: true; matchedSourceId: string }
  | { allowed: false; status: ConfirmationRefusalStatus; reason: string };

export function utcCivilKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function refuse(status: ConfirmationRefusalStatus, reason: string): ConfirmationDecision {
  return { allowed: false, status, reason };
}

export interface StoredDeadlineProvenance {
  clockKind?: string | null;
  dueDate: Date | null;
  ruleId: string | null;
  sourceEventDate: Date | null;
  sourceEventType: string | null | undefined;
  sourceEventId?: string | null;
  sourceRawDate?: string | null;
  sourceReference?: string | null;
  inferenceVersion?: string | null;
  narrative: string;
  extractedDates?: ExtractedDate[];
}

/**
 * Explicit confirmation is the only path to status=confirmed.
 * The stored source date/type/rule must uniquely match a current
 * qualifying candidate. A different dismissal date in the narrative
 * must not confirm this row.
 */
export function evaluateLimitationConfirmation(input: StoredDeadlineProvenance): ConfirmationDecision {
  if (input.clockKind && input.clockKind !== "legal_limitation") {
    return refuse("insufficient_data", "Procedural attention dates cannot be confirmed as a limitation start.");
  }

  if (!input.dueDate || !input.ruleId || !input.sourceEventDate) {
    return refuse("insufficient_data", "Confirmation requires a derived due date, rule id, and stored source event date.");
  }

  if (input.ruleId !== LIMITATION_RULE_ID) {
    return refuse("insufficient_data", "The stored rule is not ERA_EQA_3M_LESS_1D; confirmation is refused.");
  }

  if (input.inferenceVersion && input.inferenceVersion !== LIMITATION_INFERENCE_VERSION) {
    return refuse("insufficient_data", "Inference version does not match the current deterministic rule set.");
  }

  const eventType = (input.sourceEventType ?? "unknown") as LegalEventType;
  if (!mayStartLimitationClock(eventType, input.ruleId)) {
    return refuse(
      "insufficient_data",
      `${eventType} is not a legally relevant start event for ${input.ruleId}. A hearing-derived row cannot be confirmed as a dismissal.`
    );
  }

  if (input.sourceRawDate) {
    const parsedRaw = parseLegalDate(input.sourceRawDate);
    if (parsedRaw.parse_status !== "valid" || !parsedRaw.normalized_value) {
      return refuse("insufficient_data", "Stored source raw date is invalid and cannot be confirmed.");
    }
    if (utcCivilKey(parsedRaw.normalized_value) !== utcCivilKey(input.sourceEventDate)) {
      return refuse("ambiguous", "Stored raw date does not match the stored normalized source date.");
    }
  }

  const extracted = input.extractedDates ?? analyzeNarrative(input.narrative).dates;
  const qualifying = extracted.filter(
    (d): d is ExtractedDate & { date: Date } =>
      d.date !== null && d.parseStatus === "valid" && mayStartLimitationClock(d.eventType)
  );

  const storedKey = utcCivilKey(input.sourceEventDate);
  const matches = qualifying.filter((d) => utcCivilKey(d.date) === storedKey && d.eventType === eventType);

  if (matches.length === 0) {
    return refuse(
      "insufficient_data",
      "The stored source event/date is not present among current qualifying candidates. Confirmation is refused."
    );
  }

  if (input.sourceEventId) {
    const expected = stableSourceIdentity(eventType, input.sourceEventDate);
    const idMatch =
      input.sourceEventId === expected ||
      matches.some((d) => stableSourceIdentity(d.eventType, d.date) === input.sourceEventId);
    if (!idMatch) {
      return refuse("insufficient_data", "Stored source_event_id does not match a current qualifying candidate.");
    }
  }

  const distinctQualifyingDates = new Set(qualifying.map((d) => utcCivilKey(d.date)));
  if (distinctQualifyingDates.size > 1) {
    return refuse(
      "ambiguous",
      "Multiple qualifying source dates remain. The stored deadline cannot be uniquely confirmed."
    );
  }

  return { allowed: true, matchedSourceId: stableSourceIdentity(eventType, input.sourceEventDate) };
}
