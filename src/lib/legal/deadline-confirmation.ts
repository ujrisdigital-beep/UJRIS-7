import { analyzeNarrative, type ExtractedDate } from "@/lib/ai/heuristics";
import { inferLimitationStart } from "@/lib/legal/date-inference";
import {
  LIMITATION_RULE_ID,
  mayStartLimitationClock,
  type LegalEventType,
} from "@/lib/legal/event-semantics";

export type ConfirmationRefusalStatus = "provisional" | "ambiguous" | "insufficient_data";

export type ConfirmationDecision =
  | { allowed: true }
  | { allowed: false; status: ConfirmationRefusalStatus; reason: string };

function calendarKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Explicit confirmation is the only path to status=confirmed.
 * Extraction, refresh, and acknowledgement must never satisfy this.
 */
export function evaluateLimitationConfirmation(input: {
  dueDate: Date | null;
  ruleId: string | null;
  sourceEventDate: Date | null;
  sourceEventType: string | null | undefined;
  narrative: string;
  otherUnresolvedSourceDates?: Date[];
  extractedDates?: ExtractedDate[];
}): ConfirmationDecision {
  if (!input.dueDate || !input.ruleId || !input.sourceEventDate) {
    return {
      allowed: false,
      status: "insufficient_data",
      reason: "Confirmation requires a derived due date, rule id, and source event date.",
    };
  }

  if (input.ruleId !== LIMITATION_RULE_ID) {
    return {
      allowed: false,
      status: "insufficient_data",
      reason: "Confirmation is only defined for ERA_EQA_3M_LESS_1D in this release.",
    };
  }

  const eventType = (input.sourceEventType ?? "unknown") as LegalEventType;
  if (!mayStartLimitationClock(eventType, input.ruleId)) {
    return {
      allowed: false,
      status: "insufficient_data",
      reason: `${eventType} is not a legally relevant start event for ${input.ruleId}.`,
    };
  }

  const extracted = input.extractedDates ?? analyzeNarrative(input.narrative).dates;
  const inference = inferLimitationStart(extracted);

  if (inference.status === "insufficient_data") {
    return {
      allowed: false,
      status: "insufficient_data",
      reason: inference.reason,
    };
  }

  if (inference.status === "ambiguous" || inference.status === "confirmed") {
    return {
      allowed: false,
      status: inference.status === "confirmed" ? "ambiguous" : "ambiguous",
      reason:
        inference.status === "confirmed"
          ? "Extraction must not produce confirmed dates; confirmation is refused."
          : "Unresolved conflicting candidates remain. Confirmation is refused.",
    };
  }

  const earlier = (input.otherUnresolvedSourceDates ?? []).filter(
    (d) => calendarKey(d) < calendarKey(input.sourceEventDate as Date)
  );
  if (earlier.length > 0) {
    return {
      allowed: false,
      status: "ambiguous",
      reason: "A materially earlier unresolved candidate exists. Confirmation is refused.",
    };
  }

  if (inference.status !== "provisional") {
    return {
      allowed: false,
      status: "provisional",
      reason: "The deterministic rule set does not identify this date as suitable for confirmation.",
    };
  }

  return { allowed: true };
}
