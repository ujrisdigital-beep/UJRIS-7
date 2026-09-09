import { addDays } from "date-fns";

/**
 * Deterministic, explainable "signal extraction" engine.
 *
 * This is the default UJRIS AI Gateway provider. It runs with zero external
 * dependencies or API keys, is fully explainable (every output traces back
 * to a keyword/pattern match in the source text), and never fabricates
 * facts, case citations or outcomes. When a real model provider is
 * configured (see `src/lib/ai/gateway.ts`), its output is layered on top of
 * — not instead of — this grounded extraction, and is always labelled
 * AI_INFERENCE rather than fact.
 */

export type ProtectedCharacteristic =
  | "age"
  | "disability"
  | "gender_reassignment"
  | "marriage_civil_partnership"
  | "pregnancy_maternity"
  | "race"
  | "religion_belief"
  | "sex"
  | "sexual_orientation";

const CHARACTERISTIC_KEYWORDS: Record<ProtectedCharacteristic, string[]> = {
  age: ["too old", "too young", "age", "ageing", "retire", "younger", "older"],
  disability: ["disability", "disabled", "mental health", "depression", "anxiety", "autis", "adhd", "wheelchair", "reasonable adjustment", "long covid", "chronic illness"],
  gender_reassignment: ["transgender", "trans ", "gender reassignment", "transition"],
  marriage_civil_partnership: ["married", "civil partnership", "spouse", "husband", "wife"],
  pregnancy_maternity: ["pregnant", "pregnancy", "maternity", "maternity leave", "breastfeeding"],
  race: ["race", "racial", "ethnicity", "nationality", "colour", "immigrant", "accent"],
  religion_belief: ["religion", "religious", "muslim", "christian", "jewish", "hindu", "sikh", "belief", "faith", "hijab"],
  sex: ["gender", "female", "male", " sex ", "sexist", "misogyn"],
  sexual_orientation: ["gay", "lesbian", "bisexual", "sexual orientation", "lgbt"],
};

const ISSUE_KEYWORDS: { id: string; label: string; keywords: string[]; authority: string }[] = [
  {
    id: "unfair_dismissal",
    label: "Potential unfair dismissal",
    keywords: ["dismissed", "sacked", "fired", "terminated", "let go", "redundant", "redundancy"],
    authority: "Employment Rights Act 1996, Part X (unfair dismissal)",
  },
  {
    id: "discrimination",
    label: "Potential discrimination",
    keywords: ["discriminat", "unequal treatment", "treated differently", "harass", "bully"],
    authority: "Equality Act 2010, Part 5 (work)",
  },
  {
    id: "whistleblowing",
    label: "Potential whistleblowing / protected disclosure detriment",
    keywords: ["whistleblow", "raised concerns", "reported", "flagged wrongdoing", "public interest disclosure"],
    authority: "Employment Rights Act 1996, Part IVA (protected disclosures)",
  },
  {
    id: "wages",
    label: "Potential unpaid wages / deductions",
    keywords: ["unpaid wages", "not been paid", "deducted from my pay", "underpaid", "minimum wage", "holiday pay"],
    authority: "Employment Rights Act 1996, Part II (protection of wages)",
  },
  {
    id: "harassment",
    label: "Potential harassment",
    keywords: ["harass", "unwanted conduct", "intimidat", "humiliat"],
    authority: "Equality Act 2010, s.26 (harassment)",
  },
  {
    id: "victimisation",
    label: "Potential victimisation",
    keywords: ["victimis", "retaliat", "since i complained", "after i raised"],
    authority: "Equality Act 2010, s.27 (victimisation)",
  },
];

const URGENCY_KEYWORDS = ["hearing", "tribunal", "deadline", "court date", "tomorrow", "this week", "urgent"];

