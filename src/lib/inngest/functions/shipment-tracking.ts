import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  notInArray,
  or,
} from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/server/db";
import { shipments, orders } from "@/server/db/schema";
import { priority1 } from "@/server/services/priority1";
import {
  Priority1ShipmentMatchError,
  selectPriority1Shipment,
} from "@/server/services/priority1-selection";
import { openReconciliationCase } from "@/server/services/reconciliation-cases";
import {
  mapPriority1ShipmentStatus,
  mergeTrackingEvents,
  shouldEmitProviderPickupEvent,
} from "@/server/services/shipping-workflow";

const TRACKING_BATCH_SIZE = 20;
const TRACKING_CONCURRENCY = 4;
const TERMINAL_ORDER_STATUSES = ["cancelled", "refunded"] as const;

type ActiveShipment = Awaited<ReturnType<typeof loadActiveShipments>>[number];

async function loadActiveShipments() {
  return db.query.shipments.findMany({
    where: or(
      inArray(shipments.status, [
        "dispatched",
        "in_transit",
        "out_for_delivery",
        "exception",
      ]),
      and(eq(shipments.status, "delivered"), isNull(shipments.deliveryReceiptUrl)),
    ),
    orderBy: [asc(shipments.updatedAt)],
    limit: TRACKING_BATCH_SIZE,
    with: {
      order: {
        columns: {
          id: true,
          orderNumber: true,
          status: true,
          shippedAt: true,
          deliveredAt: true,
          trackingNumber: true,
        },
      },
    },
  });
}

async function processShipment(shipment: ActiveShipment) {
  const response = await priority1.getStatus({
    identifierType: "CUSTOMER_REFERENCE",
    identifierValue: shipment.order.orderNumber,
  });
  const providerDryRun = priority1.isDryRun();
  const providerShipment = selectPriority1Shipment(
    response,
    providerDryRun ? null : shipment.priority1ShipmentId,
  );
  if (!providerShipment) {
    throw new Error("Priority1 returned no matching shipment");
  }

  const statusUpdate = mapPriority1ShipmentStatus(
    shipment.status,
    providerShipment,
  );
  const mergedTrackingEvents = mergeTrackingEvents(
    shipment.trackingEvents,
    statusUpdate.trackingEvents,
  );
  const terminalOrder = TERMINAL_ORDER_STATUSES.includes(
    shipment.order.status as (typeof TERMINAL_ORDER_STATUSES)[number],
  );
  const pickupAt = statusUpdate.pickupConfirmedAt ?? new Date();
  const deliveredAt = statusUpdate.deliveredAt ?? new Date();
  const needsPickupEvent = shouldEmitProviderPickupEvent({
    statusUpdate,
    orderStatus: shipment.order.status,
    shippedAt: shipment.order.shippedAt,
    dryRun: providerDryRun,
  });

  let deliveryReceiptUrl = shipment.deliveryReceiptUrl;
  let documentError: string | null = null;
  if (statusUpdate.delivered && !deliveryReceiptUrl) {
    try {
      const identifier = shipment.proNumber
        ? { proNumber: shipment.proNumber }
        : shipment.order.trackingNumber
          ? { bolNumber: shipment.order.trackingNumber }
          : null;
      if (identifier) {
        const receipt = await priority1.getDocuments({
          shipmentImageTypeId: "DeliveryReceipt",
          imageFormatTypeId: "PDF",
          ...identifier,
        });
        deliveryReceiptUrl = receipt.imageUrl;
      }
    } catch (error) {
      documentError =
        error instanceof Error
          ? `Delivery receipt unavailable: ${error.message}`
          : "Delivery receipt unavailable";
    }
  }

  // Persist provider evidence before emitting the payout-triggering event so
  // its handler can prove this is a real Priority1 pickup from the database.
  await db
    .update(shipments)
    .set({
      status: statusUpdate.mappedStatus,
      trackingEvents: mergedTrackingEvents,
      carrierScac: providerShipment.carrierCode || shipment.carrierScac,
      carrierName: providerShipment.carrierName || shipment.carrierName,
      priority1ShipmentId:
        shipment.priority1ShipmentId ?? String(providerShipment.id),
      isDryRun: providerDryRun,
      deliveryReceiptUrl,
      deliveredAt: statusUpdate.delivered
        ? deliveredAt
        : shipment.deliveredAt,
      lastError:
        statusUpdate.mappedStatus === "cancelled"
          ? "Priority1 shipment is cancelled; order requires reconciliation"
          : documentError,
      updatedAt: new Date(),
    })
    .where(eq(shipments.id, shipment.id));

  if (needsPickupEvent) {
    await inngest.send({
      id: `priority1-pickup-${shipment.id}`,
      name: "order/picked-up",
      data: {
        orderId: shipment.orderId,
        pickedUpAt: pickupAt.toISOString(),
        pickupConfirmed: true,
        source: "priority1",
      },
    });
  }

  if (
    !terminalOrder &&
    statusUpdate.pickupConfirmed &&
    statusUpdate.mappedStatus !== "cancelled"
  ) {
    await db
      .update(orders)
      .set({
        status: statusUpdate.delivered ? "delivered" : "shipped",
        shippedAt: shipment.order.shippedAt ?? pickupAt,
        deliveredAt: statusUpdate.delivered
          ? deliveredAt
          : shipment.order.deliveredAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orders.id, shipment.orderId),
          notInArray(orders.status, [...TERMINAL_ORDER_STATUSES]),
        ),
      );
  }

  return {
    updated: true,
    delivered:
      statusUpdate.delivered && shipment.status !== "delivered" ? 1 : 0,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(items[index]!),
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () =>
      runWorker(),
    ),
  );
  return results;
}

