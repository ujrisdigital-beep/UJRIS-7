"use server";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe";
import { PLANS, type PlanId } from "@/lib/plans";
import { appendAuditLog } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { isPlanId, resolvePaidCheckoutPath } from "@/lib/billing-mode";

/**
 * Entitlements are server-authoritative. Missing Stripe configuration does
 * NOT grant a paid plan. A development simulation exists only when
 * UJRIS_ALLOW_DEV_BILLING=true and NODE_ENV is not production.
 */
export async function startCheckoutAction(planId: unknown): Promise<{ ok: boolean; error?: string; url?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in first." };
  if (!isPlanId(planId)) {
    return { ok: false, error: "Unknown plan." };
  }
  const plan = PLANS[planId];
  if (planId === "free") {
    await downgradeToFree(user.id);
    return { ok: true };
  }
  if (planId === "practice") {
    return { ok: false, error: "UJRIS Practice is set up with our team — contact us to get started." };
  }

  const stripe = getStripeClient();
  const priceId = plan.stripePriceEnvVar ? process.env[plan.stripePriceEnvVar] : undefined;
  const stripeReady = Boolean(stripe && priceId);
  const path = resolvePaidCheckoutPath({ stripeConfigured: stripeReady });

  if (path === "fail_closed") {
    return { ok: false, error: "Billing is not configured. Paid plans cannot be activated." };
  }

  if (path === "dev_simulation") {
    await activateDevModeSubscription(user.id, planId);
    return { ok: true };
  }

  if (!stripe || !priceId) {
    return { ok: false, error: "Billing is not configured. Paid plans cannot be activated." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4127";
  let stripeCustomerId = (await db.subscription.findUnique({ where: { userId: user.id } }))?.stripeCustomerId ?? undefined;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({ email: user.email, name: user.name });
    stripeCustomerId = customer.id;
    await db.subscription.update({ where: { userId: user.id }, data: { stripeCustomerId } });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?checkout=success`,
    cancel_url: `${appUrl}/pricing?checkout=cancelled`,
    client_reference_id: user.id,
    subscription_data: { metadata: { userId: user.id, plan: planId } },
  });

  return { ok: true, url: session.url ?? undefined };
}

async function activateDevModeSubscription(userId: string, planId: PlanId): Promise<void> {
  await db.subscription.upsert({
    where: { userId },
    update: { plan: planId, status: "active", cancelAtPeriodEnd: false },
    create: { userId, plan: planId, status: "active" },
  });
  await db.user.update({ where: { id: userId }, data: { plan: planId } });
  await appendAuditLog({
    userId,
    action: "SUBSCRIPTION_DEV_MODE_ACTIVATED",
    detail: `plan=${planId} (UJRIS_ALLOW_DEV_BILLING; not production)`,
  });
  revalidatePath("/billing");
  revalidatePath("/home");
}

async function downgradeToFree(userId: string): Promise<void> {
  await db.subscription.upsert({
    where: { userId },
    update: { plan: "free", status: "active", cancelAtPeriodEnd: false },
    create: { userId, plan: "free", status: "active" },
  });
  await db.user.update({ where: { id: userId }, data: { plan: "free" } });
  await appendAuditLog({ userId, action: "SUBSCRIPTION_DOWNGRADED", detail: "plan=free" });
  revalidatePath("/billing");
}

export async function openBillingPortalAction(): Promise<{ ok: boolean; error?: string; url?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Please log in first." };
  const stripe = getStripeClient();
  const sub = await db.subscription.findUnique({ where: { userId: user.id } });

  if (!stripe || !sub?.stripeCustomerId) {
    return { ok: false, error: "Billing portal is available once Stripe is connected." };
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4127";
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${appUrl}/billing`,
  });
  return { ok: true, url: session.url };
}

export { isStripeConfigured };
