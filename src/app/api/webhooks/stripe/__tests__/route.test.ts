import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  receiveStripeWebhookEvent: vi.fn(),
  inngestSend: vi.fn(),
  releaseReservedInventory: vi.fn(),
  canApplyPaymentIntentCanceled: vi.fn(),
  claimStripeWebhookEvent: vi.fn(),
  completeStripeWebhookEvent: vi.fn(),
  failStripeWebhookEvent: vi.fn(),
  userFindFirst: vi.fn(),
  dbInsertValues: vi.fn(),
  txUpdateWhere: vi.fn(),
  txSelectForUpdate: vi.fn(),
  txSelectLimit: vi.fn(),
  dbTransaction: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: "whsec_test_123",
  },
}));

vi.mock("@/server/db", () => ({
  db: {
    query: {
      users: {
        findFirst: mocks.userFindFirst,
      },
    },
    insert: vi.fn(() => ({
      values: mocks.dbInsertValues,
    })),
    transaction: mocks.dbTransaction,
  },
}));
vi.mock("@/server/db/schema", () => ({
  orders: {},
  shipments: {},
  users: {},
  listings: {},
  listingPromotions: {},
  disputes: {},
  notifications: {},
  reconciliationCases: {},
  promotionCredits: {},
  agentConfigs: {},
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mocks.inngestSend },
}));
vi.mock("@/server/services/inventory-reservation", () => ({
  releaseReservedInventory: mocks.releaseReservedInventory,
}));
vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: mocks.constructEvent,
    },
  },
}));
vi.mock("@/lib/pro", () => ({ PRO_MONTHLY_CREDIT: 0 }));
vi.mock("@/server/services/refund", () => ({
  reconcileOrderRefundLifecycleFromStripe: vi.fn(),
  reconcileOrderRefundFromStripe: vi.fn(),
  reverseOrderTransferForDispute: vi.fn(),
}));
vi.mock("@/server/services/order-transitions", () => ({
  canApplyPaymentIntentCanceled: mocks.canApplyPaymentIntentCanceled,
  canApplyPaymentIntentFailed: vi.fn(),
  canApplyPaymentIntentProcessing: vi.fn(),
  canApplyPaymentIntentSucceeded: vi.fn(),
}));
vi.mock("@/server/services/shipping-workflow", () => ({
  ShippingBookingReviewError: class ShippingBookingReviewError extends Error {},
  SHIPPING_DISPATCH_SAFETY_BUFFER_MS: 0,
  requireShippingBookingSnapshotForOrder: vi.fn(),
}));
vi.mock("@/server/services/stripe-webhook-policy", () => ({
  mapStripeSubscriptionStatus: vi.fn(),
}));
vi.mock("@/server/services/reconciliation-cases", () => ({
  openReconciliationCase: vi.fn(),
  resolveReconciliationCaseByKey: vi.fn(),
}));
vi.mock("@/server/services/stripe-connect-policy", () => ({
  isStripeConnectAccountReady: vi.fn(),
}));
vi.mock("@/server/services/stripe-tax", () => ({
  findCommittedTaxTransaction: vi.fn(),
  TaxReadinessError: class TaxReadinessError extends Error {},
}));
vi.mock("@/server/services/stripe-webhook-inbox", () => ({
  claimStripeWebhookEvent: mocks.claimStripeWebhookEvent,
  completeStripeWebhookEvent: mocks.completeStripeWebhookEvent,
  failStripeWebhookEvent: mocks.failStripeWebhookEvent,
  receiveStripeWebhookEvent: mocks.receiveStripeWebhookEvent,
}));

const { POST, STRIPE_WEBHOOK_MAX_BODY_BYTES, processStripeWebhookEvent } =
  await import(
  "@/app/api/webhooks/stripe/route"
);

