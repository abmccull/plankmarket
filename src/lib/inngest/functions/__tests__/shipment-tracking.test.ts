import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state = {
    activeShipments: [] as Array<Record<string, unknown>>,
    updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  };

  return {
    state,
    findMany: vi.fn(async () => state.activeShipments),
    getStatus: vi.fn(),
    getDocuments: vi.fn(),
    isDryRun: vi.fn(() => false),
    openReconciliationCase: vi.fn(async () => ({})),
    send: vi.fn(),
    createFunction: vi.fn((_config, _trigger, handler) => handler),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          state.updates.push({ table, values });
          return [];
        }),
      })),
    })),
  };
});

vi.mock("../../client", () => ({
  inngest: {
    send: mocks.send,
    createFunction: mocks.createFunction,
  },
}));

vi.mock("@/server/db", () => ({
  db: {
    query: {
      shipments: {
        findMany: mocks.findMany,
      },
    },
    update: mocks.update,
  },
}));

vi.mock("@/server/services/priority1", () => ({
  priority1: {
    getStatus: mocks.getStatus,
    getDocuments: mocks.getDocuments,
    isDryRun: mocks.isDryRun,
  },
}));

vi.mock("@/server/services/reconciliation-cases", () => ({
  openReconciliationCase: mocks.openReconciliationCase,
}));

import { pollActiveShipments } from "../shipment-tracking";

function activeShipment(overrides: Record<string, unknown> = {}) {
  return {
    id: "shipment_1",
    orderId: "order_1",
    status: "dispatched",
    trackingEvents: [],
    carrierScac: "TEST",
    carrierName: "Test Freight",
    priority1ShipmentId: "9001",
    isDryRun: false,
    deliveryReceiptUrl: null,
    deliveredAt: null,
    proNumber: "PRO-9001",
    order: {
      id: "order_1",
      orderNumber: "PM-SHIPTEST1",
      status: "confirmed",
      shippedAt: null,
      deliveredAt: null,
      trackingNumber: "BOL-9001",
    },
    ...overrides,
  };
}

function providerShipment(overrides: Record<string, unknown> = {}) {
  return {
    id: 9001,
    carrierCode: "TEST",
    carrierName: "Test Freight",
    status: "In Transit",
    actualPickupDate: "2026-03-11T12:00:00.000Z",
    actualDeliveryDate: null,
    shipmentIdentifiers: [
      {
        type: "CUSTOMER_REFERENCE",
        value: "PM-SHIPTEST1",
        primaryForType: true,
      },
      {
        type: "PRO",
        value: "PRO-9001",
        primaryForType: true,
      },
      {
        type: "BILL_OF_LADING",
        value: "BOL-9001",
        primaryForType: true,
      },
    ],
    trackingStatuses: [
      {
        timeStamp: "2026-03-11T12:00:00.000Z",
        city: "Salt Lake City",
        state: "UT",
        status: "PickedUp",
        statusReason: "Picked up by carrier",
      },
    ],
    totalCost: 300,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.activeShipments = [];
  mocks.state.updates = [];
  mocks.isDryRun.mockReturnValue(false);
  mocks.getDocuments.mockResolvedValue({
    imageUrl: "https://priority1.example/receipt/PRO-9001.pdf",
  });
});

