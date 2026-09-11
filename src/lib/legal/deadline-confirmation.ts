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

import { createHash } from "node:crypto";
import { analyzeNarrative, type ExtractedDate } from "@/lib/ai/heuristics";
import { civilFromUtcDate, formatCivilDate } from "@/lib/legal/civil-date";
import { parseLegalDate } from "@/lib/legal/strict-date";
import { calculatePrimaryLimitationDate } from "@/lib/legal/deadlines";
import {
  LIMITATION_INFERENCE_VERSION,
  LIMITATION_RULE_ID,
  mayStartLimitationClock,
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
  | "source_identity_changed"
  | "source_no_longer_present"
  | "rule_mismatch"
  | "stored_deadline_mismatch"
  | "requires_recalculation"
  | "requires_review"
  | "ambiguous"
  | "competing_qualifying_source"
  | "unresolved_qualifying_source"
  | "date_ownership_unresolved"
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
  return formatCivilDate(civilFromUtcDate(d));
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
  sourceId?: string;
  sourceStartOffset: number;
  sourceEndOffset: number;
  eventType: string;
  civilDate: string;
  raw?: string;
  context?: string;
  inferenceVersion?: string;
};

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Stable source identity from the actual occurrence span plus raw/context
 * so a same-date replacement or sentence rewrite cannot inherit provenance.
 */
export function sourceEventFingerprint(input: SourceFingerprintInput): string {
  const payload = [
    input.sourceId ?? "narrative",
    String(input.sourceStartOffset),
    String(input.sourceEndOffset),
    input.eventType,
    input.civilDate,
    normalizeToken(input.raw ?? ""),
    normalizeToken(input.context ?? ""),
    input.inferenceVersion ?? LIMITATION_INFERENCE_VERSION,
  ].join("\u001f");
  return `span:${createHash("sha256").update(payload).digest("hex")}`;
}

export function fingerprintFromExtracted(d: ExtractedDate | null | undefined): string | null {
  if (!d?.date || !d.civilDate) return null;
  return sourceEventFingerprint({
    sourceId: d.sourceId,
    sourceStartOffset: d.sourceStartOffset,
    sourceEndOffset: d.sourceEndOffset,
    eventType: d.eventType,
    civilDate: d.civilDate,
    raw: d.raw,
    context: d.context,
  });
}

function isSpanFingerprint(storedId: string): boolean {
  return /^span:[a-f0-9]{64}$/.test(storedId);
}

export function expectedDueDateFromSource(sourceEventDate: Date): Date {
  return calculatePrimaryLimitationDate(sourceEventDate).dueDate;
}

export type QualifyingCandidate = {
  fingerprint: string;
  eventType: LegalEventType;
  date: Date;
  civilDate: string;
  raw: string;
  sourceStartOffset: number;
  sourceEndOffset: number;
  dateOwnerEventType: LegalEventType | null;
  mentionRole: ExtractedDate["mentionRole"];
};

export function qualifyingCandidatesFromDates(dates: ExtractedDate[]): QualifyingCandidate[] {
  return qualifyingSourceOccurrences(dates)
    .filter((o): o is QualifyingSourceOccurrence & { fingerprint: string; date: Date; civilDate: string } => o.resolved)
    .map((o) => ({
      fingerprint: o.fingerprint,
      eventType: o.eventType,
      date: o.date,
      civilDate: o.civilDate,
      raw: o.raw,
      sourceStartOffset: o.sourceStartOffset,
      sourceEndOffset: o.sourceEndOffset,
      dateOwnerEventType: o.dateOwnerEventType,
      mentionRole: o.mentionRole,
    }));
}

export type QualifyingSourceOccurrence = {
  fingerprint: string | null;
  eventType: LegalEventType;
  date: Date | null;
  civilDate: string | null;
  parseStatus: ExtractedDate["parseStatus"];
  raw: string;
  context: string;
  sourceStartOffset: number;
  sourceEndOffset: number;
  resolved: boolean;
  dateOwnerEventType: LegalEventType | null;
  mentionRole: ExtractedDate["mentionRole"];
};

