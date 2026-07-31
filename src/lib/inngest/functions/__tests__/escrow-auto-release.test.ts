import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    orderRow: null as ({ id: string } & Record<string, unknown>) | null,
    openDisputes: [] as Array<{ id: string }>,
    orderUpdates: [] as Record<string, unknown>[],
    failureUpdates: [] as Record<string, unknown>[],
  };

  const tx = {
    select: vi.fn(),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            state.orderUpdates.push(values);
            return state.orderRow ? [{ id: state.orderRow.id }] : [];
          }),
        })),
      })),
    })),
  };

  const db = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          state.failureUpdates.push(values);
          return [];
        }),
      })),
    })),
  };

  return {
    state,
    tx,
    db,
    createFunction: vi.fn((_config, _trigger, handler) => handler),
    emailSend: vi.fn(),
    retrieveAccount: vi.fn(),
    retrievePaymentIntent: vi.fn(),
    retrieveCharge: vi.fn(),
    retrieveTransfer: vi.fn(),
    createTransfer: vi.fn(),
    findTransfer: vi.fn(),
  };
});

vi.mock("../../client", () => ({
  inngest: {
    createFunction: mocks.createFunction,
  },
}));

vi.mock("@/server/db", () => ({
  db: mocks.db,
}));

vi.mock("@/lib/email/delivery", () => ({
  sendEmailOrThrow: mocks.emailSend,
}));

vi.mock("@/env", () => ({
  env: {
    EMAIL_FROM: "PlankMarket <noreply@plankmarket.com>",
    NEXT_PUBLIC_APP_URL: "https://plankmarket.test",
  },
}));

vi.mock("@/lib/stripe", () => ({
  stripe: {
    accounts: { retrieve: mocks.retrieveAccount },
    paymentIntents: { retrieve: mocks.retrievePaymentIntent },
    charges: { retrieve: mocks.retrieveCharge },
    transfers: {
      retrieve: mocks.retrieveTransfer,
      create: mocks.createTransfer,
    },
  },
}));

vi.mock("@/server/services/stripe-order-transfer", () => ({
  findStripeTransferForOrder: mocks.findTransfer,
}));

import { releaseSellerPayout } from "../escrow-auto-release";

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "order_1",
    orderNumber: "PM-ORDER-1",
    createdAt: new Date("2026-07-30T12:00:00.000Z"),
    sellerId: "seller_1",
    totalPrice: 100,
    sellerPayout: 75,
    status: "shipped",
    paymentStatus: "succeeded",
    escrowStatus: "held",
    stripePaymentIntentId: "pi_1",
    stripeTransferId: null,
    selectedQuoteId: "quote_1",
    shipmentQuoteId: "quote_1",
    priority1ShipmentId: "9001",
    shipmentStatus: "in_transit",
    shipmentIsDryRun: false,
    shipmentTrackingEvents: [
      {
        timestamp: "2026-07-30T12:15:00.000Z",
        status: "in_transit",
        location: "Salt Lake City, UT",
        description: "Picked up by carrier",
      },
    ],
    sellerStripeAccountId: "acct_1",
    sellerStripeOnboardingComplete: true,
    sellerEmail: "seller@example.com",
    sellerName: "Seller User",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.orderRow = orderRow();
  mocks.state.openDisputes = [];
  mocks.state.orderUpdates = [];
  mocks.state.failureUpdates = [];

  let selectCall = 0;
  mocks.tx.select.mockImplementation(() => {
    selectCall += 1;
    if (selectCall === 1) {
      return {
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            innerJoin: vi.fn(() => ({
              where: vi.fn(() => ({
                for: vi.fn(async () =>
                  mocks.state.orderRow ? [mocks.state.orderRow] : [],
                ),
              })),
            })),
          })),
        })),
      };
    }

    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mocks.state.openDisputes),
        })),
      })),
    };
  });

  mocks.retrieveAccount.mockResolvedValue({
    payouts_enabled: true,
    capabilities: { transfers: "active" },
  });
  mocks.retrievePaymentIntent.mockResolvedValue({
    id: "pi_1",
    metadata: { orderId: "order_1" },
    status: "succeeded",
    amount_received: 10_000,
    currency: "usd",
    latest_charge: "ch_1",
  });
  mocks.retrieveCharge.mockResolvedValue({
    id: "ch_1",
    status: "succeeded",
    refunded: false,
    amount_refunded: 0,
    disputed: false,
  });
  mocks.findTransfer.mockResolvedValue({
    id: "tr_1",
    amount: 7_500,
    amount_reversed: 0,
    currency: "usd",
    destination: "acct_1",
    transfer_group: "order_order_1",
    source_transaction: "ch_1",
    metadata: { orderId: "order_1" },
  });
});

describe("releaseSellerPayout", () => {
  it("releases a payout after live pickup evidence and recovers an orphan transfer before creating a new one", async () => {
    const result = await releaseSellerPayout("order_1");

    expect(result).toEqual({
      released: true,
      orderId: "order_1",
      orderNumber: "PM-ORDER-1",
      payoutAmount: 75,
      sellerEmail: "seller@example.com",
      sellerName: "Seller User",
    });
    expect(mocks.findTransfer).toHaveBeenCalledWith({
      stripe: expect.any(Object),
      orderId: "order_1",
      orderCreatedAt: new Date("2026-07-30T12:00:00.000Z"),
      destination: "acct_1",
    });
    expect(mocks.createTransfer).not.toHaveBeenCalled();
    expect(mocks.state.orderUpdates).toHaveLength(1);
    expect(mocks.state.orderUpdates[0]).toEqual(
      expect.objectContaining({
        escrowStatus: "released",
        stripeTransferId: "tr_1",
        transferFailedAt: null,
        transferError: null,
      }),
    );
  });

  it("fails closed when shipment evidence is still dry-run or otherwise not payout-eligible", async () => {
    mocks.state.orderRow = orderRow({
      shipmentIsDryRun: true,
    });

    const result = await releaseSellerPayout("order_1");

    expect(result).toEqual({
      released: false,
      reason: "Shipment lacks live Priority1 pickup evidence",
    });
    expect(mocks.retrieveAccount).not.toHaveBeenCalled();
    expect(mocks.retrievePaymentIntent).not.toHaveBeenCalled();
    expect(mocks.findTransfer).not.toHaveBeenCalled();
    expect(mocks.state.orderUpdates).toHaveLength(0);
    expect(mocks.state.failureUpdates).toHaveLength(0);
  });

  it("fails closed for an in-transit row that has no persisted pickup event", async () => {
    mocks.state.orderRow = orderRow({
      shipmentTrackingEvents: [],
    });

    const result = await releaseSellerPayout("order_1");

    expect(result).toEqual({
      released: false,
      reason: "Shipment lacks live Priority1 pickup evidence",
    });
    expect(mocks.retrieveAccount).not.toHaveBeenCalled();
    expect(mocks.retrievePaymentIntent).not.toHaveBeenCalled();
    expect(mocks.findTransfer).not.toHaveBeenCalled();
    expect(mocks.state.orderUpdates).toHaveLength(0);
    expect(mocks.state.failureUpdates).toHaveLength(0);
  });
});
