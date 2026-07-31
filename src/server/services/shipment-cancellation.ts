import { eq } from "drizzle-orm";
import { db, type Database } from "@/server/db";
import { orders, shipments } from "@/server/db/schema";
import { Priority1ApiError, priority1 } from "./priority1";
import { selectPriority1Shipment } from "./priority1-selection";
import { mapPriority1ShipmentStatus } from "./shipping-workflow";

type DbExecutor =
  | Database
  | Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface ShipmentCancellationResult {
  cancelled: boolean;
  shipmentId?: string;
  priority1ShipmentId?: string;
  reason?: string;
}

export class ShipmentCancellationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ShipmentCancellationError";
  }
}

async function cancelWithLockedOrder(
  executor: DbExecutor,
  orderId: string,
): Promise<ShipmentCancellationResult> {
  const [order] = await executor
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update");
  if (!order) return { cancelled: false, reason: "Order not found" };

  const [shipment] = await executor
    .select()
    .from(shipments)
    .where(eq(shipments.orderId, orderId))
    .for("update");
  if (!shipment) {
    return { cancelled: false, reason: "No freight shipment exists" };
  }
  if (shipment.status === "cancelled") {
    return {
      cancelled: true,
      shipmentId: shipment.id,
      priority1ShipmentId: shipment.priority1ShipmentId ?? undefined,
      reason: "Shipment was already cancelled",
    };
  }
  if (shipment.status === "delivered") {
    throw new ShipmentCancellationError("Delivered freight cannot be cancelled");
  }

  let priority1ShipmentId = shipment.priority1ShipmentId;
  let providerAlreadyCancelled = false;
  try {
    const refreshProviderStatus = async () => {
      const response = await priority1.getStatus({
        identifierType: "CUSTOMER_REFERENCE",
        identifierValue: order.orderNumber,
      });
      const providerShipment = selectPriority1Shipment(
        response,
        priority1ShipmentId,
      );
      if (!providerShipment) return;

      const discoveredShipmentId = String(providerShipment.id);
      const mapped = mapPriority1ShipmentStatus(
        shipment.status,
        providerShipment,
      );
      if (mapped.mappedStatus === "delivered") {
        throw new ShipmentCancellationError(
          "Priority1 reports this shipment as delivered",
        );
      }
      providerAlreadyCancelled = mapped.mappedStatus === "cancelled";
      priority1ShipmentId = discoveredShipmentId;
    };

    if (!priority1.isDryRun()) {
      try {
        await refreshProviderStatus();
      } catch (error) {
        if (!(error instanceof Priority1ApiError && error.status === 404)) {
          throw error;
        }
      }
    }
    if (
      !priority1.isDryRun() &&
      shipment.dispatchAttemptedAt &&
      !priority1ShipmentId
    ) {
      throw new ShipmentCancellationError(
        "A prior Priority1 dispatch attempt could not be reconciled; provider cancellation requires manual review",
      );
    }

    if (priority1ShipmentId && !providerAlreadyCancelled) {
      const numericId = Number(priority1ShipmentId);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        throw new Error("Shipment has an invalid Priority1 shipment ID");
      }
      try {
        await priority1.cancel({ id: numericId });
      } catch (cancelError) {
        // A provider timeout can happen after Priority1 commits the
        // cancellation. Re-read by the stable order reference before deciding
        // that the cancellation failed so a retry cannot duplicate or undo it.
        if (!priority1.isDryRun()) {
          try {
            await refreshProviderStatus();
          } catch {
            throw cancelError;
          }
        }
        if (!providerAlreadyCancelled) throw cancelError;
      }
    }

    await executor
      .update(shipments)
      .set({
        priority1ShipmentId,
        status: "cancelled",
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));

    return {
      cancelled: true,
      shipmentId: shipment.id,
      priority1ShipmentId: priority1ShipmentId ?? undefined,
      reason: priority1ShipmentId
        ? "Priority1 shipment cancelled"
        : "Pending local shipment cancelled before provider dispatch",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown freight cancellation error";
    await executor
      .update(shipments)
      .set({ lastError: message, updatedAt: new Date() })
      .where(eq(shipments.id, shipment.id));
    throw error instanceof ShipmentCancellationError
      ? error
      : new ShipmentCancellationError(message, { cause: error });
  }
}

/**
 * Cancel freight while holding the order row lock used by dispatch/refund.
 * Passing an existing transaction keeps shipment cancellation and the caller's
 * financial state transition in one serialized unit.
 */
export async function cancelPriority1ShipmentForOrder(
  orderId: string,
  executor?: DbExecutor,
): Promise<ShipmentCancellationResult> {
  if (executor && !("transaction" in executor)) {
    return cancelWithLockedOrder(executor, orderId);
  }
  if (executor && "transaction" in executor) {
    return executor.transaction((tx) => cancelWithLockedOrder(tx, orderId));
  }

  try {
    return await db.transaction((tx) => cancelWithLockedOrder(tx, orderId));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown freight cancellation error";
    await db
      .update(shipments)
      .set({ lastError: message, updatedAt: new Date() })
      .where(eq(shipments.orderId, orderId));
    throw error;
  }
}
