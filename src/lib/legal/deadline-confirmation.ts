/**
 * Deadline confirmation — exact source provenance AND derived due-date value.
 *
 * A stored deadline may be confirmed ONLY when the system can prove that:
 * 1. the exact stored source event still exists;
 * 2. the exact stored source event is uniquely identifiable;
 * 3. its event type is still qualifying;
 * 4. its normalized source date is unchanged;
 * 5. its deterministic rule still matches;
 * 6. the stored derived due date exactly equals the due date recomputed
 *    from that source and rule (UTC civil key);
 * 7. no competing unresolved qualifying source creates ambiguity.
 *
 * Confirmation never rewrites `dueDate`. A mismatch requires a separate
 * recalculation; this operation refuses.
 *
 * Uniqueness is NOT `event_type + date`. Distinct same-day source events
 * (two dismissals on 12 March) are two candidates.
 */

import { analyzeNarrative, type ExtractedDate } from "@/lib/ai/heuristics";
import { parseLegalDate } from "@/lib/legal/strict-date";
import { calculatePrimaryLimitationDate } from "@/lib/legal/deadlines";
import {
  LIMITATION_INFERENCE_VERSION,
  LIMITATION_RULE_ID,
  mayStartLimitationClock,
  stableSourceIdentity,
  type LegalEventType,
} from "@/lib/legal/event-semantics";

export type ConfirmationRefusalStatus = "provisional" | "ambiguous" | "insufficient_data";

export type ConfirmationRefusalReason =
  | "not_limitation_start"
  | "source_event_not_found"
  | "source_event_not_unique"
  | "source_type_not_qualifying"
  | "source_date_changed"
  | "source_date_invalid"
  | "rule_mismatch"
  | "stored_deadline_mismatch"
  | "requires_recalculation"
  | "requires_review"
  | "ambiguous"
  | "competing_qualifying_source"
  | "inference_version_mismatch"
  | "missing_fields";

export type ConfirmationDecision =
  | { allowed: true; matchedSourceId: string; reason?: "source_and_due_date_verified" }
  | {
      allowed: false;
      status: ConfirmationRefusalStatus;
      reason: string;
      code: ConfirmationRefusalReason;
    };

