import type { ExtractedDate } from "@/lib/ai/heuristics";

export type DateInferenceStatus = "confirmed" | "provisional" | "ambiguous" | "insufficient_data";

export interface DateCandidate {
  date: Date | null;
  raw: string;
  context: string;
  source: string;
  valid: boolean;
  kind: ExtractedDate["kind"];
  missingYear: boolean;
  ambiguousNumeric: boolean;
}

export interface DateInferenceResult {
  status: DateInferenceStatus;
  candidateDates: DateCandidate[];
  selectedDate: Date | null;
  reason: string;
  source: string;
  requiresConfirmation: boolean;
}

function calendarKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function toCandidate(d: ExtractedDate): DateCandidate {
  return {
    date: d.date,
    raw: d.raw,
    context: d.context,
    source: d.provenance,
    valid: d.valid && d.date !== null,
    kind: d.kind,
    missingYear: d.missingYear,
    ambiguousNumeric: d.ambiguousNumeric,
  };
}

/**
 * Infer a *provisional* limitation-clock start from extracted narrative dates.
 *
 * Extraction never yields `confirmed`. Confirmation requires
 * `confirmDeadlineAction`. Hearing dates are not limitation starts.
 */
export function inferLimitationStart(dates: ExtractedDate[]): DateInferenceResult {
  const candidateDates = dates.map(toCandidate);

  if (candidateDates.some((c) => c.ambiguousNumeric)) {
    return {
      status: "ambiguous",
      candidateDates,
      selectedDate: null,
      reason: "A numeric date is ambiguous (day/month vs month/day). It is not confirmed.",
      source: "narrative_date_extraction",
      requiresConfirmation: true,
    };
  }

  if (candidateDates.some((c) => c.missingYear) && candidateDates.every((c) => !c.valid)) {
    return {
      status: "insufficient_data",
      candidateDates,
      selectedDate: null,
      reason: "A date was mentioned without a year. It is not confirmed and cannot start a limitation clock.",
      source: "narrative_date_extraction",
      requiresConfirmation: true,
    };
  }

  const limitationEligible = candidateDates.filter(
    (c): c is DateCandidate & { date: Date } => c.valid && c.date !== null && c.kind !== "hearing"
  );

  const hearingsOnly = candidateDates.filter((c) => c.kind === "hearing" && c.valid);
  if (limitationEligible.length === 0) {
    if (hearingsOnly.length > 0) {
      return {
        status: "insufficient_data",
        candidateDates,
        selectedDate: null,
        reason:
          "The only dated mention is a hearing/court date. That is not a limitation or filing deadline and is not confirmed.",
        source: "narrative_date_extraction",
        requiresConfirmation: true,
      };
    }
    return {
      status: "insufficient_data",
      candidateDates,
      selectedDate: null,
      reason: "No usable calendar date with provenance could be parsed. Nothing is confirmed.",
      source: "narrative_date_extraction",
      requiresConfirmation: true,
    };
  }

  const unique = new Map<string, DateCandidate & { date: Date }>();
  for (const c of limitationEligible) {
    const key = calendarKey(c.date);
    if (!unique.has(key)) unique.set(key, c);
  }

  const ordered = [...unique.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  const earliest = ordered[0];

  if (ordered.length === 1) {
    return {
      status: "provisional",
      candidateDates,
      selectedDate: earliest.date,
      reason:
        "A single extracted date is held as a provisional warning only. Extraction is not confirmation. An explicit confirmation action is required.",
      source: "narrative_date_extraction",
      requiresConfirmation: true,
    };
  }

  return {
    status: "ambiguous",
    candidateDates,
    selectedDate: earliest.date,
    reason:
      "Multiple material dates were found. The earliest is used only as a conservative limitation warning and is not settled fact. Confirm which date starts the clock.",
    source: "narrative_date_extraction",
    requiresConfirmation: true,
  };
}
