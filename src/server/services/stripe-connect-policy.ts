import type Stripe from "stripe";

export function getConnectAccountIdempotencyKey(userId: string): string {
  return `connect-account:${userId}:v1`;
}

export function isStripeConnectAccountReady(
  account: Pick<
    Stripe.Account,
    "charges_enabled" | "payouts_enabled" | "capabilities"
  >,
): boolean {
  return Boolean(
    account.charges_enabled &&
      account.payouts_enabled &&
      account.capabilities?.transfers === "active",
  );
}
