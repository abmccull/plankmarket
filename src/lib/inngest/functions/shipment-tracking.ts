import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { inngest } from "../client";
import { PLANKMARKET_EVENTS } from "../events";
import { db } from "@/server/db";
import { shipments, orders } from "@/server/db/schema";
import { priority1 } from "@/server/services/priority1";
import {
  Priority1ShipmentMatchError,
  selectPriority1Shipment,
} from "@/server/services/priority1-selection";
import { openReconciliationCase } from "@/server/services/reconciliation-cases";
import {
  getShipmentIdentifier,
  mapPriority1ShipmentStatus,
  mergeTrackingEvents,
  shouldEmitProviderPickupEvent,
} from "@/server/services/shipping-workflow";
import {
  fetchPriority1BillOfLadingUrl,
  fetchPriority1DocumentUrl,
  fetchPriority1PalletLabelUrl,
  shipmentDocumentIdentifiersFrom,
} from "@/server/services/shipment-documents";

const TRACKING_BATCH_SIZE = 20;
const TRACKING_CONCURRENCY = 4;
const TERMINAL_ORDER_STATUSES = ["cancelled", "refunded"] as const;

interface ShipmentTrackingPageEvent {
  data: {
    scanStartedAt: string;
    afterUpdatedAt?: string;
    afterShipmentId?: string;
  };
}

type ActiveShipment = Awaited<ReturnType<typeof loadActiveShipments>>[number];

function buildTrackingCursorWhere(input: {
  scanStartedAt: Date;
  afterUpdatedAt?: Date;
  afterShipmentId?: string;
}) {
  const baseWhere = and(
    or(
      inArray(shipments.status, [
        "dispatched",
        "in_transit",
        "out_for_delivery",
        "exception",
        "delivered",
      ]),
      and(
        eq(shipments.status, "pending"),
        sql`${shipments.dispatchAttemptedAt} is not null`,
      ),
    ),
    // Never overwrite rows mid-cancellation.
    isNull(shipments.cancellationRequestedAt),
    isNull(shipments.cancellationClaimToken),
    lte(shipments.updatedAt, input.scanStartedAt),
  );

  if (!input.afterUpdatedAt || !input.afterShipmentId) {
    return baseWhere;
  }

  return and(
    baseWhere,
    or(
      gt(shipments.updatedAt, input.afterUpdatedAt),
      and(
        eq(shipments.updatedAt, input.afterUpdatedAt),
        gt(shipments.id, input.afterShipmentId),
      ),
    ),
  );
}

