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

export type LegalEventMention = {
  start: number;
  end: number;
  eventType: LegalEventType;
};

function spansOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Source-span mentions of legal events. Overlapping matches collapse to the
 * earlier span (then RULES order) so "constructive dismissal" is one occurrence.
 */
export function scanLegalEventMentions(text: string): LegalEventMention[] {
  const mentions: LegalEventMention[] = [];
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
  const distinct: LegalEventMention[] = [];
  for (const mention of mentions) {
    if (distinct.some((prev) => spansOverlap(prev.start, prev.end, mention.start, mention.end))) continue;
    distinct.push(mention);
  }
  return distinct;
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
