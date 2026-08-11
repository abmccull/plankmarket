import { describe, expect, it } from "vitest";
import {
  classifyPaymentIntentFinalizationLoss,
  hasActivePaymentIntentPreparation,
  PAYMENT_INTENT_PREPARATION_LEASE_MS,
} from "@/server/services/payment-intent-preparation";

describe("payment intent preparation lease", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");

  it("recognizes an active preparation claim", () => {
    expect(
      hasActivePaymentIntentPreparation({
        claimToken: "claim-1",
        claimedAt: new Date(now.getTime() - 1_000),
        now,
      }),
    ).toBe(true);
  });

  it("allows a stale claim to be recovered", () => {
    expect(
      hasActivePaymentIntentPreparation({
        claimToken: "claim-1",
        claimedAt: new Date(
          now.getTime() - PAYMENT_INTENT_PREPARATION_LEASE_MS,
        ),
        now,
      }),
    ).toBe(false);
  });

  it("requires both parts of the claim", () => {
    expect(
      hasActivePaymentIntentPreparation({
        claimToken: null,
        claimedAt: now,
        now,
      }),
    ).toBe(false);
    expect(
      hasActivePaymentIntentPreparation({
        claimToken: "claim-1",
        claimedAt: null,
        now,
      }),
    ).toBe(false);
  });
});

describe("payment intent finalization races", () => {
  const current = {
    paymentIntentClaimToken: null,
    stripePaymentIntentId: "pi_order",
    status: "pending",
    paymentStatus: "pending",
    escrowStatus: "held",
    inventoryReleasedAt: null,
  };

  it("reuses a matching intent only after another attempt safely finalized it", () => {
    expect(
      classifyPaymentIntentFinalizationLoss({
        expectedClaimToken: "claim-old",
        preparedPaymentIntentId: "pi_order",
        current,
        economicsMatch: true,
      }),
    ).toBe("already_finalized");
  });

  it("yields to a newer active claim without cancelling its intent", () => {
    expect(
      classifyPaymentIntentFinalizationLoss({
        expectedClaimToken: "claim-old",
        preparedPaymentIntentId: "pi_order",
        current: {
          ...current,
          stripePaymentIntentId: null,
          paymentIntentClaimToken: "claim-new",
        },
        economicsMatch: false,
      }),
    ).toBe("newer_claim");
  });

  it.each([
    ["changed economics", { ...current }, false],
    ["cancelled order", { ...current, status: "cancelled" }, true],
    [
      "captured payment",
      { ...current, paymentStatus: "succeeded" },
      true,
    ],
    ["different intent", { ...current, stripePaymentIntentId: "pi_other" }, true],
  ])("requires orphan cleanup for %s", (_label, state, economicsMatch) => {
    expect(
      classifyPaymentIntentFinalizationLoss({
        expectedClaimToken: "claim-old",
        preparedPaymentIntentId: "pi_order",
        current: state,
        economicsMatch,
      }),
    ).toBe("cancel_orphan");
  });
});
