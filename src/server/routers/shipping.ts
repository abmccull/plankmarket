import {
  createTRPCRouter,
  buyerProcedure,
  protectedProcedure,
} from "../trpc";
import {
  getShippingQuotesSchema,
  type ShippingQuote,
} from "@/lib/validators/shipping";
import { priority1 } from "@/server/services/priority1";
import { listings, orders, shipments } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { redis } from "@/lib/redis/client";

/**
 * Calculate next business day (skip weekends) for pickup date
 */
function getNextBusinessDay(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1); // Tomorrow

  const dayOfWeek = date.getDay();
  // If Saturday (6), add 2 days; if Sunday (0), add 1 day
  if (dayOfWeek === 6) {
    date.setDate(date.getDate() + 2);
  } else if (dayOfWeek === 0) {
    date.setDate(date.getDate() + 1);
  }

  return date;
}

export const shippingRouter = createTRPCRouter({
  // Get shipping quotes for a listing
  getQuotes: buyerProcedure
    .input(getShippingQuotesSchema)
    .query(async ({ ctx, input }) => {
      // Fetch listing with seller relation
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.listingId),
        with: {
          seller: {
            columns: {
              id: true,
              name: true,
              businessName: true,
            },
          },
        },
      });

      // Verify listing exists and is active
      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      if (listing.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Listing is not available for purchase",
        });
      }

      // Get listing freight data
      const {
        palletWeight,
        palletLength,
        palletWidth,
        palletHeight,
        freightClass,
        totalPallets,
        sqFtPerBox,
        boxesPerPallet,
        locationZip,
      } = listing;

      // Defensive check: if pallet data is missing, throw PRECONDITION_FAILED error
      if (
        !palletWeight ||
        !palletLength ||
        !palletWidth ||
        !palletHeight ||
        !locationZip
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Listing does not have complete freight information. Please contact the seller.",
        });
      }

      // Calculate pallets needed
      const sqFtPerPallet = (sqFtPerBox ?? 20) * (boxesPerPallet ?? 30);
      let palletsNeeded = Math.ceil(input.quantitySqFt / sqFtPerPallet);

      // Clamp to min 1, max listing.totalPallets
      palletsNeeded = Math.max(1, Math.min(palletsNeeded, totalPallets ?? 1));

      // Build next-business-day pickup date
      const pickupDate = getNextBusinessDay();
      const pickupDateISO = pickupDate.toISOString();

      // Call priority1.getRates() with pallet items
      const items = Array.from({ length: palletsNeeded }, () => ({
        freightClass: freightClass ?? "125",
        packagingType: "Pallet",
        units: 1,
        pieces: 1,
        totalWeight: palletWeight,
        length: palletLength,
        width: palletWidth,
        height: palletHeight,
        isStackable: true,
        isHazardous: false,
        isUsed: false,
        isMachinery: false,
      }));

      let ratesResponse;
      try {
        ratesResponse = await priority1.getRates({
          originZipCode: locationZip,
          destinationZipCode: input.destinationZip,
          pickupDate: pickupDateISO,
          items,
        });
      } catch (error) {
        console.error("Failed to fetch shipping rates from Priority1:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to fetch shipping rates. Please try again later.",
        });
      }

      // Apply 15% margin and map to ShippingQuote[]
      const quotes: ShippingQuote[] = ratesResponse.rateQuotes.map((quote) => {
        const carrierRate = quote.rateQuoteDetail.total;
        const shippingPrice = Math.round(carrierRate * 1.15 * 100) / 100;

        return {
          quoteId: quote.id,
          carrierName: quote.carrierName,
          carrierScac: quote.carrierCode,
          shippingPrice,
          carrierRate,
          transitDays: quote.transitDays,
          estimatedDelivery: quote.deliveryDate,
          quoteExpiresAt: quote.expirationDate,
        };
      });

      // Sort by shippingPrice ascending
      quotes.sort((a, b) => a.shippingPrice - b.shippingPrice);

      // Cache each quote in Redis with 30-minute TTL
      // This enables server-side verification during order creation
      try {
        await Promise.all(
          quotes.map((quote) =>
            redis.set(
              `shipping-quote:${quote.quoteId}`,
              JSON.stringify({
                carrierRate: quote.carrierRate,
                shippingPrice: quote.shippingPrice,
                carrierName: quote.carrierName,
                carrierScac: quote.carrierScac,
                transitDays: quote.transitDays,
                estimatedDelivery: quote.estimatedDelivery,
                quoteExpiresAt: quote.quoteExpiresAt,
                listingId: input.listingId,
              }),
              { ex: 1800 } // 30 minutes TTL
            )
          )
        );
      } catch (error) {
        // Log cache error but don't fail the request
        console.error("Failed to cache shipping quotes in Redis:", error);
      }

      return quotes;
    }),

  // Get tracking information for an order
  getTracking: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Fetch order to verify ownership
      const order = await ctx.db.query.orders.findFirst({
        where: and(
          eq(orders.id, input.orderId),
          // Users can only see their own orders
          ctx.user.role === "admin"
            ? undefined
            : ctx.user.role === "seller"
              ? eq(orders.sellerId, ctx.user.id)
              : eq(orders.buyerId, ctx.user.id)
        ),
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      // Fetch shipment by orderId
      const shipment = await ctx.db.query.shipments.findFirst({
        where: eq(shipments.orderId, input.orderId),
      });

      // If no shipment found, return null
      if (!shipment) {
        return null;
      }

      // Return shipment data
      return {
        status: shipment.status,
        carrierName: shipment.carrierName,
        carrierScac: shipment.carrierScac,
        proNumber: shipment.proNumber,
        priority1ShipmentId: shipment.priority1ShipmentId,
        bolUrl: shipment.bolUrl,
        labelUrl: shipment.labelUrl,
        deliveryReceiptUrl: shipment.deliveryReceiptUrl,
        trackingEvents: shipment.trackingEvents,
        dispatchedAt: shipment.dispatchedAt,
        deliveredAt: shipment.deliveredAt,
        pickupDate: shipment.pickupDate,
      };
    }),

  // Get shipping documents (BOL, Delivery Receipt)
  getDocuments: protectedProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
        documentType: z.enum(["BillOfLading", "DeliveryReceipt"]),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify order ownership
      const order = await ctx.db.query.orders.findFirst({
        where: and(
          eq(orders.id, input.orderId),
          ctx.user.role === "admin"
            ? undefined
            : ctx.user.role === "seller"
              ? eq(orders.sellerId, ctx.user.id)
              : eq(orders.buyerId, ctx.user.id)
        ),
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      // Fetch shipment to get proNumber
      const shipment = await ctx.db.query.shipments.findFirst({
        where: eq(shipments.orderId, input.orderId),
      });

      if (!shipment || !shipment.proNumber) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shipment not found or PRO number not available",
        });
      }

      // Call priority1.getDocuments()
      try {
        const documentsResponse = await priority1.getDocuments({
          shipmentImageTypeId: input.documentType,
          imageFormatTypeId: "PDF",
          proNumber: shipment.proNumber,
        });

        return { imageUrl: documentsResponse.imageUrl };
      } catch (error) {
        console.error("Failed to fetch shipping document from Priority1:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to fetch shipping document. Please try again later.",
        });
      }
    }),
});
