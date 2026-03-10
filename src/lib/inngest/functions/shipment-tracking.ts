import { inngest } from "../client";
import { db } from "@/server/db";
import { shipments, orders } from "@/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { priority1 } from "@/server/services/priority1";
import { mapPriority1ShipmentStatus } from "@/server/services/shipping-workflow";

export async function pollActiveShipments() {
  // Query all shipments with active statuses
  const activeShipments = await db.query.shipments.findMany({
    where: inArray(shipments.status, [
      "dispatched",
      "in_transit",
      "out_for_delivery",
    ]),
  });

  if (activeShipments.length === 0) {
    return { processed: 0, updated: 0, delivered: 0, errors: 0 };
  }

  let updated = 0;
  let delivered = 0;
  let errors = 0;

  for (const shipment of activeShipments) {
    try {
      if (!shipment.proNumber && !shipment.priority1ShipmentId) continue;

      // Get status from Priority1
      const statusResponse = await priority1.getStatus({
        identifierType: "BILL_OF_LADING",
        identifierValue: shipment.proNumber || shipment.priority1ShipmentId!,
      });

      if (!statusResponse.shipments || statusResponse.shipments.length === 0)
        continue;

      const p1Shipment = statusResponse.shipments[0];
      const statusUpdate = mapPriority1ShipmentStatus(
        shipment.status,
        p1Shipment,
      );

      const updateData: Record<string, unknown> = {
        status: statusUpdate.mappedStatus,
        trackingEvents: statusUpdate.trackingEvents,
        carrierScac: p1Shipment.carrierCode || shipment.carrierScac,
        carrierName: p1Shipment.carrierName || shipment.carrierName,
        lastError: null,
        updatedAt: new Date(),
      };

      if (statusUpdate.pickedUp) {
        await db
          .update(orders)
          .set({
            status: "shipped",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, shipment.orderId));

        await inngest.send({
          name: "order/picked-up",
          data: {
            orderId: shipment.orderId,
            pickedUpAt: new Date().toISOString(),
          },
        });
      }

      if (statusUpdate.delivered && !shipment.deliveredAt) {
        updateData.deliveredAt = new Date();
        delivered++;

        await db
          .update(orders)
          .set({
            status: "delivered",
            deliveredAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, shipment.orderId));

        try {
          if (shipment.proNumber) {
            const receipt = await priority1.getDocuments({
              shipmentImageTypeId: "DeliveryReceipt",
              imageFormatTypeId: "PDF",
              proNumber: shipment.proNumber,
            });
            if (receipt.imageUrl) {
              updateData.deliveryReceiptUrl = receipt.imageUrl;
            }
          }
        } catch {
          // Non-fatal - continue without receipt
        }
      }

      if (
        statusUpdate.mappedStatus !== shipment.status ||
        statusUpdate.trackingEvents.length > 0
      ) {
        await db
          .update(shipments)
          .set(updateData)
          .where(eq(shipments.id, shipment.id));
        updated++;
      }
    } catch (err) {
      errors++;
      const errorMessage =
        err instanceof Error ? err.message : "Unknown tracking error";
      await db
        .update(shipments)
        .set({ lastError: errorMessage, updatedAt: new Date() })
        .where(eq(shipments.id, shipment.id));
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
  { id: "shipment-tracking-poll", name: "Poll Priority1 Shipment Tracking" },
  { cron: "0 */2 * * *" }, // Every 2 hours
  async ({ step }) => {
    const results = await step.run("poll-active-shipments", async () => {
      return pollActiveShipments();
    });

    return results;
  }
);