describe("pollActiveShipments", () => {
  it("persists provider pickup evidence, emits a pickup event, and marks the order shipped", async () => {
    mocks.state.activeShipments = [activeShipment()];
    mocks.getStatus.mockResolvedValue({
      shipments: [providerShipment()],
    });

    const result = await pollActiveShipments();

    expect(result).toEqual({
      processed: 1,
      updated: 1,
      delivered: 0,
      errors: 0,
    });
    expect(mocks.getStatus).toHaveBeenCalledWith({
      identifierType: "CUSTOMER_REFERENCE",
      identifierValue: "PM-SHIPTEST1",
    });
    expect(mocks.send).toHaveBeenCalledWith({
      id: "priority1-pickup-shipment_1",
      name: "order/picked-up",
      data: {
        orderId: "order_1",
        pickedUpAt: "2026-03-11T12:00:00.000Z",
        pickupConfirmed: true,
        source: "priority1",
      },
    });
    expect(mocks.state.updates).toHaveLength(2);
    expect(mocks.state.updates[0]?.values).toEqual(
      expect.objectContaining({
        status: "in_transit",
        priority1ShipmentId: "9001",
        isDryRun: false,
        carrierScac: "TEST",
        carrierName: "Test Freight",
      }),
    );
    expect(mocks.state.updates[1]?.values).toEqual(
      expect.objectContaining({
        status: "shipped",
        deliveredAt: null,
      }),
    );
    expect(
      (mocks.state.updates[1]?.values.shippedAt as Date).toISOString(),
    ).toBe("2026-03-11T12:00:00.000Z");
  });

  it("captures a delivery receipt and closes the order as delivered", async () => {
    mocks.state.activeShipments = [
      activeShipment({
        status: "in_transit",
        order: {
          id: "order_1",
          orderNumber: "PM-SHIPTEST1",
          status: "shipped",
          shippedAt: new Date("2026-03-11T12:00:00.000Z"),
          deliveredAt: null,
          trackingNumber: "BOL-9001",
        },
      }),
    ];
    mocks.getStatus.mockResolvedValue({
      shipments: [
        providerShipment({
          status: "Delivered",
          actualDeliveryDate: "2026-03-14T17:00:00.000Z",
          trackingStatuses: [
            {
              timeStamp: "2026-03-11T12:00:00.000Z",
              city: "Salt Lake City",
              state: "UT",
              status: "PickedUp",
              statusReason: "Picked up by carrier",
            },
            {
              timeStamp: "2026-03-14T17:00:00.000Z",
              city: "Portland",
              state: "OR",
              status: "Delivered",
              statusReason: "Delivered",
            },
          ],
        }),
      ],
    });

    const result = await pollActiveShipments();

    expect(result).toEqual({
      processed: 1,
      updated: 1,
      delivered: 1,
      errors: 0,
    });
    expect(mocks.getDocuments).toHaveBeenCalledWith({
      shipmentImageTypeId: "DeliveryReceipt",
      imageFormatTypeId: "PDF",
      proNumber: "PRO-9001",
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.state.updates).toHaveLength(2);
    expect(mocks.state.updates[0]?.values).toEqual(
      expect.objectContaining({
        status: "delivered",
        deliveryReceiptUrl: "https://priority1.example/receipt/PRO-9001.pdf",
      }),
    );
    expect(mocks.state.updates[1]?.values).toEqual(
      expect.objectContaining({
        status: "delivered",
      }),
    );
    expect(
      (mocks.state.updates[1]?.values.deliveredAt as Date).toISOString(),
    ).toBe("2026-03-14T17:00:00.000Z");
  });

  it("selects the exact persisted provider ID when a customer reference has duplicates", async () => {
    mocks.state.activeShipments = [activeShipment()];
    mocks.getStatus.mockResolvedValue({
      shipments: [
        providerShipment({ id: 9002, carrierName: "Stale Freight" }),
        providerShipment(),
      ],
    });

    const result = await pollActiveShipments();

    expect(result.errors).toBe(0);
    expect(mocks.state.updates[0]?.values).toEqual(
      expect.objectContaining({
        priority1ShipmentId: "9001",
        carrierName: "Test Freight",
      }),
    );
  });

  it("fails closed when the persisted provider ID is absent from the response", async () => {
    mocks.state.activeShipments = [activeShipment()];
    mocks.getStatus.mockResolvedValue({
      shipments: [providerShipment({ id: 9002 })],
    });

    const result = await pollActiveShipments();

    expect(result).toEqual({
      processed: 1,
      updated: 0,
      delivered: 0,
      errors: 1,
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.state.updates).toHaveLength(1);
    expect(mocks.state.updates[0]?.values.lastError).toContain(
      "MANUAL_REVIEW_REQUIRED",
    );
    expect(mocks.openReconciliationCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseKey: "shipment-ambiguity:shipment_1",
        type: "shipment_ambiguity",
        orderId: "order_1",
      }),
    );
  });
});
