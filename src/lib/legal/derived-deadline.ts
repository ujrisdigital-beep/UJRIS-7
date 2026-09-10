import { calculatePrimaryLimitationDate } from "@/lib/legal/deadlines";
import type { DateInferenceStatus } from "@/lib/legal/date-inference";
import {
  LIMITATION_RULE_ID,
  LIMITATION_RULE_VERSION,
  mayStartLimitationClock,
  type LegalEventType,
} from "@/lib/legal/event-semantics";

export { LIMITATION_RULE_ID, LIMITATION_RULE_VERSION };

export type DeadlineSourceKind = "source_event" | "derived_deadline";

export interface DerivedDeadlineInput {
  effectiveDate: Date | null;
  jurisdiction: string | null | undefined;
  inferenceStatus: DateInferenceStatus;
  sourceEventKind?: string;
  sourceEventType?: LegalEventType;
}

export interface DerivedDeadlineResult {
  ok: boolean;
  reason: string;
  sourceKind: DeadlineSourceKind;
  ruleId: string;
  ruleVersion: string;
  dueDate: Date | null;
  sourceEventDate: Date | null;
  sourceEventType: LegalEventType | "unknown";
  calculationInputs: Record<string, unknown>;
  calculationResult: Record<string, unknown> | null;
  confirmationStatus: "unconfirmed";
  label: string;
  basis: string;
  confidence: "low" | "medium" | "high";
}

const SUPPORTED_JURISDICTIONS = new Set(["england-wales"]);

/**
 * Derive a filing/limitation deadline. Never marks the result confirmed.
 * Incomplete inputs fail safe (no due date).
 */
export function deriveLimitationDeadline(input: DerivedDeadlineInput): DerivedDeadlineResult {
  const eventType = (input.sourceEventType ?? input.sourceEventKind ?? "unknown") as LegalEventType | "unknown";
  const calculationInputs = {
    effectiveDate: input.effectiveDate?.toISOString() ?? null,
    jurisdiction: input.jurisdiction ?? null,
    inferenceStatus: input.inferenceStatus,
    sourceEventType: eventType,
    ruleId: LIMITATION_RULE_ID,
    ruleVersion: LIMITATION_RULE_VERSION,
  };

  const base = {
    ok: false,
    sourceKind: "derived_deadline" as const,
    ruleId: LIMITATION_RULE_ID,
    ruleVersion: LIMITATION_RULE_VERSION,
    dueDate: null,
    sourceEventDate: input.effectiveDate,
    sourceEventType: eventType,
    calculationInputs,
    calculationResult: null,
    confirmationStatus: "unconfirmed" as const,
    label: "Employment Tribunal claim deadline (primary limitation)",
    basis: "ERA 1996 s.111 / EqA 2010 s.123 — general rule of 3 months less 1 day",
    confidence: "low" as const,
  };

  if (!mayStartLimitationClock(eventType === "unknown" ? "unknown" : eventType)) {
    return {
      ...base,
      reason: `${eventType} cannot start an Employment Tribunal limitation clock under ${LIMITATION_RULE_ID}.`,
    };
  }

  if (!input.effectiveDate) {
    return { ...base, reason: "No source event date is available; the derived deadline cannot be calculated." };
  }

  if (!input.jurisdiction || !SUPPORTED_JURISDICTIONS.has(input.jurisdiction)) {
    return { ...base, reason: "Jurisdiction is missing or unsupported; the derived deadline cannot be calculated." };
  }

  if (input.inferenceStatus === "insufficient_data") {
    return { ...base, reason: "Date inference is insufficient; no derived deadline is issued." };
  }

  const limitation = calculatePrimaryLimitationDate(input.effectiveDate);
  return {
    ok: true,
    reason:
      input.inferenceStatus === "ambiguous"
        ? "Derived from the earliest provisional source date as a warning only. Not confirmed."
        : "Derived from a provisional source date. Not confirmed until an explicit confirmation action.",
    sourceKind: "derived_deadline",
    ruleId: LIMITATION_RULE_ID,
    ruleVersion: LIMITATION_RULE_VERSION,
    dueDate: limitation.dueDate,
    sourceEventDate: input.effectiveDate,
    sourceEventType: eventType,
    calculationInputs,
    calculationResult: {
      dueDate: limitation.dueDate.toISOString(),
      label: limitation.label,
    },
    confirmationStatus: "unconfirmed",
    label: limitation.label,
    basis: `${limitation.basis} [rule=${LIMITATION_RULE_ID}@${LIMITATION_RULE_VERSION}]`,
    confidence: "low",
  };
}
