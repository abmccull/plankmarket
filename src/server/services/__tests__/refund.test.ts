import type { Database } from "@/server/db";
import { beforeEach, describe, expect, it, vi } from "vitest";

const providerMocks = vi.hoisted(() => ({
  retrievePaymentIntent: vi.fn(),
  createRefund: vi.fn(),
  retrieveTransfer: vi.fn(),
  createReversal: vi.fn(),
  findTransfer: vi.fn(),
  cancelShipment: vi.fn(),
  releaseInventory: vi.fn(),
  openReconciliationCase: vi.fn(),
  resolveReconciliationCaseByKey: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test_dummy",
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    paymentIntents: { retrieve: providerMocks.retrievePaymentIntent },
    refunds: { create: providerMocks.createRefund },
    transfers: {
      retrieve: providerMocks.retrieveTransfer,
      createReversal: providerMocks.createReversal,
    },
  },
}));

vi.mock("../stripe-order-transfer", () => ({
  findStripeTransferForOrder: providerMocks.findTransfer,
}));

vi.mock("../inventory-reservation", () => ({
  releaseReservedInventory: providerMocks.releaseInventory,
}));

vi.mock("../shipment-cancellation", () => ({
  cancelPriority1ShipmentForOrder: providerMocks.cancelShipment,
  ShipmentCancellationError: class ShipmentCancellationError extends Error {},
}));

vi.mock("../reconciliation-cases", () => ({
  openReconciliationCase: providerMocks.openReconciliationCase,
  resolveReconciliationCaseByKey:
    providerMocks.resolveReconciliationCaseByKey,
}));

import {
  calculateRefundAllocationSnapshot,
  calculateTargetTransferReversalCents,
  canIssuePartialOrderRefund,
  processOrderRefund,
  reconcileOrderRefundFromStripe,
  requiresManualFreightAllocation,
  reverseOrderTransferForDispute,
  shouldReleaseInventoryOnRefund,
} from "../refund";

const baseOrder = {
  id: "00000000-0000-4000-8000-000000000001",
  orderNumber: "PM-TEST-001",
  createdAt: new Date("2026-07-30T12:00:00.000Z"),
  buyerId: "00000000-0000-4000-8000-000000000002",
  sellerId: "00000000-0000-4000-8000-000000000003",
  sellerStripeAccountId: "acct_seller",
  subtotal: 80,
  buyerFee: 5,
  sellerFee: 4,
  buyerFreightCharge: 15,
  sellerStripeFee: 1,
  totalPrice: 100,
  sellerPayout: 75,
  status: "delivered" as const,
  paymentStatus: "succeeded",
  escrowStatus: "released",
  stripePaymentIntentId: "pi_order",
  stripeTransferId: "tr_order",
  stripeTransferReversalId: null,
  transferReversedAmount: 0,
  refundedAmount: null,
  sellerFreightContribution: 0,
  notes: null,
};

type MockRefundOrder = Omit<
  typeof baseOrder,
  | "status"
  | "stripeTransferId"
  | "stripeTransferReversalId"
  | "refundedAmount"
> & {
  status:
    | "pending"
    | "confirmed"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled"
    | "refunded";
  stripeTransferId: string | null;
  stripeTransferReversalId: string | null;
  refundedAmount: number | null;
};

const sellerFundedOrder: MockRefundOrder = {
  ...baseOrder,
  sellerPayout: 65,
  sellerFreightContribution: 10,
};

function createMockDatabase(
  order: MockRefundOrder,
  adminUsers: Array<{ id: string }> = [{ id: "admin-1" }],
) {
  const updateSets: Array<Record<string, unknown>> = [];
  const insertedValues: unknown[] = [];
  const tx = {
    select: vi.fn((selection: Record<string, unknown>) => {
      if ("orderNumber" in selection) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              for: vi.fn().mockResolvedValue([order]),
            })),
          })),
        };
      }
      if ("stripeAccountId" in selection) {
        return {
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue([
              { stripeAccountId: order.sellerStripeAccountId },
            ]),
          })),
        };
      }
      return {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(adminUsers),
        })),
      };
    }),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updateSets.push(values);
        return { where: vi.fn().mockResolvedValue([]) };
      }),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: unknown) => {
        insertedValues.push(values);
        return Promise.resolve([]);
      }),
    })),
  };
  const db = {
    transaction: vi.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
    update: tx.update,
  } as unknown as Database;

  return { db, tx, updateSets, insertedValues };
}

