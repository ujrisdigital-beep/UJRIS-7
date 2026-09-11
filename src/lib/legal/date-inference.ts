import type { ExtractedDate } from "@/lib/ai/heuristics";
import { qualifyingSourceOccurrences } from "@/lib/legal/deadline-confirmation";
import {
  classifyLegalEventType,
  mayStartLimitationClock,
  whyConsideredForLimitation,
  type LegalEventType,
} from "@/lib/legal/event-semantics";
import { LIMITATION_RULE_ID } from "@/lib/legal/event-semantics";

export type DateInferenceStatus = "confirmed" | "provisional" | "ambiguous" | "insufficient_data";
export type PresentationUrgency = "none" | "low" | "medium" | "high" | "critical";

export interface LimitationCandidate {
  date: Date | null;
  event_type: LegalEventType;
  event_id: string;
  source_id: string;
  source_label: string;
  confidence: "low" | "medium" | "high";
  why_considered: string;
  rule_id: string;
  raw: string;
  parse_status: string;
}

export interface DateInferenceResult {
  status: DateInferenceStatus;
  rule_id: string | null;
  candidate_dates: LimitationCandidate[];
  selected_date: Date | null;
  warning_date: Date | null;
  urgency: PresentationUrgency;
  acknowledged: boolean;
  reason: string;
  limitations: string[];
  requires_confirmation: boolean;
  /** @deprecated use candidate_dates */
  candidateDates: LimitationCandidate[];
  /** @deprecated use selected_date — extraction never confirms */
  selectedDate: Date | null;
  source: string;
  requiresConfirmation: boolean;
}

function calendarKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function toCandidate(d: ExtractedDate, index: number): LimitationCandidate {
  const event_type = d.eventType ?? classifyLegalEventType(d.context);
  const source_id = `narrative:${index}:${d.raw}`;
  return {
    date: d.date,
    event_type,
    event_id: source_id,
    source_id,
    source_label: d.context.slice(0, 120),
    confidence: d.valid ? "medium" : "low",
    why_considered: whyConsideredForLimitation(event_type),
    rule_id: LIMITATION_RULE_ID,
    raw: d.raw,
    parse_status: d.parseStatus,
  };
}

function pack(
  partial: Omit<DateInferenceResult, "candidateDates" | "selectedDate" | "requiresConfirmation" | "source">
): DateInferenceResult {
  return {
    ...partial,
    candidateDates: partial.candidate_dates,
    selectedDate: partial.selected_date,
    requiresConfirmation: partial.requires_confirmation,
    source: "narrative_date_extraction",
  };
}

/**
 * Infer a limitation-clock start. Extraction never returns `confirmed`.
 * `selected_date` is null unless confirmation conditions are fully met
 * (they are not, from narrative extraction). `warning_date` may hold the
 * earliest allow-listed date as a conservative warning only.
 */
export function inferLimitationStart(dates: ExtractedDate[]): DateInferenceResult {
  const candidate_dates = dates.map(toCandidate);
  const limitations = [
    "Narrative extraction is not legal advice.",
    "Confirmation requires an explicit auditable action on an allow-listed event type.",
  ];

  const base = {
    rule_id: LIMITATION_RULE_ID,
    candidate_dates,
    selected_date: null as Date | null,
    urgency: "none" as PresentationUrgency,
    acknowledged: false,
    requires_confirmation: true,
    limitations,
  };

  if (candidate_dates.some((c) => c.parse_status === "ambiguous")) {
    return pack({
      ...base,
      status: "ambiguous",
      warning_date: null,
      reason: "A numeric date is ambiguous (day/month vs month/day). It is not a confirmed limitation start.",
    });
  }

  if (candidate_dates.some((c) => c.parse_status === "partial") && candidate_dates.every((c) => c.date == null)) {
    return pack({
      ...base,
      status: "insufficient_data",
      warning_date: null,
      reason: "A date was mentioned without a complete year/month/day. It is not confirmed.",
    });
  }

  const occurrences = qualifyingSourceOccurrences(dates);
  const unresolvedQualifying = occurrences.filter((o) => !o.resolved);
  const resolvedQualifying = occurrences.filter((o) => o.resolved && o.date);
  if (unresolvedQualifying.length > 0 && resolvedQualifying.length > 0) {
    const earliest = [...resolvedQualifying].sort(
      (a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0)
    )[0];
    return pack({
      ...base,
      status: "ambiguous",
      warning_date: earliest?.date ?? null,
      reason:
        "Possible limitation date — another potentially relevant event date is unresolved.",
    });
  }

  if (unresolvedQualifying.length > 0) {
    return pack({
      ...base,
      status: "insufficient_data",
      warning_date: null,
      reason: "Possible limitation issue — relevant dismissal/resignation date is unresolved.",
    });
  }

  const eligible = candidate_dates.filter(
    (c): c is LimitationCandidate & { date: Date } =>
      c.date !== null && c.parse_status === "valid" && mayStartLimitationClock(c.event_type)
  );

  if (eligible.length === 0) {
    const disallowed = candidate_dates.filter((c) => c.date && c.parse_status === "valid");
    const types = [...new Set(disallowed.map((c) => c.event_type))].join(", ") || "none";
    return pack({
      ...base,
      status: "insufficient_data",
      warning_date: null,
      reason: `No allow-listed limitation-start event was found (seen: ${types}). Hearing, tribunal order, grievance, ACAS, and document dates are not claim-limitation starts.`,
    });
  }

  const unique = new Map<string, LimitationCandidate & { date: Date }>();
  for (const c of eligible) {
    const key = calendarKey(c.date);
    if (!unique.has(key)) unique.set(key, c);
  }
  const ordered = [...unique.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  const earliest = ordered[0];

  if (ordered.length === 1) {
    return pack({
      ...base,
      status: "provisional",
      warning_date: earliest.date,
      selected_date: null,
      urgency: "medium",
      reason:
        "A single allow-listed event date is a provisional warning only. It is not confirmed. selected_date remains null until an explicit confirmation action.",
    });
  }

  return pack({
    ...base,
    status: "ambiguous",
    warning_date: earliest.date,
    selected_date: null,
    urgency: "medium",
    reason:
      "Multiple allow-listed event dates were found. The earliest is warning_date only. Nothing is confirmed.",
  });
}