describe("Stripe webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dbInsertValues.mockResolvedValue([]);
    mocks.releaseReservedInventory.mockResolvedValue({
      released: true,
      reason: "released",
    });
    mocks.canApplyPaymentIntentCanceled.mockReturnValue(true);
    mocks.claimStripeWebhookEvent.mockResolvedValue({
      state: "claimed",
      event: {
        id: "evt_test",
        type: "account.application.deauthorized",
        account: "acct_test",
        created: 1,
        data: {
          object: {},
        },
      },
      startedAt: new Date("2026-08-03T12:00:00.000Z"),
    });
    mocks.completeStripeWebhookEvent.mockResolvedValue(undefined);
    mocks.failStripeWebhookEvent.mockResolvedValue(undefined);
    mocks.userFindFirst.mockResolvedValue({ id: "seller_1" });
  });

  it("rejects an oversized unsigned payload before signature handling", async () => {
    const response = await POST(
      new NextRequest("https://plankmarket.com/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
        headers: {
          "content-length": String(STRIPE_WEBHOOK_MAX_BODY_BYTES + 1),
        },
      }),
    );

    expect(response.status).toBe(413);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
    expect(mocks.receiveStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects a streamed oversized signed payload before Stripe verification", async () => {
    const response = await POST(
      new NextRequest("https://plankmarket.com/api/webhooks/stripe", {
        method: "POST",
        body: "x".repeat(STRIPE_WEBHOOK_MAX_BODY_BYTES + 1),
        headers: {
          "content-type": "application/json",
          "stripe-signature": "t=1,v1=test",
        },
      }),
    );

    expect(response.status).toBe(413);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
    expect(mocks.receiveStripeWebhookEvent).not.toHaveBeenCalled();
  });

  it("still rejects a small unsigned payload with a missing signature header", async () => {
    const response = await POST(
      new NextRequest("https://plankmarket.com/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
  });

  it("rejects non-json webhook media types before reading the body", async () => {
    const response = await POST(
      new NextRequest("https://plankmarket.com/api/webhooks/stripe", {
        method: "POST",
        body: "<xml />",
        headers: {
          "content-type": "text/xml",
          "stripe-signature": "t=1,v1=test",
        },
      }),
    );

    expect(response.status).toBe(415);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
  });

  it("rejects malformed application/json prefixes before reading the body", async () => {
    const response = await POST(
      new NextRequest("https://plankmarket.com/api/webhooks/stripe", {
        method: "POST",
        body: "{}",
        headers: {
          "content-type": "application/jsonevil; charset=utf-8",
          "stripe-signature": "t=1,v1=test",
        },
      }),
    );

    expect(response.status).toBe(415);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
  });

  it("cancels and releases only pending unpaid seller orders after deauthorization", async () => {
    let cancellationAttempt = 0;
    const tx = {
      update: vi.fn(() => {
        if (tx.update.mock.calls.length === 1) {
          return {
            set: vi.fn(() => ({
              where: mocks.txUpdateWhere.mockResolvedValue([]),
            })),
          };
        }

        return {
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockImplementation(async () => {
                cancellationAttempt += 1;
                return cancellationAttempt === 1
                  ? [{ id: "order_pending_unpaid" }]
                  : [];
              }),
            })),
          })),
        };
      }),
      select: vi.fn((selection: Record<string, unknown>) => {
        if ("escrowStatus" in selection) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                for: vi.fn().mockResolvedValue([
                  {
                    id: "order_pending_unpaid",
                    status: "pending",
                    paymentStatus: "pending",
                    inventoryReleasedAt: null,
                    escrowStatus: "none",
                  },
                  {
                    id: "order_paid",
                    status: "pending",
                    paymentStatus: "succeeded",
                    inventoryReleasedAt: null,
                    escrowStatus: "held",
                  },
                  {
                    id: "order_already_released",
                    status: "pending",
                    paymentStatus: "pending",
                    inventoryReleasedAt: new Date("2026-08-03T11:59:00.000Z"),
                    escrowStatus: "none",
                  },
                ]),
              })),
            })),
          };
        }

        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              for: mocks.txSelectForUpdate.mockResolvedValue([]),
            })),
            limit: mocks.txSelectLimit.mockResolvedValue([]),
          })),
        };
      }),
    };
    mocks.dbTransaction.mockImplementation(async (callback) => callback(tx));

    const result = await processStripeWebhookEvent("evt_test");

    expect(result).toEqual({ processed: true });
    expect(mocks.releaseReservedInventory).toHaveBeenCalledTimes(1);
    expect(mocks.releaseReservedInventory).toHaveBeenCalledWith({
      db: expect.anything(),
      orderId: "order_pending_unpaid",
      reason: "account.application.deauthorized",
    });
    expect(mocks.dbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "seller_1",
        title: "Stripe Account Disconnected",
      }),
    );
  });

  it("is idempotent on deauthorization replay once no pending unpaid reservations remain", async () => {
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      })),
      select: vi.fn((selection: Record<string, unknown>) => {
        if ("inventoryReleasedAt" in selection) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                for: vi.fn().mockResolvedValue([
                  {
                    id: "order_paid",
                    status: "pending",
                    paymentStatus: "succeeded",
                    inventoryReleasedAt: null,
                    escrowStatus: "held",
                  },
                  {
                    id: "order_cancelled",
                    status: "cancelled",
                    paymentStatus: "failed",
                    inventoryReleasedAt: new Date("2026-08-03T12:00:00.000Z"),
                    escrowStatus: "none",
                  },
                ]),
              })),
            })),
          };
        }

        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              for: vi.fn().mockResolvedValue([]),
            })),
          })),
        };
      }),
    };
    mocks.dbTransaction.mockImplementation(async (callback) => callback(tx));

    const result = await processStripeWebhookEvent("evt_test");

    expect(result).toEqual({ processed: true });
    expect(mocks.releaseReservedInventory).not.toHaveBeenCalled();
    expect(mocks.completeStripeWebhookEvent).toHaveBeenCalledWith(
      "evt_test",
      expect.any(Date),
    );
  });

  it("retries deauthorization cancellation when inventory release fails inside the transaction", async () => {
    const tx = {
      update: vi.fn(() => {
        if (tx.update.mock.calls.length === 1) {
          return {
            set: vi.fn(() => ({
              where: vi.fn().mockResolvedValue([]),
            })),
          };
        }

        return {
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([
                { id: "order_pending_unpaid" },
              ]),
            })),
          })),
        };
      }),
      select: vi.fn((selection: Record<string, unknown>) => {
        if ("escrowStatus" in selection) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                for: vi.fn().mockResolvedValue([
                  {
                    id: "order_pending_unpaid",
                    escrowStatus: "none",
                  },
                ]),
              })),
            })),
          };
        }

        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              for: vi.fn().mockResolvedValue([]),
            })),
          })),
        };
      }),
    };
    mocks.dbTransaction.mockImplementation(async (callback) => callback(tx));
    mocks.releaseReservedInventory
      .mockResolvedValueOnce({
        released: false,
        reason: "order_not_releasable",
      })
      .mockResolvedValueOnce({
        released: true,
        reason: "released",
      });

    await expect(processStripeWebhookEvent("evt_test")).rejects.toThrow(
      "Inventory release failed after deauthorization",
    );
    expect(mocks.failStripeWebhookEvent).toHaveBeenCalledWith(
      "evt_test",
      expect.any(Date),
      expect.any(Error),
    );

    const retryResult = await processStripeWebhookEvent("evt_test");

    expect(retryResult).toEqual({ processed: true });
    expect(mocks.releaseReservedInventory).toHaveBeenCalledTimes(2);
  });

  it("cancels and releases inventory atomically for payment_intent.canceled", async () => {
    mocks.claimStripeWebhookEvent.mockResolvedValueOnce({
      state: "claimed",
      event: {
        id: "evt_pi_canceled",
        type: "payment_intent.canceled",
        created: 1,
        data: {
          object: {
            id: "pi_cancelled",
            metadata: {
              orderId: "order_pending",
              type: "order",
            },
          },
        },
      },
      startedAt: new Date("2026-08-03T12:05:00.000Z"),
    });
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn().mockResolvedValue([
              {
                id: "order_pending",
                status: "pending",
                paymentStatus: "pending",
                stripePaymentIntentId: "pi_cancelled",
                inventoryReleasedAt: null,
              },
            ]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: "order_pending" }]),
          })),
        })),
      })),
    };
    mocks.dbTransaction.mockImplementation(async (callback) => callback(tx));

    const result = await processStripeWebhookEvent("evt_pi_canceled");

    expect(result).toEqual({ processed: true });
    expect(mocks.releaseReservedInventory).toHaveBeenCalledTimes(1);
    expect(mocks.releaseReservedInventory).toHaveBeenCalledWith({
      db: tx,
      orderId: "order_pending",
      reason: "payment_intent.canceled",
    });
  });

  it("retries payment_intent.canceled when inventory release fails inside the transaction", async () => {
    mocks.claimStripeWebhookEvent.mockResolvedValue({
      state: "claimed",
      event: {
        id: "evt_pi_canceled",
        type: "payment_intent.canceled",
        created: 1,
        data: {
          object: {
            id: "pi_cancelled",
            metadata: {
              orderId: "order_pending",
              type: "order",
            },
          },
        },
      },
      startedAt: new Date("2026-08-03T12:05:00.000Z"),
    });
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn().mockResolvedValue([
              {
                id: "order_pending",
                status: "pending",
                paymentStatus: "pending",
                stripePaymentIntentId: "pi_cancelled",
                inventoryReleasedAt: null,
              },
            ]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: "order_pending" }]),
          })),
        })),
      })),
    };
    mocks.dbTransaction.mockImplementation(async (callback) => callback(tx));
    mocks.releaseReservedInventory
      .mockResolvedValueOnce({
        released: false,
        reason: "order_not_releasable",
      })
      .mockResolvedValueOnce({
        released: true,
        reason: "released",
      });

    await expect(
      processStripeWebhookEvent("evt_pi_canceled"),
    ).rejects.toThrow(
      "Inventory release failed after payment cancellation",
    );
    expect(mocks.failStripeWebhookEvent).toHaveBeenCalledWith(
      "evt_pi_canceled",
      expect.any(Date),
      expect.any(Error),
    );

    const retryResult = await processStripeWebhookEvent("evt_pi_canceled");

    expect(retryResult).toEqual({ processed: true });
    expect(mocks.releaseReservedInventory).toHaveBeenCalledTimes(2);
  });

  it("is idempotent on payment_intent.canceled replay once inventory is already released", async () => {
    mocks.claimStripeWebhookEvent.mockResolvedValue({
      state: "claimed",
      event: {
        id: "evt_pi_canceled",
        type: "payment_intent.canceled",
        created: 1,
        data: {
          object: {
            id: "pi_cancelled",
            metadata: {
              orderId: "order_pending",
              type: "order",
            },
          },
        },
      },
      startedAt: new Date("2026-08-03T12:05:00.000Z"),
    });
    let selectCall = 0;
    mocks.canApplyPaymentIntentCanceled.mockImplementation(
      ({ orderStatus, storedPaymentIntentId, eventPaymentIntentId, inventoryReleasedAt }) =>
        orderStatus === "pending" &&
        storedPaymentIntentId === eventPaymentIntentId &&
        inventoryReleasedAt === null,
    );
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn().mockImplementation(async () => {
              selectCall += 1;
              return selectCall === 1
                ? [
                    {
                      id: "order_pending",
                      status: "pending",
                      paymentStatus: "pending",
                      stripePaymentIntentId: "pi_cancelled",
                      inventoryReleasedAt: null,
                    },
                  ]
                : [
                    {
                      id: "order_pending",
                      status: "cancelled",
                      paymentStatus: "failed",
                      stripePaymentIntentId: "pi_cancelled",
                      inventoryReleasedAt: new Date("2026-08-03T12:06:00.000Z"),
                    },
                  ];
            }),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: "order_pending" }]),
          })),
        })),
      })),
    };
    mocks.dbTransaction.mockImplementation(async (callback) => callback(tx));

    const firstResult = await processStripeWebhookEvent("evt_pi_canceled");
    const secondResult = await processStripeWebhookEvent("evt_pi_canceled");

    expect(firstResult).toEqual({ processed: true });
    expect(secondResult).toEqual({ processed: true });
    expect(mocks.releaseReservedInventory).toHaveBeenCalledTimes(1);
  });
});