export function utcCivilKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function refuse(
  status: ConfirmationRefusalStatus,
  reason: string,
  code: ConfirmationRefusalReason
): ConfirmationDecision {
  return { allowed: false, status, reason, code };
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

export type SourceFingerprintInput = {
  eventType: string;
  sourceDate: Date;
  raw: string;
  occurrenceIndex: number;
  inferenceVersion?: string;
};

function normalizeRaw(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Stable source identity. Date equality is not identity.
 * Includes occurrence index + raw span so two same-day dismissals do not collapse.
 */
export function sourceEventFingerprint(input: SourceFingerprintInput): string {
  return [
    input.eventType,
    utcCivilKey(input.sourceDate),
    normalizeRaw(input.raw),
    String(input.occurrenceIndex),
    input.inferenceVersion ?? LIMITATION_INFERENCE_VERSION,
  ].join("|");
}

export function expectedDueDateFromSource(sourceEventDate: Date): Date {
  return calculatePrimaryLimitationDate(sourceEventDate).dueDate;
}

export type QualifyingCandidate = {
  fingerprint: string;
  eventType: LegalEventType;
  date: Date;
  raw: string;
  occurrenceIndex: number;
};

export function qualifyingCandidatesFromDates(dates: ExtractedDate[]): QualifyingCandidate[] {
  const candidates: QualifyingCandidate[] = [];
  const seen = new Set<string>();
  for (const d of dates) {
    if (!d.date || d.parseStatus !== "valid") continue;
    if (!mayStartLimitationClock(d.eventType)) continue;
    const fingerprint = sourceEventFingerprint({
      eventType: d.eventType,
      sourceDate: d.date,
      raw: d.raw,
      occurrenceIndex: d.occurrenceIndex,
    });
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    candidates.push({
      fingerprint,
      eventType: d.eventType,
      date: d.date,
      raw: d.raw,
      occurrenceIndex: d.occurrenceIndex,
    });
  }
  return candidates;
}

function dueDatesMatch(stored: Date, expected: Date): boolean {
  return utcCivilKey(stored) === utcCivilKey(expected);
}

function storedIdentityMatchesCandidate(
  storedId: string | null | undefined,
  candidate: QualifyingCandidate,
  storedType: string,
  storedDate: Date
): boolean {
  if (!storedId) return true;
  if (storedId === candidate.fingerprint) return true;
  const legacy = stableSourceIdentity(storedType, storedDate);
  if (storedId === legacy) {
    return candidate.eventType === storedType && utcCivilKey(candidate.date) === utcCivilKey(storedDate);
  }
  return false;
}

/**
 * Explicit confirmation is the only path to status=confirmed.
 * Provenance and the recomputed due date must both match. Any second
 * qualifying limitation-start candidate — including a distinct same-day
 * event — blocks confirmation for MVP legal safety.
 */
export function evaluateLimitationConfirmation(input: StoredDeadlineProvenance): ConfirmationDecision {
  if (input.clockKind && input.clockKind !== "legal_limitation") {
    return refuse(
      "insufficient_data",
      "Procedural attention dates cannot be confirmed as a limitation start.",
      "not_limitation_start"
    );
  }

  if (!input.dueDate || Number.isNaN(input.dueDate.getTime())) {
    return refuse("insufficient_data", "Confirmation requires a derived due date.", "missing_fields");
  }

  if (!input.ruleId || !input.sourceEventDate || Number.isNaN(input.sourceEventDate.getTime())) {
    return refuse(
      "insufficient_data",
      "Confirmation requires a rule id and a valid stored source event date.",
      input.sourceEventDate && Number.isNaN(input.sourceEventDate.getTime()) ? "source_date_invalid" : "missing_fields"
    );
  }

  if (input.ruleId !== LIMITATION_RULE_ID) {
    return refuse(
      "insufficient_data",
      "The stored rule is not ERA_EQA_3M_LESS_1D; confirmation is refused.",
      "rule_mismatch"
    );
  }

  if (input.inferenceVersion && input.inferenceVersion !== LIMITATION_INFERENCE_VERSION) {
    return refuse(
      "insufficient_data",
      "Inference version does not match the current deterministic rule set.",
      "inference_version_mismatch"
    );
  }

  const eventType = (input.sourceEventType ?? "unknown") as LegalEventType;
  if (!mayStartLimitationClock(eventType, input.ruleId)) {
    return refuse(
      "insufficient_data",
      `${eventType} is not a legally relevant start event for ${input.ruleId}. A hearing-derived row cannot be confirmed as a dismissal.`,
      "source_type_not_qualifying"
    );
  }

  if (input.sourceRawDate) {
    const parsedRaw = parseLegalDate(input.sourceRawDate);
    if (parsedRaw.parse_status !== "valid" || !parsedRaw.normalized_value) {
      return refuse(
        "insufficient_data",
        "Stored source raw date is invalid and cannot be confirmed.",
        "source_date_invalid"
      );
    }
    if (utcCivilKey(parsedRaw.normalized_value) !== utcCivilKey(input.sourceEventDate)) {
      return refuse(
        "ambiguous",
        "Stored raw date does not match the stored normalized source date.",
        "source_date_changed"
      );
    }
  }

  const extracted = input.extractedDates ?? analyzeNarrative(input.narrative).dates;
  const candidates = qualifyingCandidatesFromDates(extracted);

  if (candidates.length === 0) {
    return refuse(
      "insufficient_data",
      "The stored source event/date is not present among current qualifying candidates. Confirmation is refused.",
      "source_event_not_found"
    );
  }

  if (candidates.length > 1) {
    return refuse(
      "ambiguous",
      "Multiple qualifying source events remain. No automatic confirmation under source ambiguity.",
      "ambiguous"
    );
  }

  const sole = candidates[0]!;
  if (input.sourceEventId && !storedIdentityMatchesCandidate(input.sourceEventId, sole, eventType, input.sourceEventDate)) {
    return refuse(
      "insufficient_data",
      "Stored source_event_id does not match the unique current qualifying candidate.",
      "source_event_not_found"
    );
  }

  if (sole.eventType !== eventType) {
    return refuse(
      "insufficient_data",
      "The stored source event type is not the unique current qualifying candidate.",
      "source_type_not_qualifying"
    );
  }

  if (utcCivilKey(sole.date) !== utcCivilKey(input.sourceEventDate)) {
    return refuse(
      "insufficient_data",
      "The stored source date is not the unique current qualifying candidate. Recalculation is required.",
      "source_date_changed"
    );
  }

  const expectedDue = expectedDueDateFromSource(input.sourceEventDate);
  if (!dueDatesMatch(input.dueDate, expectedDue)) {
    return refuse(
      "provisional",
      "Stored due date does not equal the due date recomputed from the source event and ERA_EQA_3M_LESS_1D. Confirmation refuses; recalculation is required.",
      "stored_deadline_mismatch"
    );
  }

  return {
    allowed: true,
    matchedSourceId: sole.fingerprint,
    reason: "source_and_due_date_verified",
  };
}
