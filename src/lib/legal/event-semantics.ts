/**
 * Event semantics for limitation-clock inference.
 *
 * A date is not a limitation-start candidate merely because it parsed.
 * Only allow-listed event types may qualify for ERA/EqA primary limitation.
 */

export type LegalEventType =
  | "incident"
  | "dismissal"
  | "resignation"
  | "grievance"
  | "appeal"
  | "acas_contact"
  | "acas_certificate"
  | "hearing"
  | "tribunal_order"
  | "document_created"
  | "document_received"
  | "unknown";

export const LIMITATION_RULE_ID = "ERA_EQA_3M_LESS_1D";
export const LIMITATION_RULE_VERSION = "1.0.0";
export const LIMITATION_INFERENCE_VERSION = "limitation-inference/1.0.0";
export const PROCEDURAL_RULE_ID = "PROCEDURAL_ATTENTION";
export const PROCEDURAL_RULE_VERSION = "1.0.0";

export type DeadlineClockKind = "legal_limitation" | "procedural_attention";

/** Dated events that demand attention but must not start the ET limitation clock. */
export const PROCEDURAL_ATTENTION_EVENT_TYPES: ReadonlySet<LegalEventType> = new Set([
  "hearing",
  "tribunal_order",
  "grievance",
  "appeal",
]);

/** Deterministic allow-list for rule ERA_EQA_3M_LESS_1D start date. */
export const LIMITATION_START_EVENT_TYPES: ReadonlySet<LegalEventType> = new Set([
  "dismissal",
  "incident",
  "resignation",
]);

const RULES: { type: LegalEventType; pattern: RegExp }[] = [
  { type: "tribunal_order", pattern: /\btribunal order\b|\bjudgment\b|\bjudgement\b|\bet(?:1)? decision\b/i },
  { type: "hearing", pattern: /\bhearing\b|\bcourt date\b|\btribunal date\b|\blisted for\b/i },
  { type: "acas_certificate", pattern: /\bacas (?:early conciliation )?certificate\b|\bec certificate\b/i },
  { type: "acas_contact", pattern: /\bacas\b|\bearly conciliation\b/i },
  { type: "dismissal", pattern: /\bdismiss(?:ed|al)\b|\bsack(?:ed)?\b|\bfired\b|\bterminated\b|\blet go\b/i },
  { type: "resignation", pattern: /\bresign(?:ed|ation)\b|\bconstructive dismiss/i },
  { type: "grievance", pattern: /\bgrievance\b/i },
  { type: "appeal", pattern: /\bappeal(?:ed|ing)?\b/i },
  { type: "document_received", pattern: /\breceived (?:a |the )?(?:letter|email|outcome|decision)\b/i },
  { type: "document_created", pattern: /\b(?:i )?(?:wrote|sent|drafted)\b/i },
  { type: "incident", pattern: /\bdiscriminat|\bharass|\bvictimis|\bunfair(?:ly)? treat/i },
];

export type MentionRole = "occurrence" | "reference";

export type LegalEventMention = {
  start: number;
  end: number;
  eventType: LegalEventType;
  role: MentionRole;
};

function spansOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Source-span mentions of legal events. Overlapping matches collapse to the
 * earlier span (then RULES order) so "constructive dismissal" is one occurrence.
 */
type MentionSpan = { start: number; end: number; eventType: LegalEventType };