async function loadActiveShipments(input: {
  scanStartedAt: Date;
  afterUpdatedAt?: Date;
  afterShipmentId?: string;
}) {
  return db.query.shipments.findMany({
    where: buildTrackingCursorWhere(input),
    orderBy: [asc(shipments.updatedAt), asc(shipments.id)],
    limit: TRACKING_BATCH_SIZE + 1,
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
  const deliveredAt = statusUpdate.deliveredAt ?? new Date();
  const needsPickupEvent = shouldEmitProviderPickupEvent({
    statusUpdate,
    orderStatus: shipment.order.status,
    shippedAt: shipment.order.shippedAt,
    dryRun: providerDryRun,
  });

  // Persist identifiers from live status so document recovery can run.
  // Prefer already-stored values; fill gaps from provider status only.
  const statusProNumber = getShipmentIdentifier(
    providerShipment.shipmentIdentifiers,
    "PRO",
  );
  const statusBolNumber = getShipmentIdentifier(
    providerShipment.shipmentIdentifiers,
    "BILL_OF_LADING",
  );
  const proNumber = shipment.proNumber || statusProNumber || null;
  const bolNumber = shipment.bolNumber || statusBolNumber || null;
  const trackingNumber =
    shipment.order.trackingNumber ||
    statusProNumber ||
    statusBolNumber ||
    null;

  let deliveryReceiptUrl = shipment.deliveryReceiptUrl;
  let bolUrl = shipment.bolUrl;
  let labelUrl = shipment.labelUrl;
  let documentError: string | null = null;
  const documentIdentifiers = shipmentDocumentIdentifiersFrom({
    proNumber,
    bolNumber,
    trackingNumber,
  });

  // Backfill missing BOL / labels while shipment is active.
  let bolBackfillFailed = false;
  let labelBackfillFailed = false;
  let permanentDocFailure: string | null = null;
  if (
    !bolUrl &&
    documentIdentifiers.length > 0 &&
    statusUpdate.mappedStatus !== "cancelled"
  ) {
    const fetchedBol = await fetchPriority1BillOfLadingUrl(documentIdentifiers);
    if (fetchedBol.url) {
      bolUrl = fetchedBol.url;
    } else if (!shipment.bolUrl) {
      bolBackfillFailed = true;
      if (fetchedBol.permanent && fetchedBol.error) {
        permanentDocFailure = fetchedBol.error;
      }
    }
  }

  if (
    !labelUrl &&
    documentIdentifiers.length > 0 &&
    statusUpdate.mappedStatus !== "cancelled"
  ) {
    const fetchedLabel =
      await fetchPriority1PalletLabelUrl(documentIdentifiers);
    if (fetchedLabel.url) {
      labelUrl = fetchedLabel.url;
    } else if (!shipment.labelUrl) {
      labelBackfillFailed = true;
      if (fetchedLabel.permanent && fetchedLabel.error) {
        permanentDocFailure = permanentDocFailure
          ? `${permanentDocFailure}; ${fetchedLabel.error}`
          : fetchedLabel.error;
      }
    }
  }

  if (
    statusUpdate.delivered &&
    statusUpdate.pickupConfirmed &&
    !deliveryReceiptUrl
  ) {
    if (documentIdentifiers.length > 0) {
      const receipt = await fetchPriority1DocumentUrl(
        "DeliveryReceipt",
        documentIdentifiers,
      );
      deliveryReceiptUrl = receipt.url;
      if (!receipt.url && receipt.error) {
        documentError = `Delivery receipt unavailable: ${receipt.error}`;
      }
    }
  }

  if (statusUpdate.mappedStatus === "cancelled") {
    await openReconciliationCase(db, {
      caseKey: `shipment-provider-cancelled:${shipment.orderId}`,
      type: "shipment_ambiguity",
      source: "priority1",
      severity: "high",
      title: "Priority1 shipment is cancelled",
      summary: "Priority1 reports the shipment as cancelled; order requires reconciliation.",
      orderId: shipment.orderId,
      externalReference:
        shipment.priority1ShipmentId ?? String(providerShipment.id),
      details: {
        shipmentId: shipment.id,
        orderNumber: shipment.order.orderNumber,
        priority1ShipmentId: String(providerShipment.id),
        proNumber,
        bolNumber,
      },
    });
  }

  // Persist provider evidence before emitting the payout-triggering event so
  // its handler can prove this is a real Priority1 pickup from the database.
  // CAS: never overwrite cancelled or cancel-claimed rows.
  const [persistedShipment] = await db
    .update(shipments)
    .set({
    status: statusUpdate.mappedStatus,
    trackingEvents: mergedTrackingEvents,
    carrierScac: providerShipment.carrierCode || shipment.carrierScac,
    carrierName: providerShipment.carrierName || shipment.carrierName,
    priority1ShipmentId:
      shipment.priority1ShipmentId ?? String(providerShipment.id),
    proNumber: proNumber ?? shipment.proNumber,
    bolNumber: bolNumber ?? shipment.bolNumber,
    isDryRun: providerDryRun,
    bolUrl,
    labelUrl,
    deliveryReceiptUrl,
    deliveredAt: statusUpdate.delivered
      ? deliveredAt
      : shipment.deliveredAt,
    lastError:
      statusUpdate.mappedStatus === "cancelled"
        ? "Priority1 shipment is cancelled; order requires reconciliation"
        : documentError
          ? documentError
          : permanentDocFailure
            ? `Permanent document recovery failure: ${permanentDocFailure}`
            : !bolUrl && bolBackfillFailed
              ? "BOL document not yet available from Priority1"
              : !labelUrl && labelBackfillFailed
                ? "Pallet labels not yet available from Priority1"
                : bolUrl && labelUrl
                  ? null
                  : shipment.lastError,
    updatedAt: new Date(),
    })
    .where(
      and(
        eq(shipments.id, shipment.id),
        notInArray(shipments.status, ["cancelled"]),
        isNull(shipments.cancellationRequestedAt),
        isNull(shipments.cancellationClaimToken),
      ),
    )
    .returning({ id: shipments.id });

  if (!persistedShipment) {
    return { updated: false, delivered: 0 };
  }

  if (permanentDocFailure) {
    await openReconciliationCase(db, {
      caseKey: `shipment-docs-permanent:${shipment.orderId}`,
      type: "shipment_ambiguity",
      source: "priority1",
      severity: "high",
      title: "Permanent freight document recovery failure",
      summary: `Permanent document recovery failure: ${permanentDocFailure}`,
      orderId: shipment.orderId,
      externalReference:
        shipment.priority1ShipmentId ?? String(providerShipment.id),
      details: {
        shipmentId: shipment.id,
        priority1ShipmentId: String(providerShipment.id),
        proNumber,
        bolNumber,
        bolUrl,
        labelUrl,
      },
    });
  }

  if (
    trackingNumber &&
    trackingNumber !== shipment.order.trackingNumber
  ) {
    await db
      .update(orders)
      .set({
        trackingNumber,
        ...(providerShipment.carrierName
          ? { carrier: providerShipment.carrierName }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, shipment.orderId));
  }

  if (needsPickupEvent) {
    if (!statusUpdate.pickupConfirmedAt) {
      throw new Error(
        "Priority1 pickup event requires persisted authoritative pickup evidence",
      );
    }

    await inngest.send({
      id: `priority1-pickup-${shipment.id}`,
      name: "order/picked-up",
      data: {
        orderId: shipment.orderId,
        pickedUpAt: statusUpdate.pickupConfirmedAt.toISOString(),
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
    if (!statusUpdate.pickupConfirmedAt) {
      throw new Error(
        "Priority1 shipment cannot persist shippedAt without pickup evidence",
      );
    }

    await db
      .update(orders)
      .set({
        status: statusUpdate.delivered ? "delivered" : "shipped",
        shippedAt:
          shipment.order.shippedAt ?? statusUpdate.pickupConfirmedAt,
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
  const results = await pollActiveShipmentsPage({
    scanStartedAt: new Date().toISOString(),
  });
  return {
    processed: results.processed,
    updated: results.updated,
    delivered: results.delivered,
    errors: results.errors,
  };
}

export async function pollActiveShipmentsPage(
  eventData: ShipmentTrackingPageEvent["data"],
) {
  const scanStartedAt = new Date(eventData.scanStartedAt);
  const afterUpdatedAt = eventData.afterUpdatedAt
    ? new Date(eventData.afterUpdatedAt)
    : undefined;
  const activeShipmentsRaw = await loadActiveShipments({
    scanStartedAt,
    afterUpdatedAt,
    afterShipmentId: eventData.afterShipmentId,
  });
  const hasMore = activeShipmentsRaw.length > TRACKING_BATCH_SIZE;
  const activeShipments = activeShipmentsRaw.slice(0, TRACKING_BATCH_SIZE);
  if (activeShipments.length === 0) {
    return {
      processed: 0,
      updated: 0,
      delivered: 0,
      errors: 0,
      nextCursor: null,
    };
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
    // Do not bump updatedAt — scan cursor is scanStartedAt and retries must
    // still see this row on the same Inngest page retry.
    await db
      .update(shipments)
      .set({ lastError: errorMessage })
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

  const lastShipment = activeShipments.at(-1);

  return {
    processed: activeShipments.length,
    updated,
    delivered,
    errors,
    nextCursor:
      hasMore && lastShipment
        ? {
            afterUpdatedAt: lastShipment.updatedAt.toISOString(),
            afterShipmentId: lastShipment.id,
          }
        : null,
  };
}

export const shipmentTrackingScheduler = inngest.createFunction(
  {
    id: "shipment-tracking-scheduler",
    name: "Queue Priority1 Shipment Tracking Poll",
    retries: 2,
    concurrency: { limit: 1 },
  },
  { cron: "0 */2 * * *" },
  async ({ step }) => {
    const scanStartedAt = new Date().toISOString();
    await step.sendEvent("queue-shipment-tracking-page", {
      id: `shipment-tracking:${scanStartedAt}`,
      name: PLANKMARKET_EVENTS.shipmentTrackingPage,
      data: { scanStartedAt },
    });
    return { queued: true, scanStartedAt };
  },
);

export const shipmentTracking = inngest.createFunction(
  {
    id: "shipment-tracking-poll",
    name: "Poll Priority1 Shipment Tracking",
    retries: 3,
    concurrency: { limit: 1 },
  },
  { event: PLANKMARKET_EVENTS.shipmentTrackingPage },
  async ({ event, step }) => {
    const page = event.data as ShipmentTrackingPageEvent["data"];
    const results = await step.run("poll-active-shipments-page", async () => {
      return pollActiveShipmentsPage(page);
    });
    if (results.processed > 0 && results.errors === results.processed) {
      throw new Error("Every Priority1 shipment tracking request failed");
    }
    if (results.nextCursor) {
      await step.sendEvent("queue-next-shipment-tracking-page", {
        id: `shipment-tracking:${page.scanStartedAt}:${results.nextCursor.afterUpdatedAt}:${results.nextCursor.afterShipmentId}`,
        name: PLANKMARKET_EVENTS.shipmentTrackingPage,
        data: {
          scanStartedAt: page.scanStartedAt,
          afterUpdatedAt: results.nextCursor.afterUpdatedAt,
          afterShipmentId: results.nextCursor.afterShipmentId,
        },
      });
    }
    return results;
  },
);
