import { beforeEach, describe, expect, it, vi } from "vitest";
import { orders, shipments } from "@/server/db/schema";

const mocks = vi.hoisted(() => {
  class MockPriority1ApiError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
      super(message);
      this.name = "Priority1ApiError";
      this.status = status;
    }
  }

  const state = {
    order: null as Record<string, unknown> | null,
    shipment: null as Record<string, unknown> | null,
    updates: [] as Array<{ table: unknown; values: Record<string, unknown> }>,
  };

  const applyUpdate = (table: unknown, values: Record<string, unknown>) => {
    state.updates.push({ table, values });
    if (table === shipments && state.shipment) {
      state.shipment = {
        ...state.shipment,
        ...values,
      };
      return [{ id: state.shipment.id }];
    }
    return [];
  };

  const makeWhereResult = (table: unknown, values: Record<string, unknown>) => {
    let applied = false;
    const apply = () => {
      if (applied) return;
      applied = true;
      applyUpdate(table, values);
    };
    const query = Promise.resolve().then(() => {
      apply();
      return [];
    });

    return Object.assign(query, {
      returning: vi.fn(async () => {
        apply();
        return table === shipments && state.shipment
          ? [{ id: state.shipment.id }]
          : [];
      }),
    });
  };

  const makeTx = () => ({
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn(() => ({
          for: vi.fn(async () => {
            if (table === orders) {
              return state.order ? [state.order] : [];
            }
            if (table === shipments) {
              return state.shipment ? [state.shipment] : [];
            }
            return [];
          }),
        })),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => makeWhereResult(table, values)),
      })),
    })),
  });

  return {
    Priority1ApiError: MockPriority1ApiError,
    state,
    transaction: vi.fn(
      async (callback: (tx: ReturnType<typeof makeTx>) => unknown) => {
        const shipmentBefore = state.shipment ? { ...state.shipment } : null;
        const updateCountBefore = state.updates.length;
        try {
          return await callback(makeTx());
        } catch (error) {
          state.shipment = shipmentBefore;
          state.updates.splice(updateCountBefore);
          throw error;
        }
      },
    ),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          applyUpdate(table, values);
          return [];
        }),
      })),
    })),
    getStatus: vi.fn(),
    cancel: vi.fn(),
    isDryRun: vi.fn(() => false),
    openReconciliationCase: vi.fn(async () => ({})),
    selectPriority1Shipment: vi.fn(
      (
        response: { shipments?: Array<Record<string, unknown>> },
        expectedShipmentId?: string | null,
      ) => {
        const candidates = response.shipments ?? [];
        if (expectedShipmentId) {
          return (
            candidates.find(
              (shipment) => String(shipment.id) === expectedShipmentId,
            ) ?? null
          );
        }
        return candidates[0] ?? null;
      },
    ),
    mapPriority1ShipmentStatus: vi.fn(),
    makeTx,
  };
});

vi.mock("@/server/db", () => ({
  db: {
    transaction: mocks.transaction,
    update: mocks.update,
  },
}));

vi.mock("../priority1", () => ({
  Priority1ApiError: mocks.Priority1ApiError,
  priority1: {
    getStatus: mocks.getStatus,
    cancel: mocks.cancel,
    isDryRun: mocks.isDryRun,
  },
}));

vi.mock("../priority1-selection", () => ({
  selectPriority1Shipment: mocks.selectPriority1Shipment,
}));

vi.mock("../shipping-workflow", () => ({
  mapPriority1ShipmentStatus: mocks.mapPriority1ShipmentStatus,
}));

vi.mock("../reconciliation-cases", () => ({
  openReconciliationCase: mocks.openReconciliationCase,
  openReconciliationCaseInTransaction: mocks.openReconciliationCase,
}));

import {
  cancelPriority1ShipmentForOrder,
  processRequestedPriority1ShipmentCancellation,
} from "../shipment-cancellation";

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order_1",
    orderNumber: "PM-1001",
    ...overrides,
  };
}

function baseShipment(overrides: Record<string, unknown> = {}) {
  return {
    id: "shipment_1",
    orderId: "order_1",
    status: "pending",
    priority1ShipmentId: "9001",
    cancellationRequestedAt: new Date("2026-08-10T16:00:00.000Z"),
    cancellationClaimToken: null,
    cancellationClaimedAt: null,
    dispatchAttemptedAt: new Date("2026-08-10T15:00:00.000Z"),
    deliveredAt: null,
    lastError: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.order = baseOrder();
  mocks.state.shipment = baseShipment();
  mocks.state.updates = [];
  mocks.isDryRun.mockReturnValue(false);
  mocks.getStatus.mockResolvedValue({ shipments: [] });
  mocks.cancel.mockResolvedValue(undefined);
  mocks.mapPriority1ShipmentStatus.mockReturnValue({
    mappedStatus: "dispatched",
    trackingEvents: [],
    pickupConfirmed: false,
    pickupConfirmedAt: null,
    delivered: false,
    deliveredAt: null,
  });
});

