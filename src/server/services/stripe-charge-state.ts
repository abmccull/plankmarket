import type Stripe from "stripe";

export function isStripeChargeRefunded(
  charge: Stripe.Charge | string | null | undefined,
): boolean {
  if (!charge || typeof charge === "string") return false;
  return Boolean(charge.refunded) || (charge.amount_refunded ?? 0) > 0;
}
