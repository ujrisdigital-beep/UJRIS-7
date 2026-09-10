import {
  analyzeNarrative,
  detectIssues,
  estimateReadinessScore,
} from "@/lib/ai/heuristics";
import {
  urgencyFromDays,
  daysUntil,
  higherUrgency,
  type Urgency,
} from "@/lib/legal/deadlines";
import { inferLimitationStart } from "@/lib/legal/date-inference";
import { deriveLimitationDeadline } from "@/lib/legal/derived-deadline";
import { SITUATION_LABELS } from "@/lib/ai/situations";

/**
 * UJRIS AI Gateway.
 *
 * The application never calls a model provider directly — everything routes
 * through here, so the provider can be swapped (or several routed by task
 * type) without touching product/business logic. Today the default and
 * always-available provider is the deterministic heuristic engine
 * (`src/lib/ai/heuristics.ts`), which requires no API key, is fully
 * explainable, and never fabricates facts or citations.
 *
 * If `OPENAI_API_KEY` is set, the gateway additionally asks a real model to
 * *phrase* a plain-language summary of the already-extracted, grounded
 * signals (it is never asked to invent new facts). If that call fails or no
 * key is configured, the gateway falls back to a template-based summary —
 * the product remains fully functional with zero external dependencies.
 */

export type TruthLayer = "user_assertion" | "document_evidence" | "external_authority" | "ai_inference" | "human_verified";

export interface CaseSignal {
  label: string;
  detail: string;
  layer: TruthLayer;
}

export interface CaseAnalysisResult {
  issueSummary: string;
  issues: { id: string; label: string; authority: string; confidence: "low" | "medium" | "high" }[];
  timelineEvents: { date: Date; title: string; description: string }[];
  people: { name: string; role: string }[];
  deadlines: {
    label: string;
    dueDate: Date;
    basis: string;
    confidence: "low" | "medium" | "high";
    sourceKind: "source_event" | "derived_deadline";
    ruleId: string;
    ruleVersion: string;
    calculationInputs: string;
    sourceEventDate: Date | null;
    sourceEventType: string;
    confirmationStatus: "unconfirmed";
  }[];
  urgency: Urgency;
  dateInference: import("@/lib/legal/date-inference").DateInferenceResult;
  readiness: number;
  nextBestAction: { title: string; description: string };
  ujuBrief: {
    whatHappened: string;
    whatMatters: string;
    supportedByEvidence: string;
    uncertain: string;
    keyDates: string[];
    keyPeople: string[];
    nextBestAction: string;
    questionsOutstanding: string[];
  };
  provider: "heuristic" | "heuristic+llm";
}

