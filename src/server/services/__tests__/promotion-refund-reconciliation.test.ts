import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    promotion: {} as Record<string, unknown>,
    selectResults: [] as Array<Array<Record<string, unknown>>>,
    updates: [] as Array<Record<string, unknown>>,
  };
  const paymentIntentsRetrieve = vi.fn();
  const refundsCreate = vi.fn();
  const refundsRetrieve = vi.fn();
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn(
            async () => state.selectResults.shift() ?? [state.promotion],
          ),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          state.updates.push(values);
          return [];
        }),
      })),
    })),
  };
  const transaction = vi.fn(
    async (callback: (transactionClient: typeof tx) => Promise<unknown>) =>
      callback(tx),
  );
  return {
    state,
    tx,
    transaction,
    paymentIntentsRetrieve,
    refundsCreate,
    refundsRetrieve,
    openReconciliationCase: vi.fn(async () => ({})),
  };
});

vi.mock("@/server/db", () => ({
  db: { transaction: mocks.transaction },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: { retrieve: mocks.paymentIntentsRetrieve },
    refunds: {
      create: mocks.refundsCreate,
      retrieve: mocks.refundsRetrieve,
    },
  },
}));

vi.mock("@/server/services/reconciliation-cases", () => ({
  openReconciliationCase: mocks.openReconciliationCase,
}));

import {
  attemptPendingPromotionRefund,
  prepareCancelledPromotionRefund,
  reconcilePromotionRefundResult,
} from "../promotion-refund-reconciliation";

function pendingPromotion(overrides: Record<string, unknown> = {}) {
  return {
    id: "promotion-1",
    listingId: "listing-1",
    sellerId: "seller-1",
    paymentStatus: "refund_pending",
    stripePaymentIntentId: "pi_promotion_1",
    refundAmountCents: 2500,
    refundIdempotencyKey: null,
    stripeRefundId: null,
    refundAttemptCount: 0,
    refundNextAttemptAt: null,
    refundLastError: null,
    ...overrides,
  };
}

function activePromotion(overrides: Record<string, unknown> = {}) {
  return {
    ...pendingPromotion(),
    isActive: true,
    cancelledAt: null,
    paymentStatus: "succeeded",
    pricePaid: 100,
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2026-01-11T00:00:00.000Z"),
    refundAmountCents: null,
    refundNextAttemptAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.updates = [];
  mocks.state.promotion = pendingPromotion();
  mocks.state.selectResults = [];
  mocks.paymentIntentsRetrieve.mockResolvedValue({
    id: "pi_promotion_1",
    metadata: {
      type: "promotion",
      listingId: "listing-1",
      sellerId: "seller-1",
      creditApplied: "0",
    },
    currency: "usd",
    status: "succeeded",
    amount_received: 2500,
  });
  mocks.refundsCreate.mockResolvedValue({
    id: "re_promotion_1",
    payment_intent: "pi_promotion_1",
    amount: 2500,
    status: "succeeded",
  });
});