export function scanLegalEventMentions(text: string): LegalEventMention[] {
  const mentions: MentionSpan[] = [];
  for (const rule of RULES) {
    const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`;
    const pattern = new RegExp(rule.pattern.source, flags);
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      mentions.push({ start: match.index, end: match.index + match[0].length, eventType: rule.type });
      if (match[0].length === 0) pattern.lastIndex += 1;
    }
  }
  mentions.sort((a, b) => a.start - b.start || a.end - b.end);
  const distinct: MentionSpan[] = [];
  for (const mention of mentions) {
    if (distinct.some((prev) => spansOverlap(prev.start, prev.end, mention.start, mention.end))) continue;
    distinct.push(mention);
  }
  return assignMentionRoles(text, distinct);
}

/** Same-clause relation that makes a qualifying word the topic of a procedural event. */
const RELATION_SOURCE =
  "related\\s+to|relating\\s+to|in\\s+relation\\s+to|regarding|concerning|concerned|against|about|over|for|re";

const DETERMINER_SOURCE = "(?:(?:my|the|a|an)\\s+)?";

/** Procedural heads that may own a date without starting the limitation clock. */
const PROCEDURAL_HEAD_SOURCE =
  "case\\s+management\\s+hearing|disciplinary\\s+hearing|preliminary\\s+hearing|final\\s+hearing|appeal\\s+hearing|grievance\\s+meeting|tribunal\\s+hearing|hearing|appeal|grievance|meeting|review|investigation";

const TIGHT_REFERENCE_GAP = new RegExp(`^\\s+(?:${RELATION_SOURCE})\\s+${DETERMINER_SOURCE}$`, "i");

const PROCEDURAL_TOPIC_PREFIX = new RegExp(
  `(?:${PROCEDURAL_HEAD_SOURCE})\\s+(?:${RELATION_SOURCE})\\s+${DETERMINER_SOURCE}$`,
  "i"
);

const PROCEDURAL_NOUN = new RegExp(`\\b(${PROCEDURAL_HEAD_SOURCE})\\b`, "gi");

const COMPOUND_PROCEDURAL_TAIL = new RegExp(
  `^\\s+(?:(?:tribunal|disciplinary|preliminary|final|appeal|grievance|employment|internal|oral|case\\s+management)\\s+)*(?:${PROCEDURAL_HEAD_SOURCE})\\b`,
  "i"
);

function isNamedQualifyingEvent(type: LegalEventType): boolean {
  return type === "dismissal" || type === "resignation";
}

function clauseStart(text: string, index: number): number {
  for (let i = Math.min(index, text.length) - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?" || ch === "\n") return i + 1;
  }
  return 0;
}

function eventTypeFromProceduralNoun(raw: string): LegalEventType {
  const normalised = raw.toLowerCase().replace(/\s+/g, " ");
  if (normalised.includes("hearing")) return "hearing";
  if (normalised.includes("appeal")) return "appeal";
  return "grievance";
}

function precededByProceduralTopicPhrase(text: string, mentionStart: number): boolean {
  const before = text.slice(clauseStart(text, mentionStart), mentionStart);
  return PROCEDURAL_TOPIC_PREFIX.test(before);
}

/**
 * Last dated-clause procedural noun before `dateStart`. Used when no scanned
 * occurrence owns the date (e.g. "the meeting concerning my resignation").
 */
export function lastProceduralNounBefore(
  text: string,
  dateStart: number
): { start: number; end: number; eventType: LegalEventType; role: MentionRole } | null {
  const start = clauseStart(text, dateStart);
  const slice = text.slice(start, dateStart);
  const pattern = new RegExp(PROCEDURAL_NOUN.source, "gi");
  let match: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((match = pattern.exec(slice))) last = match;
  if (!last) return null;
  return {
    start: start + last.index,
    end: start + last.index + last[0].length,
    eventType: eventTypeFromProceduralNoun(last[0]),
    role: "occurrence",
  };
}

/**
 * A qualifying word used as the topic/object of a procedural event is a
 * reference, not an occurrence that can own a civil date.
 */
function assignMentionRoles(text: string, mentions: MentionSpan[]): LegalEventMention[] {
  const withRoles: LegalEventMention[] = mentions.map((m) => ({ ...m, role: "occurrence" as const }));

  for (let i = 0; i < withRoles.length; i++) {
    const mention = withRoles[i]!;
    if (!isNamedQualifyingEvent(mention.eventType)) continue;

    const next = withRoles[i + 1];
    if (next && PROCEDURAL_ATTENTION_EVENT_TYPES.has(next.eventType)) {
      const compoundGap = text.slice(mention.end, next.start);
      if (compoundGap === "" || /^\s+$/.test(compoundGap)) {
        mention.role = "reference";
        continue;
      }
    }

    if (COMPOUND_PROCEDURAL_TAIL.test(text.slice(mention.end))) {
      mention.role = "reference";
      continue;
    }

    if (precededByProceduralTopicPhrase(text, mention.start)) {
      mention.role = "reference";
      continue;
    }

    for (let j = i - 1; j >= 0; j--) {
      const previous = withRoles[j]!;
      if (!PROCEDURAL_ATTENTION_EVENT_TYPES.has(previous.eventType)) continue;
      const gap = text.slice(previous.end, mention.start);
      if (/[.!?\n]/.test(gap)) break;
      if (TIGHT_REFERENCE_GAP.test(gap)) {
        mention.role = "reference";
        break;
      }
    }
  }

  return withRoles;
}

export function classifyLegalEventType(context: string): LegalEventType {
  const text = context.trim();
  if (!text) return "unknown";
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.type;
  }
  return "unknown";
}

export function mayStartLimitationClock(eventType: LegalEventType, ruleId = "ERA_EQA_3M_LESS_1D"): boolean {
  if (ruleId !== "ERA_EQA_3M_LESS_1D") return false;
  return LIMITATION_START_EVENT_TYPES.has(eventType);
}

export function whyConsideredForLimitation(eventType: LegalEventType): string {
  if (mayStartLimitationClock(eventType)) {
    return `${eventType} is an allow-listed start event for ERA 1996 s.111 / EqA 2010 s.123 (3 months less one day).`;
  }
  return `${eventType} is not an allow-listed limitation-start event for ERA_EQA_3M_LESS_1D.`;
}

export function isProceduralAttentionEvent(eventType: LegalEventType): boolean {
  return PROCEDURAL_ATTENTION_EVENT_TYPES.has(eventType);
}

export function stableSourceIdentity(eventType: string, date: Date): string {
  const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  return `${eventType}:${key}`;
}
