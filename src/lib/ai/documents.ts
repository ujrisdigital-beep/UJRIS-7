import { format } from "date-fns";

export type DocumentKind =
  | "grievance_letter"
  | "sar_request"
  | "chronology"
  | "et1_particulars"
  | "witness_statement"
  | "settlement_proposal";

export const DOCUMENT_KINDS: { kind: DocumentKind; label: string; description: string }[] = [
  { kind: "chronology", label: "Chronology", description: "A dated, factual sequence of events for your case." },
  { kind: "grievance_letter", label: "Grievance letter", description: "A formal letter raising your concerns internally." },
  { kind: "sar_request", label: "Subject Access Request", description: "Request your personal data under UK GDPR Art. 15." },
  { kind: "et1_particulars", label: "ET1 particulars (draft skeleton)", description: "A structured starting draft for your Employment Tribunal claim particulars." },
  { kind: "witness_statement", label: "Witness statement (draft skeleton)", description: "A structured starting draft of your own witness statement." },
  { kind: "settlement_proposal", label: "Settlement proposal", description: "A draft proposal letter for negotiating a resolution." },
];

export interface CaseTwinSnapshot {
  title: string;
  narrative: string;
  situation: string;
  userName: string;
  people: { name: string; role: string }[];
  events: { date: Date; title: string; description: string }[];
  issues: { label: string; authority: string }[];
  evidenceSummaries: { fileName: string; category: string }[];
}

interface GeneratedDoc {
  title: string;
  content: string;
  assumptions: string[];
}

const REVIEW_WARNING =
  "> **Review before sending.** This draft was assembled from the facts you have entered into UJRIS. It has not been reviewed by a legally qualified person. Check every fact, date, and name for accuracy, and consider getting advice (e.g. from ACAS, Citizens Advice, or a solicitor) before sending anything based on it.";

export function generateDocument(kind: DocumentKind, twin: CaseTwinSnapshot): GeneratedDoc {
  switch (kind) {
    case "chronology":
      return chronology(twin);
    case "grievance_letter":
      return grievanceLetter(twin);
    case "sar_request":
      return sarRequest(twin);
    case "et1_particulars":
      return et1Particulars(twin);
    case "witness_statement":
      return witnessStatement(twin);
    case "settlement_proposal":
      return settlementProposal(twin);
  }
}

function chronology(twin: CaseTwinSnapshot): GeneratedDoc {
  const rows = twin.events.length
    ? twin.events
        .map((e) => `| ${format(e.date, "dd MMM yyyy")} | ${e.title} |`)
        .join("\n")
    : "| _(no dated events yet)_ | Add events from your case timeline to populate this. |";

  const content = `# Chronology — ${twin.title}\n\n${REVIEW_WARNING}\n\n| Date | Event |\n|---|---|\n${rows}\n\n## Evidence referenced\n\n${
    twin.evidenceSummaries.length
      ? twin.evidenceSummaries.map((e) => `- ${e.fileName} (${e.category})`).join("\n")
      : "_No evidence uploaded yet._"
  }\n`;

  return {
    title: `Chronology — ${twin.title}`,
    content,
    assumptions: ["Events are ordered by dates UJRIS detected or that you entered manually — verify each date."],
  };
}

function grievanceLetter(twin: CaseTwinSnapshot): GeneratedDoc {
  const employer = twin.people.find((p) => p.role === "Employer" || p.role === "HR")?.name ?? "[Employer/HR name]";
  const eventsList = twin.events.slice(0, 6).map((e, i) => `${i + 1}. On ${format(e.date, "dd MMMM yyyy")}, ${lowerFirst(e.title)}.`).join("\n");

  const content = `# Formal Grievance Letter\n\n${REVIEW_WARNING}\n\nTo: ${employer}\nFrom: ${twin.userName}\nDate: ${format(new Date(), "dd MMMM yyyy")}\nRe: Formal Grievance\n\nDear ${employer},\n\nI am writing to formally raise a grievance regarding the following matter(s).\n\n## Summary\n\n${twin.narrative.slice(0, 600)}\n\n## Key events\n\n${eventsList || "_(Add key dated events to your case to populate this section.)_"}\n\n## What I am asking for\n\nI would like this grievance to be investigated formally under the company's grievance procedure, and I would welcome the opportunity to discuss it at a meeting. Please confirm receipt of this letter and let me know the next steps and timescale.\n\nYours sincerely,\n${twin.userName}\n`;

  return {
    title: "Formal Grievance Letter",
    content,
    assumptions: [
      "The recipient name defaults to a placeholder if UJRIS could not identify a named HR/Employer contact — replace it before sending.",
      "The summary is drawn directly from your own narrative — review it for tone and completeness.",
    ],
  };
}