export function isResolvedQualifyingDate(d: ExtractedDate): boolean {
  if (d.mentionRole === "reference") return false;
  if (!d.date || !d.civilDate || d.parseStatus !== "valid") return false;
  if (!mayStartLimitationClock(d.eventType)) return false;
  if (d.dateOwnerEventType && d.dateOwnerEventType !== d.eventType) return false;
  if (d.dateOwnerEventType && !mayStartLimitationClock(d.dateOwnerEventType)) return false;
  return true;
}

function unresolvedOccurrenceFingerprint(d: ExtractedDate): string {
  return sourceEventFingerprint({
    sourceId: d.sourceId,
    sourceStartOffset: d.sourceStartOffset,
    sourceEndOffset: d.sourceEndOffset,
    eventType: d.eventType,
    civilDate: "",
    raw: d.raw,
    context: d.context,
  });
}

/**
 * Every qualifying limitation-start occurrence, including those whose
 * civil date is missing, partial, ambiguous, or invalid.
 */
export function qualifyingSourceOccurrences(dates: ExtractedDate[]): QualifyingSourceOccurrence[] {
  const occurrences: QualifyingSourceOccurrence[] = [];
  const seen = new Set<string>();
  for (const d of dates) {
    if (!mayStartLimitationClock(d.eventType)) continue;
    if (d.mentionRole === "reference") continue;
    const key = `${d.sourceId}:${d.sourceStartOffset}:${d.sourceEndOffset}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const resolved = isResolvedQualifyingDate(d);
    occurrences.push({
      fingerprint: resolved ? fingerprintFromExtracted(d) : unresolvedOccurrenceFingerprint(d),
      eventType: d.eventType,
      date: d.date,
      civilDate: d.civilDate,
      parseStatus: d.parseStatus,
      raw: d.raw,
      context: d.context,
      sourceStartOffset: d.sourceStartOffset,
      sourceEndOffset: d.sourceEndOffset,
      resolved,
      dateOwnerEventType: d.dateOwnerEventType,
      mentionRole: d.mentionRole,
    });
  }
  return occurrences;
}

function dueDatesMatch(stored: Date, expected: Date): boolean {
  return utcCivilKey(stored) === utcCivilKey(expected);
}

function storedIdentityMatchesCandidate(
  storedId: string | null | undefined,
  candidate: QualifyingCandidate
): boolean {
  if (!storedId) return false;
  return storedId === candidate.fingerprint;
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
  const occurrences = qualifyingSourceOccurrences(extracted);
  const unresolved = occurrences.filter((o) => !o.resolved);
  if (unresolved.length > 0) {
    return refuse(
      "ambiguous",
      "Possible limitation date — another potentially relevant event date is unresolved. Confirmation is refused.",
      "unresolved_qualifying_source"
    );
  }

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
  if (sole.mentionRole === "reference") {
    return refuse(
      "ambiguous",
      "Possible limitation issue — relevant dismissal/resignation date is unresolved. Confirmation is refused.",
      "date_ownership_unresolved"
    );
  }
  if (
    sole.dateOwnerEventType &&
    (sole.dateOwnerEventType !== sole.eventType || !mayStartLimitationClock(sole.dateOwnerEventType))
  ) {
    return refuse(
      "ambiguous",
      "Possible limitation issue — relevant dismissal/resignation date is unresolved. Confirmation is refused.",
      "date_ownership_unresolved"
    );
  }
  const storedId = input.sourceEventId ?? null;
  if (!storedId || !isSpanFingerprint(storedId)) {
    return refuse(
      "insufficient_data",
      "Stored source identity is missing or is not a span fingerprint. Same-date provenance cannot be assumed.",
      "source_identity_changed"
    );
  }
  if (!storedIdentityMatchesCandidate(storedId, sole)) {
    return refuse(
      "insufficient_data",
      "The original source span is no longer present. A same-date replacement cannot inherit confirmation provenance.",
      "source_no_longer_present"
    );
  }

  if (sole.eventType !== eventType) {
    return refuse(
      "insufficient_data",
      "The stored source event type is not the unique current qualifying candidate.",
      "source_type_not_qualifying"
    );
  }

  if (sole.civilDate !== utcCivilKey(input.sourceEventDate) && utcCivilKey(sole.date) !== utcCivilKey(input.sourceEventDate)) {
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
