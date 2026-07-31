import type Stripe from "stripe";

export const STRIPE_WEBHOOK_PROCESSING_LEASE_MS = 5 * 60 * 1000;

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status,
): "active" | "trialing" | "past_due" | "cancelled" | "free" {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "incomplete":
    case "incomplete_expired":
    case "paused":
    case "unpaid":
      return "free";
  }
}

export function stripeWebhookLeaseIsStale(
  processingStartedAt: Date | null,
  now: Date,
): boolean {
  return (
    processingStartedAt === null ||
    processingStartedAt.getTime() <=
      now.getTime() - STRIPE_WEBHOOK_PROCESSING_LEASE_MS
  );
}