function matchingTransfer(
  orderId = baseOrder.id,
  transferId = "tr_order",
  amount = 7_500,
  overrides: Partial<{
    amount_reversed: number;
    currency: string;
    destination: string | null;
    metadata: Record<string, string>;
    source_transaction: string | null;
    transfer_group: string | null;
  }> = {},
) {
  return {
    id: transferId,
    metadata: { orderId, ...(overrides.metadata ?? {}) },
    currency: overrides.currency ?? "usd",
    amount,
    amount_reversed: overrides.amount_reversed ?? 0,
    destination: overrides.destination ?? baseOrder.sellerStripeAccountId,
    source_transaction: overrides.source_transaction ?? "ch_order",
    transfer_group: overrides.transfer_group ?? `order_${orderId}`,
    reversals: { data: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  providerMocks.retrievePaymentIntent.mockResolvedValue({
    id: "pi_order",
    amount: 10_000,
    currency: "usd",
    metadata: { orderId: baseOrder.id },
    latest_charge: "ch_order",
  });
  providerMocks.createRefund.mockResolvedValue({ id: "re_order" });
  providerMocks.retrieveTransfer.mockResolvedValue(matchingTransfer());
  providerMocks.createReversal.mockResolvedValue({
    id: "trr_order",
    amount: 7_500,
  });
  providerMocks.findTransfer.mockResolvedValue(undefined);
  providerMocks.cancelShipment.mockResolvedValue(undefined);
  providerMocks.releaseInventory.mockResolvedValue(undefined);
});

describe("shouldReleaseInventoryOnRefund", () => {
  it("releases inventory for full refunds before shipment", () => {
    expect(
      shouldReleaseInventoryOnRefund({
        orderStatus: "confirmed",
        isFullRefund: true,
      }),
    ).toBe(true);
  });

  it("does not release inventory for partial refunds", () => {
    expect(
      shouldReleaseInventoryOnRefund({
        orderStatus: "confirmed",
        isFullRefund: false,
      }),
    ).toBe(false);
  });

  it("does not release inventory after shipment", () => {
    expect(
      shouldReleaseInventoryOnRefund({
        orderStatus: "shipped",
        isFullRefund: true,
      }),
    ).toBe(false);
  });

  it("does not release inventory after delivery", () => {
    expect(
      shouldReleaseInventoryOnRefund({
        orderStatus: "delivered",
        isFullRefund: true,
      }),
    ).toBe(false);
  });
});

describe("canIssuePartialOrderRefund", () => {
  it("blocks partial refunds before a seller transfer exists", () => {
    expect(
      canIssuePartialOrderRefund({
        stripeTransferId: null,
      }),
    ).toBe(false);
  });

  it("allows partial refunds once seller payout exists", () => {
    expect(
      canIssuePartialOrderRefund({
        stripeTransferId: "tr_123",
      }),
    ).toBe(true);
  });
});

describe("direct partial refund transfer recovery", () => {
  it("blocks a partial refund before payout after checking for an orphan transfer", async () => {
    const order = {
      ...baseOrder,
      stripeTransferId: null,
      escrowStatus: "held",
    };
    const { db } = createMockDatabase(order);

    await expect(
      processOrderRefund({
        db,
        orderId: order.id,
        amountCents: 2_500,
        reason: "partial adjustment",
      }),
    ).rejects.toThrow(
      "Partial refunds are not supported before seller payout",
    );

    expect(providerMocks.findTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: order.id,
        orderCreatedAt: order.createdAt,
      }),
    );
    expect(providerMocks.retrieveTransfer).not.toHaveBeenCalled();
    expect(providerMocks.createRefund).not.toHaveBeenCalled();
    expect(providerMocks.createReversal).not.toHaveBeenCalled();
  });

  it("allows a proportional partial refund after a locally recorded payout", async () => {
    providerMocks.createReversal.mockResolvedValue({
      id: "trr_partial",
      amount: 1_875,
    });
    const { db, updateSets } = createMockDatabase(baseOrder);

    await expect(
      processOrderRefund({
        db,
        orderId: baseOrder.id,
        amountCents: 2_500,
        reason: "partial adjustment",
      }),
    ).resolves.toEqual({
      refundId: "re_order",
      amountRefunded: 25,
      transferReversalId: "trr_partial",
    });
    expect(
      providerMocks.resolveReconciliationCaseByKey,
    ).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        caseKey: `refund-failure:${baseOrder.id}`,
      }),
    );

    expect(providerMocks.retrieveTransfer).toHaveBeenCalledWith("tr_order");
    expect(providerMocks.findTransfer).not.toHaveBeenCalled();
    expect(providerMocks.createRefund).toHaveBeenCalledTimes(1);
    expect(providerMocks.createReversal).toHaveBeenCalledWith(
      "tr_order",
      expect.objectContaining({ amount: 1_875 }),
      expect.objectContaining({
        idempotencyKey: `order-transfer-reversal:${baseOrder.id}:1875`,
      }),
    );
    expect(updateSets[0]).toEqual(
      expect.objectContaining({
        escrowStatus: "released",
        stripeTransferId: "tr_order",
        transferReversedAmount: 18.75,
      }),
    );
  });

  it("recovers and persists an orphan transfer before issuing a partial refund", async () => {
    const order = {
      ...baseOrder,
      stripeTransferId: null,
      escrowStatus: "held",
    };
    providerMocks.findTransfer.mockResolvedValue(
      matchingTransfer(order.id, "tr_orphan"),
    );
    providerMocks.createReversal.mockResolvedValue({
      id: "trr_orphan_partial",
      amount: 1_875,
    });
    const { db, updateSets } = createMockDatabase(order);

    await expect(
      processOrderRefund({
        db,
        orderId: order.id,
        amountCents: 2_500,
        reason: "partial adjustment",
      }),
    ).resolves.toEqual({
      refundId: "re_order",
      amountRefunded: 25,
      transferReversalId: "trr_orphan_partial",
    });

    expect(providerMocks.findTransfer).toHaveBeenCalledTimes(1);
    expect(providerMocks.retrieveTransfer).not.toHaveBeenCalled();
    expect(providerMocks.createRefund).toHaveBeenCalledTimes(1);
    expect(providerMocks.createReversal).toHaveBeenCalledWith(
      "tr_orphan",
      expect.objectContaining({ amount: 1_875 }),
      expect.objectContaining({
        idempotencyKey: `order-transfer-reversal:${order.id}:1875`,
      }),
    );
    expect(updateSets[0]).toEqual(
      expect.objectContaining({
        escrowStatus: "released",
        stripeTransferId: "tr_orphan",
        transferReversedAmount: 18.75,
      }),
    );
  });

  it("rejects a mismatched orphan transfer before creating a refund", async () => {
    const order = {
      ...baseOrder,
      stripeTransferId: null,
      escrowStatus: "held",
    };
    providerMocks.findTransfer.mockResolvedValue(
      matchingTransfer("wrong-order", "tr_orphan"),
    );
    const { db } = createMockDatabase(order);

    await expect(
      processOrderRefund({
        db,
        orderId: order.id,
        amountCents: 2_500,
      }),
    ).rejects.toThrow(
      `Stored seller transfer does not match order ${order.id}`,
    );

    expect(providerMocks.createRefund).not.toHaveBeenCalled();
    expect(providerMocks.createReversal).not.toHaveBeenCalled();
  });

  it("rejects a corrupted stored transfer before creating a refund", async () => {
    providerMocks.retrieveTransfer.mockResolvedValue(
      matchingTransfer(baseOrder.id, "tr_order", 7_500, {
        destination: "acct_wrong",
      }),
    );
    const { db } = createMockDatabase(baseOrder);

    await expect(
      processOrderRefund({
        db,
        orderId: baseOrder.id,
        amountCents: 2_500,
      }),
    ).rejects.toThrow(
      `Stored seller transfer does not match order ${baseOrder.id}`,
    );

    expect(providerMocks.createRefund).not.toHaveBeenCalled();
    expect(providerMocks.createReversal).not.toHaveBeenCalled();
  });

  it("does not persist local refund success when Stripe refund succeeds but transfer reversal fails, and webhook reconciliation can recover", async () => {
    providerMocks.createReversal
      .mockRejectedValueOnce(new Error("transfer reversal failed"))
      .mockResolvedValueOnce({
        id: "trr_recovered",
        amount: 1_875,
      });
    const { db, updateSets, insertedValues } = createMockDatabase(baseOrder);

    await expect(
      processOrderRefund({
        db,
        orderId: baseOrder.id,
        amountCents: 2_500,
        reason: "partial adjustment",
      }),
    ).rejects.toThrow("transfer reversal failed");
    expect(providerMocks.openReconciliationCase).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        caseKey: `refund-failure:${baseOrder.id}`,
        type: "refund_failure",
        severity: "critical",
      }),
    );

    expect(providerMocks.createRefund).toHaveBeenCalledTimes(1);
    expect(providerMocks.createReversal).toHaveBeenCalledTimes(1);
    expect(updateSets).toHaveLength(0);
    expect(insertedValues).toHaveLength(0);

    await expect(
      reconcileOrderRefundFromStripe({
        db,
        orderId: baseOrder.id,
        refundedAmountCents: 2_500,
        stripeRefundId: "re_order",
        reason: "Stripe refund webhook reconciliation",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        updated: true,
        manualReviewRequired: false,
        manualAllocationRequired: false,
      }),
    );
    expect(
      providerMocks.resolveReconciliationCaseByKey,
    ).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        caseKey: `refund-reconciliation:${baseOrder.id}`,
      }),
    );

    expect(providerMocks.createReversal).toHaveBeenCalledTimes(2);
    expect(updateSets[0]).toEqual(
      expect.objectContaining({
        paymentStatus: "partially_refunded",
        escrowStatus: "released",
        sellerPayout: 56.25,
        refundedAmount: 25,
        transferReversedAmount: 18.75,
      }),
    );
  });
});