export async function pollActiveShipments() {
  const activeShipments = await loadActiveShipments();
  if (activeShipments.length === 0) {
    return { processed: 0, updated: 0, delivered: 0, errors: 0 };
  }

  const results = await mapWithConcurrency(
    activeShipments,
    TRACKING_CONCURRENCY,
    processShipment,
  );
  let updated = 0;
  let delivered = 0;
  let errors = 0;

  for (let index = 0; index < results.length; index++) {
    const result = results[index]!;
    const shipment = activeShipments[index]!;
    if (result.status === "fulfilled") {
      updated += result.value.updated ? 1 : 0;
      delivered += result.value.delivered;
      continue;
    }

    errors++;
    const errorMessage =
      result.reason instanceof Error
        ? result.reason.message
        : "Unknown tracking error";
    await db
      .update(shipments)
      .set({ lastError: errorMessage, updatedAt: new Date() })
      .where(eq(shipments.id, shipment.id));
    if (result.reason instanceof Priority1ShipmentMatchError) {
      await openReconciliationCase(db, {
        caseKey: `shipment-ambiguity:${shipment.id}`,
        type: "shipment_ambiguity",
        source: "priority1",
        severity: "high",
        title: "Priority1 shipment identity is ambiguous",
        summary: errorMessage,
        orderId: shipment.orderId,
        externalReference:
          shipment.priority1ShipmentId ?? shipment.order.orderNumber,
        details: {
          shipmentId: shipment.id,
          priority1ShipmentId: shipment.priority1ShipmentId,
          orderNumber: shipment.order.orderNumber,
        },
      }).catch((caseError) => {
        console.error("Failed to persist shipment reconciliation case", {
          shipmentId: shipment.id,
          caseError,
        });
      });
    }
  }

  return {
    processed: activeShipments.length,
    updated,
    delivered,
    errors,
  };
}

export const shipmentTracking = inngest.createFunction(
  {
    id: "shipment-tracking-poll",
    name: "Poll Priority1 Shipment Tracking",
    retries: 3,
    concurrency: { limit: 1 },
  },
  { cron: "0 */2 * * *" },
  async ({ step }) =>
    step.run("poll-active-shipments", async () => {
      const results = await pollActiveShipments();
      if (results.processed > 0 && results.errors === results.processed) {
        throw new Error("Every Priority1 shipment tracking request failed");
      }
      return results;
    }),
);
