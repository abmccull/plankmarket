import { inngest } from "../client";
import { db } from "@/server/db";
import { shipments, orders } from "@/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { priority1 } from "@/server/services/priority1";
import type { TrackingEvent } from "@/server/db/schema";

export const shipmentTracking = inngest.createFunction(
  { id: "shipment-tracking-poll", name: "Poll Priority1 Shipment Tracking" },
  { cron: "0 */2 * * *" }, // Every 2 hours
  async ({ step }) => {
    const results = await step.run("poll-active-shipments", async () => {
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
            identifierValue:
              shipment.proNumber || shipment.priority1ShipmentId!,
          });

          if (
            !statusResponse.shipments ||
            statusResponse.shipments.length === 0
          )
            continue;

          const p1Shipment = statusResponse.shipments[0];

          // Map Priority1 status to our status enum
          let mappedStatus = shipment.status;
          const p1Status = p1Shipment.status?.toLowerCase() || "";
          if (p1Status.includes("deliver") || p1Status === "completed") {
            mappedStatus = "delivered";
          } else if (p1Status.includes("out for delivery")) {
            mappedStatus = "out_for_delivery";
          } else if (
            p1Status.includes("transit") ||
            p1Status.includes("en-route") ||
            p1Status.includes("picked up")
          ) {
            mappedStatus = "in_transit";
          } else if (
            p1Status.includes("exception") ||
            p1Status.includes("error")
          ) {
            mappedStatus = "exception";
          }

          // Map tracking events
          const trackingEvents: TrackingEvent[] = (
            p1Shipment.trackingStatuses || []
          ).map((ts) => ({
            timestamp: ts.timeStamp,
            status: ts.status,
            location: [ts.city, ts.state].filter(Boolean).join(", "),
            description: ts.statusReason || ts.status,
          }));

          // Update shipment
          const updateData: Record<string, unknown> = {
            status: mappedStatus,
            trackingEvents,
            carrierScac: p1Shipment.carrierCode || shipment.carrierScac,
            carrierName: p1Shipment.carrierName || shipment.carrierName,
            lastError: null,
            updatedAt: new Date(),
          };

          // Fire escrow release when shipment is picked up (transitions to in_transit)
          if (
            mappedStatus === "in_transit" &&
            shipment.status === "dispatched"
          ) {
            // Update order status to shipped
            await db
              .update(orders)
              .set({
                status: "shipped",
                updatedAt: new Date(),
              })
              .where(eq(orders.id, shipment.orderId));

            // Fire order/picked-up event to release escrow funds to seller
            await inngest.send({
              name: "order/picked-up",
              data: {
                orderId: shipment.orderId,
                pickedUpAt: new Date().toISOString(),
              },
            });
          }

          if (mappedStatus === "delivered" && !shipment.deliveredAt) {
            updateData.deliveredAt = new Date();
            delivered++;

            // Auto-update order status to delivered
            await db
              .update(orders)
              .set({
                status: "delivered",
                deliveredAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(orders.id, shipment.orderId));

            // Try to fetch delivery receipt
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
            mappedStatus !== shipment.status ||
            trackingEvents.length > 0
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
    });

    return results;
  }
);
