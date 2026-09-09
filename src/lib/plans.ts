export type PlanId = "free" | "protect" | "advocate" | "practice";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  price: string;
  priceNote: string;
  tagline: string;
  maxCases: number;
  maxEvidencePerCase: number;
  features: string[];
  stripePriceEnvVar?: string;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "UJRIS Start",
    price: "£0",
    priceNote: "forever",
    tagline: "Get your first UJU Moment.",
    maxCases: 1,
    maxEvidencePerCase: 5,
    features: [
      "1 active case",
      "Initial case assessment & UJU Brief",
      "Basic timeline",
      "Limited evidence analysis",
      "Basic deadline tracking",
    ],
  },
  protect: {
    id: "protect",
    name: "UJRIS Protect",
    price: "£14.99",
    priceNote: "/month",
    tagline: "Your main case-management plan.",
    maxCases: 5,
    maxEvidencePerCase: 50,
    features: [
      "Up to 5 active cases",
      "Full evidence intelligence & forensic analysis",
      "Contradiction / Anchor Claim analysis",
      "Action Engine — unlimited document drafts",
      "Deadline defence & reminders",
      "Settlement Room",
    ],
    stripePriceEnvVar: "STRIPE_PRICE_PROTECT",
  },
  advocate: {
    id: "advocate",
    name: "UJRIS Advocate",
    price: "£29.99",
    priceNote: "/month",
    tagline: "Deep preparation for hearings and negotiation.",
    maxCases: 15,
    maxEvidencePerCase: 200,
    features: [
      "Everything in Protect",
      "Hearing Command Centre & simulation",
      "Advanced evidence relationship graph",
      "Priority processing",
      "Case export",
    ],
    stripePriceEnvVar: "STRIPE_PRICE_ADVOCATE",
  },
  practice: {
    id: "practice",
    name: "UJRIS Practice",
    price: "£79+",
    priceNote: "/user/month",
    tagline: "For advisers, CAB, unions and legal practices.",
    maxCases: 500,
    maxEvidencePerCase: 500,
    features: [
      "Multiple client matters",
      "Team collaboration & controlled client access",
      "Organisation audit logs",
      "API access",
      "Contact us for pricing",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["free", "protect", "advocate", "practice"];

export function entitlementsFor(plan: string | null | undefined): PlanDefinition {
  return PLANS[(plan as PlanId) ?? "free"] ?? PLANS.free;
}