function sarRequest(twin: CaseTwinSnapshot): GeneratedDoc {
  const employer = twin.people.find((p) => p.role === "Employer" || p.role === "HR")?.name ?? "[Organisation name]";
  const content = `# Subject Access Request (SAR)\n\n${REVIEW_WARNING}\n\nTo: ${employer}\nFrom: ${twin.userName}\nDate: ${format(new Date(), "dd MMMM yyyy")}\nRe: Subject Access Request under UK GDPR Article 15\n\nDear ${employer},\n\nUnder Article 15 of the UK General Data Protection Regulation (UK GDPR) and the Data Protection Act 2018, I am requesting a copy of all personal data you hold about me. This includes, but is not limited to:\n\n- Emails and internal communications that mention me or were sent to/from me\n- HR records, disciplinary and grievance records\n- Notes from meetings involving me\n- CCTV or access-control records, if applicable\n- Any records relating to the following period/events: ${twin.events[0] ? format(twin.events[0].date, "dd MMMM yyyy") : "[start date]"} to ${format(new Date(), "dd MMMM yyyy")}\n\nUnder the UK GDPR, you are required to respond within one calendar month of receipt of this request (extendable by two further months for complex requests, with notice to me).\n\nPlease confirm receipt of this request.\n\nYours sincerely,\n${twin.userName}\n`;

  return {
    title: "Subject Access Request (SAR)",
    content,
    assumptions: ["The one-month statutory response window starts from the date the organisation receives this request — record the send date."],
  };
}

function et1Particulars(twin: CaseTwinSnapshot): GeneratedDoc {
  const issuesList = twin.issues.length
    ? twin.issues.map((i) => `- **${i.label}** — potentially engaging: ${i.authority}`).join("\n")
    : "_No specific legal issues identified yet — add more detail to your case narrative._";

  const content = `# ET1 Particulars of Claim — Draft Skeleton\n\n${REVIEW_WARNING}\n\n**This is a starting skeleton only.** The real ET1 form has structured fields (ACAS EC certificate number, respondent details, etc.) that must be completed on the official form at https://www.gov.uk/employment-tribunals.\n\n## 1. Background\n\n${twin.narrative}\n\n## 2. Key dates\n\n${twin.events.map((e) => `- ${format(e.date, "dd MMMM yyyy")}: ${e.title}`).join("\n") || "_(no dated events recorded yet)_"}\n\n## 3. Legal basis (heuristically identified — verify with an adviser)\n\n${issuesList}\n\n## 4. What I am seeking\n\n_[Describe the remedy you are seeking — e.g. compensation, reinstatement, a declaration]_\n\n## 5. Supporting evidence\n\n${twin.evidenceSummaries.map((e) => `- ${e.fileName}`).join("\n") || "_No evidence uploaded yet._"}\n`;

  return {
    title: "ET1 Particulars — Draft Skeleton",
    content,
    assumptions: [
      "Legal issues are heuristically detected from keywords in your narrative and are not a legal conclusion.",
      "You must still complete and submit the official ET1 form; this document only drafts the particulars of claim narrative.",
      "An ACAS Early Conciliation certificate is required before submitting most ET1 claims.",
    ],
  };
}

function witnessStatement(twin: CaseTwinSnapshot): GeneratedDoc {
  const paragraphs = twin.events
    .map((e, i) => `${i + 1}. On ${format(e.date, "dd MMMM yyyy")}, ${lowerFirst(e.description || e.title)}`)
    .join("\n\n");

  const content = `# Witness Statement of ${twin.userName} — Draft Skeleton\n\n${REVIEW_WARNING}\n\nI, ${twin.userName}, will say as follows:\n\n## Introduction\n\n1. I make this statement in support of my case. The facts in this statement are within my own knowledge unless otherwise stated, and I believe them to be true.\n\n## Background and events\n\n${paragraphs || "_(Add dated events to your case to draft this section.)_"}\n\n## Statement of truth\n\nI believe the facts stated in this witness statement are true.\n\nSigned: ______________________\nDate: ${format(new Date(), "dd MMMM yyyy")}\n`;

  return {
    title: `Witness Statement — Draft Skeleton`,
    content,
    assumptions: ["Numbered paragraphs are drawn from your recorded timeline events — review each for accuracy before relying on this statement."],
  };
}

function settlementProposal(twin: CaseTwinSnapshot): GeneratedDoc {
  const content = `# Settlement Proposal — Draft\n\n${REVIEW_WARNING}\n\nTo: [Other party / their representative]\nFrom: ${twin.userName}\nDate: ${format(new Date(), "dd MMMM yyyy")}\nRe: Without-prejudice settlement discussion\n\nThis letter is written on a without-prejudice basis and is not admissible as evidence of liability.\n\n## Summary of my position\n\n${twin.narrative.slice(0, 500)}\n\n## Proposal\n\nI would be willing to resolve this matter on the following basis:\n\n- _[Financial terms — use UJRIS's Settlement Room to model a supportable range before filling this in]_\n- _[Non-financial terms, e.g. a reference, an apology, confidentiality]_\n\nI remain open to discussing this further and would welcome a response within 14 days.\n\nYours sincerely,\n${twin.userName}\n`;

  return {
    title: "Settlement Proposal — Draft",
    content,
    assumptions: [
      "UJRIS does not calculate a 'true' settlement value — use the Settlement Room to see an evidence-supported range with its assumptions before inserting a figure.",
      "This letter should be marked and treated as without-prejudice correspondence.",
    ],
  };
}

function lowerFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