describe("processRequestedPriority1ShipmentCancellation", () => {
  it("consumes a locally uncancelable shipment without a retry loop", async () => {
    mocks.state.shipment = baseShipment({
      status: "out_for_delivery",
      priority1ShipmentId: null,
    });
    mocks.getStatus.mockRejectedValue(
      new mocks.Priority1ApiError("Priority1 timeout", 500),
    );

    const result =
      await processRequestedPriority1ShipmentCancellation("order_1");

    expect(result).toMatchObject({
      cancelled: false,
      shipmentId: "shipment_1",
      reason: expect.stringContaining("can no longer be safely cancelled"),
    });
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.openReconciliationCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseKey: "shipment-cancel-terminal:order_1",
        externalReference: "PM-1001",
      }),
    );
    expect(mocks.state.shipment).toMatchObject({
      status: "out_for_delivery",
      cancellationRequestedAt: null,
      cancellationClaimToken: null,
      cancellationClaimedAt: null,
    });
  });

  it("promotes provider-delivered evidence and consumes the request", async () => {
    mocks.state.shipment = baseShipment({
      priority1ShipmentId: null,
    });
    mocks.getStatus.mockResolvedValue({
      shipments: [{ id: 9002, status: "Delivered", actualDeliveryDate: "2026-08-10T18:00:00.000Z" }],
    });
    mocks.mapPriority1ShipmentStatus.mockReturnValue({
      mappedStatus: "delivered",
      trackingEvents: [],
      pickupConfirmed: true,
      pickupConfirmedAt: new Date("2026-08-10T17:00:00.000Z"),
      delivered: true,
      deliveredAt: new Date("2026-08-10T18:00:00.000Z"),
    });

    const result =
      await processRequestedPriority1ShipmentCancellation("order_1");

    expect(result).toMatchObject({
      cancelled: false,
      shipmentId: "shipment_1",
      priority1ShipmentId: "9002",
      reason: expect.stringContaining("Priority1 reports this shipment as delivered"),
    });
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.openReconciliationCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseKey: "shipment-cancel-terminal:order_1",
        externalReference: "9002",
      }),
    );
    expect(mocks.state.shipment).toMatchObject({
      status: "delivered",
      priority1ShipmentId: "9002",
      cancellationRequestedAt: null,
      cancellationClaimToken: null,
      cancellationClaimedAt: null,
      lastError: expect.stringContaining("Priority1 reports this shipment as delivered"),
    });
    expect(mocks.state.shipment?.deliveredAt).toBeInstanceOf(Date);
  });

  it("consumes provider in-transit status as definitively uncancelable", async () => {
    mocks.state.shipment = baseShipment({
      status: "dispatched",
      priority1ShipmentId: null,
    });
    mocks.getStatus.mockResolvedValue({
      shipments: [{ id: 9010, status: "InTransit", actualPickupDate: "2026-08-10T17:00:00.000Z" }],
    });
    mocks.mapPriority1ShipmentStatus.mockReturnValue({
      mappedStatus: "in_transit",
      trackingEvents: [],
      pickupConfirmed: true,
      pickupConfirmedAt: new Date("2026-08-10T17:00:00.000Z"),
      delivered: false,
      deliveredAt: null,
    });

    const result =
      await processRequestedPriority1ShipmentCancellation("order_1");

    expect(result).toMatchObject({
      cancelled: false,
      priority1ShipmentId: "9010",
      reason: expect.stringContaining("Priority1 reports this shipment as in transit"),
    });
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.state.shipment).toMatchObject({
      status: "in_transit",
      priority1ShipmentId: "9010",
      cancellationRequestedAt: null,
      cancellationClaimToken: null,
      cancellationClaimedAt: null,
    });
  });

  it("finalizes provider-already-cancelled shipments locally and opens stable reconciliation", async () => {
    mocks.state.shipment = baseShipment({
      status: "pending",
      priority1ShipmentId: "9001",
    });
    mocks.getStatus.mockResolvedValue({
      shipments: [{ id: 9001, status: "Canceled", actualPickupDate: null, actualDeliveryDate: null }],
    });
    mocks.mapPriority1ShipmentStatus.mockReturnValue({
      mappedStatus: "cancelled",
      trackingEvents: [],
      pickupConfirmed: false,
      pickupConfirmedAt: null,
      delivered: false,
      deliveredAt: null,
    });

    const result =
      await processRequestedPriority1ShipmentCancellation("order_1");

    expect(result).toMatchObject({
      cancelled: true,
      priority1ShipmentId: "9001",
      reason: expect.stringContaining("already marked this shipment cancelled"),
    });
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.openReconciliationCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseKey: "shipment-cancel-provider-cancelled:order_1",
        externalReference: "9001",
      }),
    );
    expect(mocks.state.shipment).toMatchObject({
      status: "cancelled",
      priority1ShipmentId: "9001",
      cancellationRequestedAt: null,
      cancellationClaimToken: null,
      cancellationClaimedAt: null,
    });
  });

  it("consumes the request when pickup wins the race after provider cancellation", async () => {
    mocks.getStatus.mockResolvedValue({ shipments: [] });
    mocks.cancel.mockImplementation(async () => {
      mocks.state.shipment = {
        ...mocks.state.shipment,
        status: "delivered",
        deliveredAt: new Date("2026-08-10T18:30:00.000Z"),
      };
    });

    const result =
      await processRequestedPriority1ShipmentCancellation("order_1");

    expect(result).toMatchObject({
      cancelled: false,
      shipmentId: "shipment_1",
      reason: expect.stringContaining("already marked delivered"),
    });
    expect(mocks.openReconciliationCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseKey: "shipment-cancel-terminal:order_1",
      }),
    );
    expect(mocks.state.shipment).toMatchObject({
      status: "delivered",
      cancellationRequestedAt: null,
      cancellationClaimToken: null,
      cancellationClaimedAt: null,
    });
  });

  it("keeps the cancellation request retryable when terminal reconciliation cannot persist", async () => {
    mocks.state.shipment = baseShipment({
      status: "out_for_delivery",
      priority1ShipmentId: null,
    });
    mocks.openReconciliationCase.mockRejectedValueOnce(
      new Error("reconciliation database unavailable"),
    );

    await expect(
      processRequestedPriority1ShipmentCancellation("order_1"),
    ).rejects.toThrow("reconciliation database unavailable");

    expect(mocks.state.shipment).toMatchObject({
      status: "out_for_delivery",
      cancellationRequestedAt: expect.any(Date),
      cancellationClaimToken: null,
      cancellationClaimedAt: null,
      lastError: "reconciliation database unavailable",
    });
  });

  it("does not open terminal reconciliation after claim ownership changes", async () => {
    mocks.state.shipment = baseShipment({ priority1ShipmentId: null });
    mocks.getStatus.mockImplementation(async () => {
      if (mocks.state.shipment) {
        mocks.state.shipment.cancellationClaimToken = "new-owner-token";
      }
      return {
        shipments: [
          {
            id: 9002,
            status: "Delivered",
            actualDeliveryDate: "2026-08-10T18:00:00.000Z",
          },
        ],
      };
    });
    mocks.mapPriority1ShipmentStatus.mockReturnValue({
      mappedStatus: "delivered",
      trackingEvents: [],
      pickupConfirmed: true,
      pickupConfirmedAt: new Date("2026-08-10T17:00:00.000Z"),
      delivered: true,
      deliveredAt: new Date("2026-08-10T18:00:00.000Z"),
    });

    await expect(
      processRequestedPriority1ShipmentCancellation("order_1"),
    ).rejects.toThrow("ownership changed");

    expect(mocks.openReconciliationCase).not.toHaveBeenCalled();
  });

  it("does not open unreconciled-dispatch reconciliation after claim ownership changes", async () => {
    mocks.state.shipment = baseShipment({
      priority1ShipmentId: null,
      dispatchAttemptedAt: new Date("2026-08-10T15:00:00.000Z"),
    });
    mocks.getStatus.mockImplementation(async () => {
      if (mocks.state.shipment) {
        mocks.state.shipment.cancellationClaimToken = "new-owner-token";
      }
      return { shipments: [] };
    });

    await expect(
      processRequestedPriority1ShipmentCancellation("order_1"),
    ).rejects.toThrow("ownership changed");

    expect(mocks.openReconciliationCase).not.toHaveBeenCalled();
  });
});

