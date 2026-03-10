import { inngest } from "../client";
import { db } from "@/server/db";
import { orders, shipments } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { priority1 } from "@/server/services/priority1";
import { buildDispatchRequestForOrder } from "@/server/services/shipping-workflow";

export async function dispatchShipmentForOrder(orderId: string) {
  // 1. Fetch order with listing, seller, buyer relations
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: {
      listing: true,
      seller: true,
      buyer: true,
    },
  });

  if (!order) return { dispatched: false, reason: "Order not found" };

  // 2. Skip if no selectedQuoteId (manual shipping / legacy order)
  if (!order.selectedQuoteId) {
    return {
      dispatched: false,
      reason: "No shipping quote selected (manual shipping)",
    };
  }

  // 3. Check idempotency - shipment already exists?
  const existing = await db.query.shipments.findFirst({
    where: eq(shipments.orderId, orderId),
  });
  if (existing) {
    return {
      dispatched: false,
      reason: "Shipment already exists",
      shipmentId: existing.id,
    };
  }

  // 4. Create shipments record with status "pending"
  const [shipment] = await db
    .insert(shipments)
    .values({
      orderId,
      quoteId: order.selectedQuoteId,
      carrierName: order.selectedCarrier ?? undefined,
      status: "pending",
    })
    .returning();

  try {
    const { pickupDate, request } = buildDispatchRequestForOrder({
      order,
      listing: order.listing,
      seller: order.seller,
      buyer: order.buyer,
    });

    const dispatchResult = await priority1.dispatch(request);

    // 7. Extract BOL number (proNumber) from shipment identifiers
    const bolIdentifier = dispatchResult.shipmentIdentifiers.find(
      (si) => si.type === "BILL_OF_LADING"
    );
    const proNumber = bolIdentifier?.value;

    // 8. Update shipment record
    await db
      .update(shipments)
      .set({
        priority1ShipmentId: String(dispatchResult.id),
        proNumber,
        bolUrl: dispatchResult.capacityProviderBolUrl,
        labelUrl: dispatchResult.capacityProviderPalletLabelUrl,
        status: "dispatched",
        dispatchedAt: new Date(),
        pickupDate: pickupDate,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));

    // 9. Update order with tracking info
    await db
      .update(orders)
      .set({
        trackingNumber: proNumber,
        carrier: order.selectedCarrier ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    return {
      dispatched: true,
      shipmentId: shipment.id,
      priority1Id: dispatchResult.id,
      proNumber,
    };
  } catch (error) {
    // On failure: store error, shipment stays "pending" for admin intervention
    const errorMessage =
      error instanceof Error ? error.message : "Unknown dispatch error";
    await db
      .update(shipments)
      .set({
        lastError: errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));

    return {
      dispatched: false,
      reason: errorMessage,
      shipmentId: shipment.id,
    };
  }
}

export const shipmentDispatch = inngest.createFunction(
  { id: "shipment-dispatch", name: "Auto-dispatch Shipment via Priority1" },
  { event: "order/paid" },
  async ({ event, step }) => {
    const { orderId } = event.data as { orderId: string };

    const result = await step.run("dispatch-shipment", async () => {
      return dispatchShipmentForOrder(orderId);
    });

    return result;
  }
);
