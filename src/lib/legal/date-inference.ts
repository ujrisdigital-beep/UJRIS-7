import type { ExtractedDate } from "@/lib/ai/heuristics";

export type DateInferenceStatus = "confirmed" | "provisional" | "ambiguous" | "insufficient_data";

export interface DateCandidate {
  date: Date | null;
  raw: string;
  context: string;
  source: string;
  valid: boolean;
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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Infer a limitation-clock start date from extracted narrative dates.
 *
 * Conservative rule: when multiple distinct calendar days are present, the
 * result is `ambiguous`. The earliest valid date is returned as
 * `selectedDate` only as a WARNING (shorter remaining limitation window)
 * and must be confirmed. A later date is never presented as settled fact.
 */
export function inferLimitationStart(dates: ExtractedDate[]): DateInferenceResult {
  const candidateDates: DateCandidate[] = dates.map((d) => ({
    date: d.date,
    raw: d.raw,
    context: d.context,
    source: "narrative_date_extraction",
    valid: d.date instanceof Date && !Number.isNaN(d.date.getTime()),
  }));

  const valid = candidateDates.filter((c): c is DateCandidate & { date: Date } => c.valid && c.date !== null);

  if (valid.length === 0) {
    return {
      status: "insufficient_data",
      candidateDates,
      selectedDate: null,
      reason: "No usable calendar date could be parsed from the account.",
      source: "narrative_date_extraction",
      requiresConfirmation: true,
    };
  }

  const unique = new Map<string, DateCandidate & { date: Date }>();
  for (const c of valid) {
    const key = calendarKey(c.date);
    if (!unique.has(key)) unique.set(key, c);
  }

  const ordered = [...unique.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  const earliest = ordered[0];

  if (ordered.length === 1) {
    return {
      status: "confirmed",
      candidateDates,
      selectedDate: earliest.date,
      reason: "A single usable date was identified in the account.",
      source: "narrative_date_extraction",
      requiresConfirmation: false,
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
