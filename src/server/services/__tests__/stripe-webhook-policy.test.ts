import { describe, expect, it } from "vitest";
import {
  mapStripeSubscriptionStatus,
  STRIPE_WEBHOOK_PROCESSING_LEASE_MS,
  stripeWebhookLeaseIsStale,
} from "../stripe-webhook-policy";

describe("Stripe webhook policy", () => {
  it("does not grant Pro access to incomplete or unpaid subscriptions", () => {
    expect(mapStripeSubscriptionStatus("incomplete")).toBe("free");
    expect(mapStripeSubscriptionStatus("incomplete_expired")).toBe("free");
    expect(mapStripeSubscriptionStatus("unpaid")).toBe("free");
    expect(mapStripeSubscriptionStatus("paused")).toBe("free");
  });

  it("maps payable and terminal subscription states", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("active");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("trialing");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("past_due");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("cancelled");
  });

  it("reclaims only missing or expired processing leases", () => {
    const now = new Date("2026-07-11T12:00:00.000Z");
    expect(stripeWebhookLeaseIsStale(null, now)).toBe(true);
    expect(
      stripeWebhookLeaseIsStale(
        new Date(now.getTime() - STRIPE_WEBHOOK_PROCESSING_LEASE_MS),
        now,
      ),
    ).toBe(true);
    expect(stripeWebhookLeaseIsStale(new Date(now.getTime() - 1_000), now)).toBe(
      false,
    );
  });
});
