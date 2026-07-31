import { describe, expect, it } from "vitest";
import {
  getTransactionMilestones,
  type TransactionOrderState,
} from "@/lib/marketplace/transaction-milestones";

function createOrder(
  overrides: Partial<TransactionOrderState> = {},
): TransactionOrderState {
  return {
    status: "pending",
    paymentStatus: "pending",
    sellerTransferStatus: "awaiting_payment",
    selectedQuoteId: "quote-123",
    trackingNumber: null,
    confirmedAt: null,
    shippedAt: null,
    deliveredAt: null,
    cancelledAt: null,
    refundedAt: null,
    shipment: null,
    dispute: null,
    ...overrides,
  };
}

describe("getTransactionMilestones", () => {
  it("uses recorded payment, booking, pickup, transfer, and delivery fields", () => {
    const milestones = getTransactionMilestones(
      createOrder({
        status: "delivered",
        paymentStatus: "succeeded",
        sellerTransferStatus: "transferred",
        confirmedAt: "2026-07-01T10:00:00.000Z",
        shippedAt: "2026-07-03T10:00:00.000Z",
        deliveredAt: "2026-07-06T10:00:00.000Z",
        shipment: {
          status: "delivered",
          dispatchedAt: "2026-07-02T10:00:00.000Z",
          pickupDate: "2026-07-03T10:00:00.000Z",
          deliveredAt: "2026-07-06T10:00:00.000Z",
        },
      }),
      "buyer",
    );

    expect(milestones.map((item) => item.state)).toEqual([
      "complete",
      "complete",
      "complete",
      "complete",
      "complete",
    ]);
    expect(milestones[0]?.description).toContain("your platform charge");
    expect(milestones[3]?.description).toContain("separate Stripe Connect transfer");
  });

  it("marks an open reported issue without inventing a delivery result", () => {
    const milestones = getTransactionMilestones(
      createOrder({
        status: "delivered",
        paymentStatus: "succeeded",
        sellerTransferStatus: "transferred",
        shippedAt: "2026-07-03T10:00:00.000Z",
        deliveredAt: "2026-07-06T10:00:00.000Z",
        shipment: {
          status: "delivered",
          dispatchedAt: "2026-07-02T10:00:00.000Z",
          pickupDate: "2026-07-03T10:00:00.000Z",
          deliveredAt: "2026-07-06T10:00:00.000Z",
        },
        dispute: {
          status: "under_review",
          createdAt: "2026-07-06T14:00:00.000Z",
          updatedAt: "2026-07-07T14:00:00.000Z",
        },
      }),
      "seller",
    );

    const delivery = milestones.find((item) => item.id === "delivery");
    expect(delivery).toMatchObject({
      title: "Issue reported",
      state: "attention",
    });
    expect(delivery?.description).toContain("under review");
  });

  it("stops future milestones after an uncaptured cancellation", () => {
    const milestones = getTransactionMilestones(
      createOrder({
        status: "cancelled",
        cancelledAt: "2026-07-01T11:00:00.000Z",
      }),
      "buyer",
    );

    expect(milestones.map((item) => item.state)).toEqual([
      "stopped",
      "stopped",
      "stopped",
      "stopped",
      "stopped",
    ]);
  });

  it("does not claim that a selected quote has already been booked", () => {
    const milestones = getTransactionMilestones(
      createOrder({
        status: "confirmed",
        paymentStatus: "succeeded",
        sellerTransferStatus: "scheduled_after_pickup",
        confirmedAt: "2026-07-01T10:00:00.000Z",
        shipment: {
          status: "pending",
          dispatchedAt: null,
          pickupDate: null,
          deliveredAt: null,
        },
      }),
      "seller",
    );

    const freight = milestones.find((item) => item.id === "freight");
    expect(freight).toMatchObject({ state: "current" });
    expect(freight?.description).toContain("booked only after");
  });
});
