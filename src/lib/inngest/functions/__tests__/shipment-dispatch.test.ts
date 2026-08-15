import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    order: null as Record<string, unknown> | null,
    shipment: null as Record<string, unknown> | null,
    openDispute: null as Record<string, unknown> | null,
    transactionPlans: [] as Array<{ selectResults: unknown[][] }>,
    updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  };

  const recordUpdate = (table: unknown, values: Record<string, unknown>) => {
    state.updates.push({ table, values });
    return [];
  };

  const makeTx = (plan: { selectResults: unknown[][] }) => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn(async () => plan.selectResults.shift() ?? []),
          limit: vi.fn(async () => plan.selectResults.shift() ?? []),
        })),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => recordUpdate(table, values)),
      })),
    })),
  });

  return {
    state,
    getOrder: vi.fn(async () => state.order),
    getShipment: vi.fn(async () => state.shipment),
    getDispute: vi.fn(async () => state.openDispute),
    transaction: vi.fn(async (callback: (tx: ReturnType<typeof makeTx>) => unknown) => {
      const plan = state.transactionPlans.shift();
      if (!plan) throw new Error("Unexpected transaction");
      return callback(makeTx(plan));
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => []),
        })),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => recordUpdate(table, values)),
      })),
    })),
    redisSet: vi.fn(async () => "OK"),
    redisEval: vi.fn(async () => 1),
    getStatus: vi.fn(),
    dispatch: vi.fn(),
    cancel: vi.fn(),
    isDryRun: vi.fn(() => false),
    openReconciliationCase: vi.fn(async () => ({})),
    processOrderRefund: vi.fn(),
    sendOrderConfirmationEmail: vi.fn(),
    sendSellerPaidOrderEmail: vi.fn(),
    createFunction: vi.fn((_config, _trigger, handler) => handler),
    buildDispatchRequestForOrder: vi.fn(() => ({
      pickupDate: new Date("2026-07-31T10:00:00.000Z"),
      request: { shipment: "request" },
    })),
    getOrderDispatchIneligibilityReason: vi.fn((params: { orderStatus: string }) =>
      params.orderStatus === "cancelled" ? "Order is cancelled" : null,
    ),
    getShipmentIdentifier: vi.fn(
      (
        identifiers: Array<{ type: string; value: string }>,
        type: string,
      ) => identifiers.find((identifier) => identifier.type === type)?.value,
    ),
    mapPriority1ShipmentStatus: vi.fn(
      (_status: string, shipment: { status?: string }) => ({
        mappedStatus:
          shipment.status === "Canceled" ? "cancelled" : "dispatched",
        trackingEvents: [],
        deliveredAt: null,
      }),
    ),
    mergeTrackingEvents: vi.fn((_existing: unknown, next: unknown) => next),
    requireShippingBookingSnapshotForOrder: vi.fn(() => ({
      carrierName: "Acme Freight",
      carrierScac: "ACME",
      carrierRate: 450,
    })),
  };
});

vi.mock("../../client", () => ({
  inngest: {
    createFunction: mocks.createFunction,
  },
}));

vi.mock("@/lib/redis/client", () => ({
  redis: {
    set: mocks.redisSet,
    eval: mocks.redisEval,
  },
}));

vi.mock("@/server/db", () => ({
  db: {
    query: {
      orders: {
        findFirst: mocks.getOrder,
      },
      shipments: {
        findFirst: mocks.getShipment,
      },
      disputes: {
        findFirst: mocks.getDispute,
      },
    },
    transaction: mocks.transaction,
    insert: mocks.insert,
    update: mocks.update,
  },
}));

vi.mock("@/server/services/priority1", () => ({
  Priority1ApiError: class Priority1ApiError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
      super(message);
      this.name = "Priority1ApiError";
      this.status = status;
    }
  },
  priority1: {
    getStatus: mocks.getStatus,
    dispatch: mocks.dispatch,
    cancel: mocks.cancel,
    isDryRun: mocks.isDryRun,
  },
}));

vi.mock("@/server/services/priority1-selection", () => ({
  Priority1ShipmentMatchError: class Priority1ShipmentMatchError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "Priority1ShipmentMatchError";
    }
  },
  selectPriority1Shipment: vi.fn(
    (
      response: { shipments?: Array<Record<string, unknown>> },
      expectedShipmentId?: string | null,
    ) => {
      const shipments = response.shipments ?? [];
      if (expectedShipmentId) {
        return (
          shipments.find(
            (shipment) => String(shipment.id) === expectedShipmentId,
          ) ?? null
        );
      }
      return shipments.length === 1 ? shipments[0] : null;
    },
  ),
}));