export interface ExtractedDate {
  raw: string;
  date: Date | null;
  context: string;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Extract calendar dates mentioned in free text, with the surrounding sentence for context. */
export function extractDates(text: string, referenceYear = new Date().getFullYear()): ExtractedDate[] {
  const results: ExtractedDate[] = [];
  const sentences = text.split(/(?<=[.!?\n])\s+/);

  const numericPattern = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;
  const wordPattern = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join("|")})(?:\\s+(\\d{4}))?\\b`,
    "gi"
  );
  const monthFirstPattern = new RegExp(`\\b(${MONTHS.join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi");

  for (const sentence of sentences) {
    let match: RegExpExecArray | null;

    numericPattern.lastIndex = 0;
    while ((match = numericPattern.exec(sentence))) {
      const [raw, d, m, y] = match;
      const year = y.length === 2 ? 2000 + Number(y) : Number(y);
      const date = safeDate(year, Number(m) - 1, Number(d));
      results.push({ raw, date, context: sentence.trim() });
    }

    wordPattern.lastIndex = 0;
    while ((match = wordPattern.exec(sentence))) {
      const [raw, d, monthName, y] = match;
      const month = MONTHS.indexOf(monthName.toLowerCase());
      const year = y ? Number(y) : referenceYear;
      const date = safeDate(year, month, Number(d));
      results.push({ raw, date, context: sentence.trim() });
    }

    monthFirstPattern.lastIndex = 0;
    while ((match = monthFirstPattern.exec(sentence))) {
      const [raw, monthName, d, y] = match;
      const month = MONTHS.indexOf(monthName.toLowerCase());
      const year = y ? Number(y) : referenceYear;
      const date = safeDate(year, month, Number(d));
      results.push({ raw, date, context: sentence.trim() });
    }
  }

  // De-duplicate by raw text, keep chronological order of first mention.
  const seen = new Set<string>();
  return results.filter((r) => {
    const key = `${r.raw}-${r.context}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeDate(year: number, month: number, day: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const d = new Date(year, month, day);
  if (Number.isNaN(d.getTime())) return null;
  // Reject implausible future dates far beyond "now" or ancient dates.
  const now = new Date();
  if (d.getFullYear() < now.getFullYear() - 6 || d.getFullYear() > now.getFullYear() + 1) return null;
  return d;
}

/** Simple heuristic entity extraction: roles mentioned near capitalised names. */
export function extractPeople(text: string): { name: string; role: string }[] {
  const rolePatterns: { role: string; pattern: RegExp }[] = [
    { role: "Manager", pattern: /\bmy manager,?\s*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/g },
    { role: "HR", pattern: /\bHR(?:\s*(?:manager|officer|representative))?,?\s*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/g },
    { role: "Employer", pattern: /\bmy employer,?\s*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/g },
    { role: "Colleague", pattern: /\bmy colleague,?\s*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/g },
    { role: "Witness", pattern: /\bwitness(?:ed by)?,?\s*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/g },
  ];
  const found: { name: string; role: string }[] = [];
  for (const { role, pattern } of rolePatterns) {
    let m: RegExpExecArray | null;
    pattern.lastIndex = 0;
    while ((m = pattern.exec(text))) {
      if (m[1]) found.push({ name: m[1], role });
    }
  }
  return found;
}

export interface CharacteristicSignal {
  characteristic: ProtectedCharacteristic;
  matchedPhrases: string[];
}

export function detectCharacteristics(text: string): CharacteristicSignal[] {
  const lower = text.toLowerCase();
  const signals: CharacteristicSignal[] = [];
  for (const [characteristic, keywords] of Object.entries(CHARACTERISTIC_KEYWORDS) as [
    ProtectedCharacteristic,
    string[]
  ][]) {
    const matched = keywords.filter((k) => lower.includes(k));
    if (matched.length > 0) signals.push({ characteristic, matchedPhrases: matched });
  }
  return signals;
}

export interface IssueSignal {
  id: string;
  label: string;
  authority: string;
  matchedPhrases: string[];
}

export function detectIssues(text: string): IssueSignal[] {
  const lower = text.toLowerCase();
  const out: IssueSignal[] = [];
  for (const issue of ISSUE_KEYWORDS) {
    const matched = issue.keywords.filter((k) => lower.includes(k));
    if (matched.length > 0) {
      out.push({ id: issue.id, label: issue.label, authority: issue.authority, matchedPhrases: matched });
    }
  }
  return out;
}

export function detectUrgencySignal(text: string): boolean {
  const lower = text.toLowerCase();
  return URGENCY_KEYWORDS.some((k) => lower.includes(k));
}

export interface NarrativeAnalysis {
  dates: ExtractedDate[];
  people: { name: string; role: string }[];
  characteristics: CharacteristicSignal[];
  issues: IssueSignal[];
  hasUrgencySignal: boolean;
  wordCount: number;
}

export function analyzeNarrative(text: string): NarrativeAnalysis {
  return {
    dates: extractDates(text),
    people: extractPeople(text),
    characteristics: detectCharacteristics(text),
    issues: detectIssues(text),
    hasUrgencySignal: detectUrgencySignal(text),
    wordCount: text.trim().split(/\s+/).filter(Boolean).length,
  };
}

/** @deprecated Prefer inferLimitationStart — picking the latest date suppresses urgency. */
export function suggestEffectiveDate(dates: ExtractedDate[]): Date | null {
  const valid = dates.map((d) => d.date).filter((d): d is Date => d !== null);
  if (valid.length === 0) return null;
  return valid.reduce((earliest, d) => (d < earliest ? d : earliest), valid[0]);
}

export function estimateReadinessScore(input: {
  evidenceCount: number;
  hasTimeline: boolean;
  hasDeadlineIdentified: boolean;
  issueCount: number;
  peopleIdentified: number;
}): number {
  let score = 10; // baseline for having created a case
  score += Math.min(30, input.evidenceCount * 8);
  score += input.hasTimeline ? 15 : 0;
  score += input.hasDeadlineIdentified ? 15 : 0;
  score += Math.min(15, input.issueCount * 5);
  score += Math.min(15, input.peopleIdentified * 5);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function nearFutureReminder(days: number) {
  return addDays(new Date(), days);
}
