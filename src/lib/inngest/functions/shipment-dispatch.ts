import { inngest } from "../client";
import { db } from "@/server/db";
import { orders, shipments } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { priority1 } from "@/server/services/priority1";

export const shipmentDispatch = inngest.createFunction(
  { id: "shipment-dispatch", name: "Auto-dispatch Shipment via Priority1" },
  { event: "order/paid" },
  async ({ event, step }) => {
    const { orderId } = event.data as { orderId: string };

    const result = await step.run("dispatch-shipment", async () => {
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
        // 5. Calculate next-business-day pickup, 8am-5pm window
        const now = new Date();
        const pickupDate = new Date(now);
        pickupDate.setDate(pickupDate.getDate() + 1);
        // Skip weekends
        while (pickupDate.getDay() === 0 || pickupDate.getDay() === 6) {
          pickupDate.setDate(pickupDate.getDate() + 1);
        }

        const pickupDateStr = `${String(pickupDate.getMonth() + 1).padStart(2, "0")}/${String(pickupDate.getDate()).padStart(2, "0")}/${pickupDate.getFullYear()}`;

        // 6. Call priority1.dispatch()
        const listing = order.listing;
        const seller = order.seller;
        const buyer = order.buyer;

        // Calculate pallets for this order
        const sqFtPerBox = listing.sqFtPerBox ?? 20;
        const boxesPerPallet = listing.boxesPerPallet ?? 30;
        const quantitySqFtNum = parseFloat(String(order.quantitySqFt));
        const palletsNeeded = Math.max(
          1,
          Math.min(
            Math.ceil(quantitySqFtNum / (sqFtPerBox * boxesPerPallet)),
            listing.totalPallets ?? 1
          )
        );

        const dispatchResult = await priority1.dispatch({
          originLocation: {
            address: {
              addressLine1: seller.businessAddress || "N/A",
              city: listing.locationCity || "N/A",
              state: listing.locationState || "N/A",
              postalCode: listing.locationZip || "N/A",
              country: "US",
            },
            contact: {
              companyName: seller.businessName || seller.name,
              contactName: seller.name,
              phoneNumber: seller.phone || "000-000-0000",
              email: seller.email,
            },
          },
          destinationLocation: {
            address: {
              addressLine1: order.shippingAddress || "N/A",
              city: order.shippingCity || "N/A",
              state: order.shippingState || "N/A",
              postalCode: order.shippingZip || "N/A",
              country: "US",
            },
            contact: {
              companyName: buyer.businessName || buyer.name,
              contactName: order.shippingName || buyer.name,
              phoneNumber:
                order.shippingPhone || buyer.phone || "000-000-0000",
              email: buyer.email,
            },
          },
          lineItems: [
            {
              freightClass: listing.freightClass || "125",
              packagingType: "Pallet",
              units: palletsNeeded,
              pieces: 1,
              totalWeight: (listing.palletWeight ?? 1200) * palletsNeeded,
              length: listing.palletLength ?? 48,
              width: listing.palletWidth ?? 40,
              height: listing.palletHeight ?? 48,
              description: `${listing.title} - Flooring`,
              isStackable: false,
              isHazardous: false,
              isUsed: false,
            },
          ],
          pickupWindow: {
            date: pickupDateStr,
            startTime: "08:00",
            endTime: "17:00",
          },
          shipmentIdentifiers: [
            {
              type: "CUSTOMER_REFERENCE",
              value: order.orderNumber,
              primaryForType: false,
            },
          ],
          quoteId: parseInt(order.selectedQuoteId, 10),
          insuranceAmount: 0,
          pickupNote: `PlankMarket Order ${order.orderNumber}`,
        });

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
    });

    return result;
  }
);