vi.mock("@/server/services/shipping-workflow", () => {
  class ShippingBookingReviewError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ShippingBookingReviewError";
    }
  }

  class ShippingQuoteUnbookableError extends ShippingBookingReviewError {
    constructor(message: string) {
      super(message);
      this.name = "ShippingQuoteUnbookableError";
    }
  }

  return {
    buildDispatchRequestForOrder: mocks.buildDispatchRequestForOrder,
    getOrderDispatchIneligibilityReason: mocks.getOrderDispatchIneligibilityReason,
    getShipmentIdentifier: mocks.getShipmentIdentifier,
    requireLiveDispatchShipmentId: (id: unknown) => {
      if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
        throw new Error(
          "Priority1 dispatch response did not include a shipment ID",
        );
      }
      return id;
    },
    mapPriority1ShipmentStatus: mocks.mapPriority1ShipmentStatus,
    mergeTrackingEvents: mocks.mergeTrackingEvents,
    requireShippingBookingSnapshotForOrder:
      mocks.requireShippingBookingSnapshotForOrder,
    ShippingBookingReviewError,
    ShippingQuoteUnbookableError,
  };
});

vi.mock("@/server/services/refund", () => ({
  processOrderRefund: mocks.processOrderRefund,
}));

vi.mock("@/server/services/reconciliation-cases", () => ({
  openReconciliationCase: mocks.openReconciliationCase,
}));

vi.mock("@/lib/email/send", () => ({
  sendOrderConfirmationEmail: mocks.sendOrderConfirmationEmail,
  sendSellerPaidOrderEmail: mocks.sendSellerPaidOrderEmail,
}));

import { dispatchShipmentForOrder } from "../shipment-dispatch";

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order_1",
    orderNumber: "PM-1001",
    paymentStatus: "succeeded",
    escrowStatus: "held",
    status: "confirmed",
    inventoryReleasedAt: null,
    selectedQuoteId: "quote_1",
    selectedCarrier: "Acme Freight",
    shippingBookingSnapshot: { committed: true },
    buyer: { id: "buyer_1" },
    ...overrides,
  };
}

function baseShipment(overrides: Record<string, unknown> = {}) {
  return {
    id: "shipment_1",
    orderId: "order_1",
    status: "pending",
    dispatchAttemptedAt: null,
    priority1ShipmentId: null,
    isDryRun: false,
    carrierName: "Acme Freight",
    carrierScac: "ACME",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.order = baseOrder();
  mocks.state.shipment = baseShipment();
  mocks.state.openDispute = null;
  mocks.state.transactionPlans = [];
  mocks.state.updates = [];
  mocks.redisSet.mockResolvedValue("OK");
  mocks.redisEval.mockResolvedValue(1);
  mocks.isDryRun.mockReturnValue(false);
  mocks.getStatus.mockResolvedValue({ shipments: [] });
  mocks.dispatch.mockResolvedValue({
    id: 9001,
    shipmentIdentifiers: [
      { type: "PRO", value: "PRO-9001", primaryForType: true },
      { type: "BILL_OF_LADING", value: "BOL-9001", primaryForType: true },
    ],
    capacityProviderBolUrl: "https://priority1.example/bol/9001.pdf",
    capacityProviderPalletLabelUrl: "https://priority1.example/labels/9001.pdf",
    totalCost: 450,
  });
  mocks.cancel.mockResolvedValue(undefined);
});

describe("dispatchShipmentForOrder", () => {
  it("persists provider-labelled PRO and BOL identifiers separately", async () => {
    mocks.state.transactionPlans = [
      {
        selectResults: [[baseOrder()], [baseShipment()], []],
      },
      {
        selectResults: [
          [baseOrder()],
          [
            baseShipment({
              dispatchAttemptedAt: new Date("2026-07-31T10:00:00.000Z"),
            }),
          ],
          [],
        ],
      },
    ];

    const result = await dispatchShipmentForOrder("order_1");

    expect(result).toMatchObject({
      dispatched: true,
      priority1Id: 9001,
      proNumber: "PRO-9001",
      bolNumber: "BOL-9001",
    });
    expect(mocks.state.updates).toContainEqual(
      expect.objectContaining({
        values: expect.objectContaining({
          priority1ShipmentId: "9001",
          proNumber: "PRO-9001",
          bolNumber: "BOL-9001",
          status: "dispatched",
        }),
      }),
    );
  });

  it("cancels a booked Priority1 shipment when the order becomes ineligible before finalization", async () => {
    mocks.state.transactionPlans = [
      {
        selectResults: [[baseOrder()], [baseShipment()], []],
      },
      {
        selectResults: [
          [baseOrder({ status: "cancelled" })],
          [baseShipment({ dispatchAttemptedAt: new Date("2026-07-31T10:00:00.000Z") })],
          [],
        ],
      },
      {
        selectResults: [
          [baseOrder({ status: "cancelled" })],
          [baseShipment({ dispatchAttemptedAt: new Date("2026-07-31T10:00:00.000Z") })],
        ],
      },
    ];

    const result = await dispatchShipmentForOrder("order_1");

    expect(result).toMatchObject({
      dispatched: false,
      cancelled: true,
      shipmentId: "shipment_1",
      priority1Id: 9001,
    });
    expect(mocks.dispatch).toHaveBeenCalledWith({ shipment: "request" });
    expect(mocks.cancel).toHaveBeenCalledWith({ id: 9001 });
    expect(mocks.state.updates).toContainEqual(
      expect.objectContaining({
        values: expect.objectContaining({
          status: "cancelled",
          priority1ShipmentId: "9001",
          carrierName: "Acme Freight",
          carrierScac: "ACME",
        }),
      }),
    );
    expect(mocks.openReconciliationCase).not.toHaveBeenCalled();
  });
});
