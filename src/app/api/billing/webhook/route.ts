import { NextRequest, NextResponse } from "next/server";
import { getStripeClient } from "@/lib/stripe";
import { db } from "@/lib/db";
import { appendAuditLog } from "@/lib/audit";
import type Stripe from "stripe";

/**
 * Stripe webhook — the single source of truth for subscription state in
 * production. Entitlements are written here, server-side, keyed off the
 * verified event payload; the client never sets its own plan.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe is not configured on this deployment." }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        if (userId && session.subscription) {
          const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const plan = (sub.metadata?.plan as string) ?? "protect";
          await db.subscription.upsert({
            where: { userId },
            update: {
              plan,
              status: sub.status,
              stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
              stripeSubscriptionId: sub.id,
              currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
            },
            create: {
              userId,
              plan,
              status: sub.status,
              stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
              stripeSubscriptionId: sub.id,
              currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
            },
          });
          await db.user.update({ where: { id: userId }, data: { plan } });
          await appendAuditLog({ userId, action: "SUBSCRIPTION_ACTIVATED_STRIPE", detail: `plan=${plan}` });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const existing = await db.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } });
        if (existing) {
          const plan = event.type === "customer.subscription.deleted" ? "free" : (sub.metadata?.plan as string) ?? existing.plan;
          await db.subscription.update({
            where: { id: existing.id },
            data: {
              status: event.type === "customer.subscription.deleted" ? "canceled" : sub.status,
              plan,
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              currentPeriodEnd: new Date(sub.items.data[0].current_period_end * 1000),
            },
          });
          await db.user.update({ where: { id: existing.userId }, data: { plan } });
          await appendAuditLog({ userId: existing.userId, action: "SUBSCRIPTION_UPDATED_STRIPE", detail: `status=${sub.status}` });
        }
        break;
      }
      default:
        break;
    }
  } catch (error) {
    console.error("[ujris] Stripe webhook handling error", error);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