describe("attemptPendingPromotionRefund", () => {
  it("uses a deterministic idempotency key and records provider success", async () => {
    const now = new Date("2026-01-15T12:00:00.000Z");

    const result = await attemptPendingPromotionRefund("promotion-1", now);

    expect(mocks.refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_intent: "pi_promotion_1",
        amount: 2500,
      }),
      { idempotencyKey: "promotion-expiry-refund:promotion-1" },
    );
    expect(result).toEqual(
      expect.objectContaining({
        refundStatus: "refunded",
        stripeRefundId: "re_promotion_1",
      }),
    );
    expect(mocks.state.updates.at(-1)).toEqual(
      expect.objectContaining({
        paymentStatus: "refunded",
        stripeRefundId: "re_promotion_1",
        refundAttemptCount: 1,
        refundedAt: now,
      }),
    );
  });

  it("fails closed immediately when the PaymentIntent cannot prove the obligation", async () => {
    mocks.paymentIntentsRetrieve.mockResolvedValue({
      id: "pi_promotion_1",
      metadata: {
        type: "promotion",
        listingId: "another-listing",
        sellerId: "seller-1",
        creditApplied: "0",
      },
      currency: "usd",
      status: "succeeded",
      amount_received: 2500,
    });

    const result = await attemptPendingPromotionRefund(
      "promotion-1",
      new Date("2026-01-15T12:00:00.000Z"),
    );

    expect(mocks.refundsCreate).not.toHaveBeenCalled();
    expect(result?.refundStatus).toBe("reconciliation_required");
    expect(mocks.state.updates.at(-1)).toEqual(
      expect.objectContaining({
        paymentStatus: "reconciliation_required",
        refundAttemptCount: 1,
        refundNextAttemptAt: null,
      }),
    );
  });

  it("persists transient provider failures for a later retry", async () => {
    mocks.paymentIntentsRetrieve.mockRejectedValue(
      new Error("Stripe temporarily unavailable"),
    );
    const now = new Date("2026-01-15T12:00:00.000Z");

    const result = await attemptPendingPromotionRefund("promotion-1", now);

    expect(result?.refundStatus).toBe("refund_pending");
    expect(mocks.state.updates.at(-1)).toEqual(
      expect.objectContaining({
        paymentStatus: "refund_pending",
        refundAttemptCount: 1,
        refundLastError: "Stripe temporarily unavailable",
        refundNextAttemptAt: new Date("2026-01-15T12:15:00.000Z"),
      }),
    );
  });

  it("reports a scheduled obligation as pending without calling Stripe early", async () => {
    mocks.state.promotion = pendingPromotion({
      refundNextAttemptAt: new Date("2026-01-15T13:00:00.000Z"),
    });

    const result = await attemptPendingPromotionRefund(
      "promotion-1",
      new Date("2026-01-15T12:00:00.000Z"),
    );

    expect(result?.refundStatus).toBe("refund_pending");
    expect(mocks.paymentIntentsRetrieve).not.toHaveBeenCalled();
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
    expect(mocks.state.updates).toHaveLength(0);
  });

  it("escalates an exhausted retry obligation into the operator queue", async () => {
    mocks.state.promotion = pendingPromotion({ refundAttemptCount: 7 });
    mocks.paymentIntentsRetrieve.mockRejectedValue(
      new Error("Stripe remains unavailable"),
    );
    const now = new Date("2026-01-15T12:00:00.000Z");

    const attempt = await attemptPendingPromotionRefund("promotion-1", now);
    expect(attempt?.refundStatus).toBe("reconciliation_required");

    await reconcilePromotionRefundResult(attempt!, now);

    expect(mocks.state.updates.at(-1)).toEqual(
      expect.objectContaining({
        paymentStatus: "reconciliation_required",
        refundAttemptCount: 8,
        refundNextAttemptAt: null,
      }),
    );
    expect(mocks.openReconciliationCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseKey: "promotion-refund:promotion-1",
        type: "promotion_refund",
        amountCents: 2500,
      }),
    );
  });
});

describe("prepareCancelledPromotionRefund", () => {
  it("deactivates the promotion and records the refund before Stripe", async () => {
    const promotion = activePromotion();
    const cancelledAt = new Date("2026-01-06T00:00:00.000Z");
    mocks.state.selectResults = [
      [promotion],
      [
        {
          id: "listing-1",
          promotionExpiresAt: new Date("2026-01-11T00:00:00.000Z"),
        },
      ],
    ];

    const result = await prepareCancelledPromotionRefund({
      promotionId: "promotion-1",
      cancelledAt,
      expectedSellerId: "seller-1",
    });

    expect(result).toEqual(
      expect.objectContaining({
        refundStatus: "refund_pending",
        refundAmountCents: 5000,
      }),
    );
    expect(mocks.state.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          isActive: false,
          cancelledAt,
        }),
        expect.objectContaining({
          promotionTier: null,
          promotionExpiresAt: null,
        }),
        expect.objectContaining({
          paymentStatus: "refund_pending",
          refundAmountCents: 5000,
          refundNextAttemptAt: cancelledAt,
        }),
      ]),
    );
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
  });

  it("sends credit-backed cancellation refunds to the operator queue", async () => {
    const promotion = activePromotion({ stripePaymentIntentId: null });
    const cancelledAt = new Date("2026-01-06T00:00:00.000Z");
    mocks.state.selectResults = [
      [promotion],
      [
        {
          id: "listing-1",
          promotionExpiresAt: new Date("2026-01-11T00:00:00.000Z"),
        },
      ],
    ];

    const preparation = await prepareCancelledPromotionRefund({
      promotionId: "promotion-1",
      cancelledAt,
    });
    expect(preparation?.refundStatus).toBe("reconciliation_required");

    await reconcilePromotionRefundResult(preparation!, cancelledAt);

    expect(mocks.openReconciliationCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseKey: "promotion-refund:promotion-1",
        type: "promotion_refund",
        amountCents: 5000,
      }),
    );
    expect(mocks.refundsCreate).not.toHaveBeenCalled();
  });
});