describe("seller-funded freight allocation policy", () => {
  it("derives an exact deterministic seller-funded refund allocation snapshot", () => {
    expect(
      calculateRefundAllocationSnapshot({
        subtotalCents: 8_000,
        buyerFeeCents: 500,
        buyerFreightChargeCents: 1_500,
        sellerFeeCents: 400,
        sellerStripeFeeCents: 100,
        sellerFreightContributionCents: 1_000,
        totalChargeCents: 10_000,
        sellerPayoutCents: 6_500,
        cumulativeRefundCents: 2_500,
      }),
    ).toEqual({
      cumulativeRefundCents: 2_500,
      buyerChargeAllocation: {
        subtotal: 2_000,
        buyerFee: 125,
        buyerFreightCharge: 375,
      },
      sellerAllocation: {
        subtotalRecovery: 2_000,
        sellerFeeRelief: 100,
        sellerStripeFeeRelief: 25,
        sellerFreightRelief: 250,
        netPayoutReductionCents: 1_625,
      },
    });
  });

  it("requires manual allocation for partial recovery, but not a full recovery", () => {
    expect(
      requiresManualFreightAllocation({
        sellerFreightContribution: 10,
        cumulativeRecoveryCents: 2_500,
        fullAmountCents: 10_000,
      }),
    ).toBe(true);
    expect(
      requiresManualFreightAllocation({
        sellerFreightContribution: 10,
        cumulativeRecoveryCents: 10_000,
        fullAmountCents: 10_000,
      }),
    ).toBe(false);
  });

  it.each([
    ["before payout", null, undefined],
    ["after payout", "tr_order", undefined],
    ["after orphan payout recovery", null, "tr_orphan"],
  ])(
    "supports a direct seller-funded partial refund %s only when payout evidence exists",
    async (_label, stripeTransferId, orphanTransferId) => {
      const hasPayoutEvidence = Boolean(stripeTransferId || orphanTransferId);
      if (orphanTransferId) {
        providerMocks.findTransfer.mockResolvedValue(
          matchingTransfer(sellerFundedOrder.id, orphanTransferId, 6_500),
        );
      }
      if (stripeTransferId) {
        providerMocks.retrieveTransfer.mockResolvedValue(
          matchingTransfer(sellerFundedOrder.id, stripeTransferId, 6_500),
        );
      }
      providerMocks.createReversal.mockResolvedValue({
        id: "trr_seller_partial",
        amount: 1_625,
      });
      const { db } = createMockDatabase({
        ...sellerFundedOrder,
        stripeTransferId,
        escrowStatus: stripeTransferId ? "released" : "held",
      });

      const expectation = processOrderRefund({
        db,
        orderId: sellerFundedOrder.id,
        amountCents: 2_500,
        reason: "partial adjustment",
      });

      if (!hasPayoutEvidence) {
        await expect(expectation).rejects.toThrow(
          "Partial refunds are not supported before seller payout",
        );
        expect(providerMocks.createRefund).not.toHaveBeenCalled();
        expect(providerMocks.createReversal).not.toHaveBeenCalled();
        return;
      }

      await expect(expectation).resolves.toEqual({
        refundId: "re_order",
        amountRefunded: 25,
        transferReversalId: "trr_seller_partial",
      });

      expect(providerMocks.createRefund).toHaveBeenCalledTimes(1);
      expect(providerMocks.createReversal).toHaveBeenCalledWith(
        orphanTransferId ?? "tr_order",
        expect.objectContaining({ amount: 1_625 }),
        expect.objectContaining({
          idempotencyKey: `order-transfer-reversal:${sellerFundedOrder.id}:1625`,
        }),
      );
    },
  );

  it.each([
    ["before payout", null],
    ["after payout", "tr_order"],
  ])(
    "allows a full seller-funded-freight refund %s",
    async (_label, stripeTransferId) => {
      const order = {
        ...sellerFundedOrder,
        status: "confirmed" as const,
        stripeTransferId,
        escrowStatus: stripeTransferId ? "released" : "held",
      };
      if (stripeTransferId) {
        providerMocks.retrieveTransfer.mockResolvedValue(
          matchingTransfer(order.id, stripeTransferId, 6_500),
        );
        providerMocks.createReversal.mockResolvedValue({
          id: "trr_order",
          amount: 6_500,
        });
      }
      const { db } = createMockDatabase(order);

      await expect(
        processOrderRefund({
          db,
          orderId: order.id,
          reason: "full cancellation",
        }),
      ).resolves.toEqual({
        refundId: "re_order",
        amountRefunded: 100,
        transferReversalId: stripeTransferId ? "trr_order" : undefined,
      });

      expect(providerMocks.createRefund).toHaveBeenCalledTimes(1);
      expect(providerMocks.cancelShipment).toHaveBeenCalledWith(
        order.id,
        expect.anything(),
      );
      if (stripeTransferId) {
        expect(providerMocks.createReversal).toHaveBeenCalledWith(
          "tr_order",
          expect.objectContaining({ amount: 6_500 }),
          expect.objectContaining({
            idempotencyKey: `order-transfer-reversal:${order.id}:6500`,
          }),
        );
      } else {
        expect(providerMocks.findTransfer).toHaveBeenCalledTimes(1);
        expect(providerMocks.createReversal).not.toHaveBeenCalled();
      }
    },
  );

  it("records a seller-funded partial external refund after payout with proportional reversal", async () => {
    providerMocks.retrieveTransfer.mockResolvedValue(
      matchingTransfer(sellerFundedOrder.id, "tr_order", 6_500),
    );
    providerMocks.createReversal.mockResolvedValue({
      id: "trr_external_partial",
      amount: 1_625,
    });
    const { db, updateSets } = createMockDatabase(sellerFundedOrder);

    await expect(
      reconcileOrderRefundFromStripe({
        db,
        orderId: sellerFundedOrder.id,
        refundedAmountCents: 2_500,
        stripeRefundId: "re_external",
        reason: "Stripe refund webhook reconciliation",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        updated: true,
        manualReviewRequired: false,
        manualAllocationRequired: false,
      }),
    );

    expect(providerMocks.retrieveTransfer).toHaveBeenCalledWith("tr_order");
    expect(providerMocks.createReversal).toHaveBeenCalledWith(
      "tr_order",
      expect.objectContaining({ amount: 1_625 }),
      expect.objectContaining({
        idempotencyKey: `order-transfer-reversal:${sellerFundedOrder.id}:1625`,
      }),
    );
    expect(updateSets[0]).toEqual(
      expect.objectContaining({
        paymentStatus: "partially_refunded",
        escrowStatus: "released",
        sellerPayout: 48.75,
        refundedAmount: 25,
      }),
    );
  });

  it("records a Stripe refund but holds manual review when transfer recovery validation fails", async () => {
    providerMocks.retrieveTransfer.mockResolvedValue(
      matchingTransfer(sellerFundedOrder.id, "tr_order", 6_500, {
        source_transaction: "ch_wrong",
      }),
    );
    const { db, updateSets, insertedValues } =
      createMockDatabase(sellerFundedOrder);

    await expect(
      reconcileOrderRefundFromStripe({
        db,
        orderId: sellerFundedOrder.id,
        refundedAmountCents: 2_500,
        stripeRefundId: "re_external",
        reason: "Stripe refund webhook reconciliation",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        updated: true,
        manualReviewRequired: true,
        manualReviewReason: expect.stringContaining(
          "Stored seller transfer does not match order",
        ),
      }),
    );
    expect(providerMocks.openReconciliationCase).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        caseKey: `refund-reconciliation:${sellerFundedOrder.id}`,
        type: "refund_failure",
      }),
    );

    expect(providerMocks.createReversal).not.toHaveBeenCalled();
    expect(updateSets[0]).toEqual(
      expect.objectContaining({
        paymentStatus: "partially_refunded",
        escrowStatus: "disputed",
        sellerPayout: 48.75,
        refundedAmount: 25,
        transferReversedAmount: 0,
      }),
    );
    expect(insertedValues).not.toHaveLength(0);
  });

  it("treats a duplicate partial-refund webhook as already reconciled", async () => {
    const { db, updateSets } = createMockDatabase({
      ...sellerFundedOrder,
      paymentStatus: "partially_refunded",
      refundedAmount: 25,
    });

    await expect(
      reconcileOrderRefundFromStripe({
        db,
        orderId: sellerFundedOrder.id,
        refundedAmountCents: 2_500,
        stripeRefundId: "re_external",
      }),
    ).resolves.toEqual({ updated: false });

    expect(updateSets).toHaveLength(0);
    expect(providerMocks.retrieveTransfer).not.toHaveBeenCalled();
    expect(providerMocks.createReversal).not.toHaveBeenCalled();
  });

  it.each([
    ["before payout", null],
    ["after payout", "tr_order"],
  ])(
    "holds a partial Stripe dispute for manual allocation %s",
    async (_label, stripeTransferId) => {
      const order = {
        ...baseOrder,
        ...sellerFundedOrder,
        stripeTransferId,
        escrowStatus: stripeTransferId ? "released" : "held",
      };
      const { db, updateSets } = createMockDatabase(order);

      await expect(
        reverseOrderTransferForDispute({
          db,
          orderId: order.id,
          stripeDisputeId: "dp_partial",
          disputedAmountCents: 2_500,
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          reversedAmountCents: 0,
          manualReviewRequired: true,
          manualAllocationRequired: true,
          manualReviewReason: expect.stringContaining(
            "Manual allocation is required",
          ),
        }),
      );

      expect(providerMocks.retrieveTransfer).not.toHaveBeenCalled();
      expect(providerMocks.createReversal).not.toHaveBeenCalled();
      expect(providerMocks.findTransfer).not.toHaveBeenCalled();
      expect(updateSets[0]).toEqual(
        expect.objectContaining({
          escrowStatus: "disputed",
          sellerPayout: order.sellerPayout,
          transferReversedAmount: 0,
        }),
      );
    },
  );
});

describe("calculateTargetTransferReversalCents", () => {
  it("reverses the proportional seller transfer for a partial recovery", () => {
    expect(
      calculateTargetTransferReversalCents({
        transferAmountCents: 8_000,
        totalChargeCents: 10_000,
        cumulativeRecoveryCents: 2_500,
      }),
    ).toBe(2_000);
  });

  it("reverses the full transfer once recovery reaches the charge", () => {
    expect(
      calculateTargetTransferReversalCents({
        transferAmountCents: 8_000,
        totalChargeCents: 10_000,
        cumulativeRecoveryCents: 10_000,
      }),
    ).toBe(8_000);
  });

  it("never reverses more than the original transfer", () => {
    expect(
      calculateTargetTransferReversalCents({
        transferAmountCents: 8_000,
        totalChargeCents: 10_000,
        cumulativeRecoveryCents: 15_000,
      }),
    ).toBe(8_000);
  });
});