export async function generateCaseAnalysis(input: {
  situation: string;
  narrative: string;
  evidenceCount: number;
}): Promise<CaseAnalysisResult> {
  const analysis = analyzeNarrative(input.narrative);
  const issues = detectIssues(input.narrative);
  const dateInference = inferLimitationStart(analysis.dates);
  const situationLabel = SITUATION_LABELS[input.situation] ?? "your situation";
  const warningDate = dateInference.warning_date;
  const startType = dateInference.candidate_dates.find((c) => c.date && c.date.getTime() === warningDate?.getTime())?.event_type;

  const derived = deriveLimitationDeadline({
    effectiveDate: warningDate,
    jurisdiction: "england-wales",
    inferenceStatus: dateInference.status,
    sourceEventType: startType,
    sourceEventKind: startType,
  });

  const deadlines: CaseAnalysisResult["deadlines"] = [];
  if (derived.ok && derived.dueDate) {
    const warning = dateInference.status === "ambiguous" || dateInference.requiresConfirmation
      ? " [WARNING: unconfirmed derived deadline — confirm before relying on this date.]"
      : "";
    deadlines.push({
      label: derived.label,
      dueDate: derived.dueDate,
      basis: derived.basis + warning,
      confidence: "low",
      sourceKind: derived.sourceKind,
      ruleId: derived.ruleId,
      ruleVersion: derived.ruleVersion,
      calculationInputs: JSON.stringify(derived.calculationInputs),
      sourceEventDate: derived.sourceEventDate,
      sourceEventType: derived.sourceEventType,
      confirmationStatus: "unconfirmed",
    });
  }

  const keywordUrgency: Urgency = analysis.hasUrgencySignal ? "high" : "low";
  const deadlineUrgency: Urgency = deadlines[0] ? urgencyFromDays(daysUntil(deadlines[0].dueDate)) : "low";
  const urgency = higherUrgency(keywordUrgency, deadlineUrgency);

  const timelineEvents = analysis.dates
    .filter((d) => d.date !== null)
    .map((d) => ({
      date: d.date as Date,
      title: summarizeSentence(d.context),
      description: d.context,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const readiness = estimateReadinessScore({
    evidenceCount: input.evidenceCount,
    hasTimeline: timelineEvents.length > 0,
    hasDeadlineIdentified: deadlines.length > 0,
    issueCount: issues.length,
    peopleIdentified: analysis.people.length,
  });

  const nextBestAction = deriveNextBestAction({
    evidenceCount: input.evidenceCount,
    hasDeadline: deadlines.length > 0,
    issueCount: issues.length,
    urgency,
  });

  const issueSummary =
    issues.length > 0
      ? `Based on what you've described, this looks like it may involve: ${issues.map((i) => i.label.replace("Potential ", "")).join(", ")}.`
      : `UJRIS has recorded your situation (${situationLabel.toLowerCase()}) and is ready to help you organise the details.`;

  let whatHappened = templateWhatHappened(input.narrative, situationLabel, timelineEvents.length);
  let whatMatters = templateWhatMatters(issues);

  const llmSummary = await tryLlmNarrativeSummary(input.narrative, issues.map((i) => i.label));
  let provider: CaseAnalysisResult["provider"] = "heuristic";
  if (llmSummary) {
    whatHappened = llmSummary.whatHappened ?? whatHappened;
    whatMatters = llmSummary.whatMatters ?? whatMatters;
    provider = "heuristic+llm";
  }

  const ujuBrief = {
    whatHappened,
    whatMatters,
    supportedByEvidence:
      input.evidenceCount > 0
        ? `You've uploaded ${input.evidenceCount} piece(s) of evidence. UJRIS will connect these to your timeline as you add more detail.`
        : "No evidence has been uploaded yet. Preserving documents, messages, or emails related to this situation is usually the most valuable next step.",
    uncertain:
      [
        issues.length > 0
          ? "UJRIS has identified possible legal issues from keywords in your description — these are starting points, not conclusions. A legal adviser can confirm which, if any, apply to your situation."
          : "UJRIS needs more detail before it can suggest which legal or procedural issues may be relevant.",
        dateInference.status === "ambiguous" || dateInference.status === "insufficient_data" ? dateInference.reason : null,
      ]
        .filter(Boolean)
        .join(" "),
    keyDates: timelineEvents.map((e) => `${e.date.toDateString()} — ${e.title}`),
    keyPeople: analysis.people.map((p) => `${p.name} (${p.role})`),
    nextBestAction: nextBestAction.description,
    questionsOutstanding: buildOutstandingQuestions(analysis, issues),
  };

  return {
    issueSummary,
    issues: issues.map((i) => ({ id: i.id, label: i.label, authority: i.authority, confidence: "medium" as const })),
    timelineEvents,
    people: analysis.people,
    deadlines,
    urgency,
    dateInference,
    readiness,
    nextBestAction,
    ujuBrief,
    provider,
  };
}

function summarizeSentence(sentence: string): string {
  const trimmed = sentence.trim();
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
}

function templateWhatHappened(narrative: string, situationLabel: string, eventCount: number): string {
  const preview = narrative.trim().slice(0, 320);
  const suffix = narrative.trim().length > 320 ? "..." : "";
  const timelineNote = eventCount > 0 ? ` UJRIS identified ${eventCount} dated event(s) in your account.` : "";
  return `You told UJRIS: "${preview}${suffix}" This has been categorised as: ${situationLabel}.${timelineNote}`;
}

function templateWhatMatters(issues: { label: string; authority: string }[]): string {
  if (issues.length === 0) {
    return "UJRIS hasn't identified a specific legal issue yet from your description. Adding more detail — what was said, by whom, and when — will help sharpen this.";
  }
  return issues
    .map((i) => `${i.label} (potentially relevant: ${i.authority})`)
    .join(" ");
}

function buildOutstandingQuestions(
  analysis: ReturnType<typeof analyzeNarrative>,
  issues: { id: string }[]
): string[] {
  const questions: string[] = [];
  if (analysis.dates.filter((d) => d.date).length === 0) {
    questions.push("What date did the key event(s) happen? Exact dates significantly affect your deadlines.");
  }
  if (analysis.people.length === 0) {
    questions.push("Who else was involved (manager, HR, witnesses)? Add their names and roles.");
  }
  if (issues.length === 0) {
    questions.push("What exactly was said or done that you believe was unfair or unlawful?");
  }
  questions.push("Do you have any written record (email, message, letter) of what happened?");
  return questions;
}

function deriveNextBestAction(input: {
  evidenceCount: number;
  hasDeadline: boolean;
  issueCount: number;
  urgency: string;
}): { title: string; description: string } {
  if (input.urgency === "critical" || input.urgency === "high") {
    return {
      title: "Check your deadline urgently",
      description:
        "UJRIS has identified a time-sensitive deadline in your case. Review it now — missing an Employment Tribunal deadline can mean losing your right to claim.",
    };
  }
  if (input.evidenceCount === 0) {
    return {
      title: "Preserve your evidence",
      description:
        "Upload any emails, messages, letters, or documents related to what happened. UJRIS will hash and timestamp each one so you have a tamper-evident record.",
    };
  }
  if (input.issueCount === 0) {
    return {
      title: "Add more detail to your case",
      description:
        "Tell UJRIS more about what was said or done, and by whom. More detail helps UJRIS identify which legal or procedural issues may be relevant.",
    };
  }
  return {
    title: "Review your case issues",
    description:
      "UJRIS has identified possible legal issues in your case. Review them, then use the Action Engine to prepare your next document.",
  };
}

async function tryLlmNarrativeSummary(
  narrative: string,
  issueLabels: string[]
): Promise<{ whatHappened: string; whatMatters: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You summarise a UK self-litigant's account of a workplace dispute in plain, calm, neutral language. Never invent facts, dates, names, or legal conclusions not present in the input. Never state that anyone is guilty of anything. Output strict JSON: {\"whatHappened\": string, \"whatMatters\": string}.",
          },
          {
            role: "user",
            content: `Account: ${narrative}\n\nHeuristically detected possible issues (for context only, do not treat as confirmed): ${issueLabels.join(", ") || "none detected"}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content);
    if (typeof parsed.whatHappened !== "string" || typeof parsed.whatMatters !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
