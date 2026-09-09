import { calculatePrimaryLimitationDate } from "@/lib/legal/deadlines";
import type { DateInferenceStatus } from "@/lib/legal/date-inference";

export const LIMITATION_RULE_ID = "ERA_EQA_3M_LESS_1D";
export const LIMITATION_RULE_VERSION = "1.0.0";

export type DeadlineSourceKind = "source_event" | "derived_deadline";

export interface DerivedDeadlineInput {
  effectiveDate: Date | null;
  jurisdiction: string | null | undefined;
  inferenceStatus: DateInferenceStatus;
  sourceEventKind?: string;
}

export interface DerivedDeadlineResult {
  ok: boolean;
  reason: string;
  sourceKind: DeadlineSourceKind;
  ruleId: string;
  ruleVersion: string;
  dueDate: Date | null;
  sourceEventDate: Date | null;
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
  const calculationInputs = {
    effectiveDate: input.effectiveDate?.toISOString() ?? null,
    jurisdiction: input.jurisdiction ?? null,
    inferenceStatus: input.inferenceStatus,
    sourceEventKind: input.sourceEventKind ?? null,
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
    calculationInputs,
    calculationResult: null,
    confirmationStatus: "unconfirmed" as const,
    label: "Employment Tribunal claim deadline (primary limitation)",
    basis: "ERA 1996 s.111 / EqA 2010 s.123 — general rule of 3 months less 1 day",
    confidence: "low" as const,
  };

  if (input.sourceEventKind === "hearing") {
    return {
      ...base,
      reason: "A hearing date is not a limitation start and cannot produce a confirmed filing deadline.",
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