describe("cancelPriority1ShipmentForOrder", () => {
  it("queues inside the caller transaction without opening a nested transaction", async () => {
    mocks.state.shipment = baseShipment({ cancellationRequestedAt: null });
    const callerTransaction = mocks.makeTx();

    const result = await cancelPriority1ShipmentForOrder(
      "order_1",
      callerTransaction as never,
    );

    expect(result).toMatchObject({
      cancelled: false,
      shipmentId: "shipment_1",
      reason: "Shipment cancellation was queued for post-transaction processing",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.getStatus).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.state.shipment).toMatchObject({
      cancellationRequestedAt: expect.any(Date),
    });
  });

  it("normalizes a fresh delivered request into terminal reconciliation", async () => {
    mocks.state.shipment = baseShipment({
      status: "delivered",
      cancellationRequestedAt: null,
      deliveredAt: new Date("2026-08-10T18:30:00.000Z"),
    });

    const result = await cancelPriority1ShipmentForOrder("order_1");

    expect(result).toMatchObject({
      cancelled: false,
      shipmentId: "shipment_1",
      reason: expect.stringContaining("already marked delivered"),
    });
    expect(mocks.openReconciliationCase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        caseKey: "shipment-cancel-terminal:order_1",
      }),
    );
    expect(mocks.state.shipment).toMatchObject({
      status: "delivered",
      cancellationRequestedAt: null,
      cancellationClaimToken: null,
    });
  });
});
