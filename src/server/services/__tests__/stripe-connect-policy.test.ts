import { describe, expect, it } from "vitest";
import {
  getConnectAccountIdempotencyKey,
  isStripeConnectAccountReady,
} from "@/server/services/stripe-connect-policy";

describe("Stripe Connect policy", () => {
  it("requires transfers in addition to charges and payouts", () => {
    expect(
      isStripeConnectAccountReady({
        charges_enabled: true,
        payouts_enabled: true,
        capabilities: { transfers: "pending" },
      }),
    ).toBe(false);
    expect(
      isStripeConnectAccountReady({
        charges_enabled: true,
        payouts_enabled: true,
        capabilities: { transfers: "active" },
      }),
    ).toBe(true);
  });

  it("uses a stable per-seller creation idempotency key", () => {
    expect(
      getConnectAccountIdempotencyKey(
        "00000000-0000-4000-8000-000000000001",
      ),
    ).toBe(
      "connect-account:00000000-0000-4000-8000-000000000001:v1",
    );
  });
});
