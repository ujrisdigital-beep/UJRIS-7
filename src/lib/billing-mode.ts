export type PlanId = "free" | "protect" | "advocate" | "practice";

const PAID_PLANS: PlanId[] = ["protect", "advocate", "practice"];

export function isPlanId(value: unknown): value is PlanId {
  return value === "free" || value === "protect" || value === "advocate" || value === "practice";
}

export function isPaidPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && PAID_PLANS.includes(value as PlanId);
}

/**
 * Development-only billing simulation. Must never run when NODE_ENV is
 * production, even if UJRIS_ALLOW_DEV_BILLING is set.
 */
export function isDevBillingSimulationAllowed(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.UJRIS_ALLOW_DEV_BILLING === "true";
}

export type CheckoutPath = "stripe" | "dev_simulation" | "fail_closed";

export function resolvePaidCheckoutPath(input: {
  stripeConfigured: boolean;
  env?: NodeJS.ProcessEnv;
}): CheckoutPath {
  if (input.stripeConfigured) return "stripe";
  if (isDevBillingSimulationAllowed(input.env ?? process.env)) return "dev_simulation";
  return "fail_closed";
}
