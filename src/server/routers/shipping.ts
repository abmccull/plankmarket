import {
  createTRPCRouter,
  protectedProcedure,
  strictProtectedProcedure,
  strictBuyerProcedure,
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
import { randomUUID } from "crypto";
import {
  applyShippingMarkup,
  captureCommercialPolicy,
} from "@/lib/commercial-policy";
import { resolveSellingTerritoryEligibility } from "@/lib/selling-territory";
import { assertListingVisibleToBuyer } from "@/server/security/listing-visibility";
import {
  addBusinessDays,
  computePalletsNeeded,
  formatPriority1Date,
  formatPriority1DateValue,
  getNextBusinessDay,
  getShippingBookingSnapshotKey,
  normalizeUsZip,
  parseNmfcCode,
  resolveListingFreightFunding,
  resolveUsStateForZip,
  shippingBookingSnapshotSchema,
} from "@/server/services/shipping-workflow";

function listingConditionIsUsed(condition: string): boolean {
  return ["slight_damage", "returns", "seconds", "remnants", "other"].includes(
    condition,
  );
}

function territoryFailureMessage(
  territoryDecision: ReturnType<typeof resolveSellingTerritoryEligibility>,
): string {
  return territoryDecision.reason === "destination_blocked"
    ? `This seller is not currently selling to ${territoryDecision.normalizedDestinationState}.`
    : "This listing's territory settings are incomplete for the selected destination.";
}

export const shippingRouter = createTRPCRouter({
  // Get shipping quotes for a listing
  getQuotes: strictBuyerProcedure
    .input(getShippingQuotesSchema)
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.listingId),
        with: {
          seller: {
            columns: {
              id: true,
              name: true,
              email: true,
              phone: true,
              businessName: true,
              businessAddress: true,
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

      assertListingVisibleToBuyer(listing);

      let destinationState: string;
      try {
        destinationState = resolveUsStateForZip(input.destinationZip);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Enter a valid US shipping ZIP code.",
        });
      }
      const territoryDecision = resolveSellingTerritoryEligibility({
        destinationState,
        mode: listing.territoryMode,
        allowedStates: listing.allowedDestinationStates,
      });
      if (!territoryDecision.eligible) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: territoryFailureMessage(territoryDecision),
        });
      }

      const {
        palletWeight,
        palletLength,
        palletWidth,
        palletHeight,
        locationZip,
        locationCity,
        locationState,
        freightClass,
        nmfcCode,
        totalPallets,
        sqFtPerBox,
        boxesPerPallet,
      } = listing;

      if (
        !palletWeight ||
        !palletLength ||
        !palletWidth ||
        !palletHeight ||
        !locationZip ||
        !locationCity ||
        !locationState ||
        !freightClass ||
        !totalPallets ||
        !sqFtPerBox ||
        !boxesPerPallet ||
        !listing.seller.businessAddress ||
        !listing.seller.phone
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "The seller must complete this listing's freight and pickup information before checkout.",
        });
      }

      let palletsNeeded: number;
      let originZip: string;
      let destinationZip: string;
      try {
        palletsNeeded = computePalletsNeeded({
          quantitySqFt: input.quantitySqFt,
          sqFtPerBox,
          boxesPerPallet,
          totalPallets,
        });
        originZip = normalizeUsZip(locationZip);
        destinationZip = normalizeUsZip(input.destinationZip);
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Listing freight information is invalid.",
        });
      }

      const now = new Date();
      const pickupDate = getNextBusinessDay(now);
      const pickupDateISO = pickupDate.toISOString();
      const nmfc = parseNmfcCode(nmfcCode);
      const rateItem = {
        freightClass: freightClass ?? "125",
        packagingType: "Pallet",
        units: palletsNeeded,
        pieces: 1,
        totalWeight: palletWeight * palletsNeeded,
        length: palletLength,
        width: palletWidth,
        height: palletHeight,
        description: `${listing.title} - Flooring`,
        isStackable: false,
        isHazardous: false,
        isUsed: listingConditionIsUsed(listing.condition),
        isMachinery: false,
        ...(nmfc ?? {}),
      };

      let ratesResponse;
      try {
        ratesResponse = await priority1.getRates({
          originZipCode: originZip,
          destinationZipCode: destinationZip,
          pickupDate: pickupDateISO,
          items: [rateItem],
        });
      } catch (error) {
        console.error("Failed to fetch shipping rates from Priority1:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to fetch shipping rates. Please try again later.",
        });
      }

      const allQuotes = (ratesResponse.rateQuotes ?? []).flatMap((quote) => {
        const carrierRate = quote.rateQuoteDetail.total;
        if (
          !quote.id ||
          !quote.carrierName ||
          !quote.carrierCode ||
          !Number.isFinite(carrierRate) ||
          carrierRate < 0 ||
          !Number.isInteger(quote.transitDays) ||
          quote.transitDays < 0
        ) {
          return [];
        }

        const shippingPrice = applyShippingMarkup(carrierRate);
        const freightFunding = resolveListingFreightFunding({
          listing: {
            freightPaymentMode: listing.freightPaymentMode,
            sellerFreightStates: listing.sellerFreightStates,
            freightDropCharge: listing.freightDropCharge,
          },
          fullFreightCharge: shippingPrice,
          destinationState,
        });
        const quoteExpiresAt = quote.expirationDate
          ? new Date(quote.expirationDate)
          : new Date(now.getTime() + 30 * 60 * 1000);
        if (
          Number.isNaN(quoteExpiresAt.getTime()) ||
          quoteExpiresAt.getTime() <= now.getTime()
        ) {
          return [];
        }
        const estimatedDeliveryDate = quote.deliveryDate
          ? new Date(quote.deliveryDate)
          : addBusinessDays(pickupDate, quote.transitDays);
        if (Number.isNaN(estimatedDeliveryDate.getTime())) {
          return [];
        }
        const estimatedDeliveryWindowDate =
          formatPriority1DateValue(estimatedDeliveryDate);
        if (estimatedDeliveryWindowDate < formatPriority1Date(pickupDate)) {
          return [];
        }
        const estimatedDelivery = estimatedDeliveryDate.toISOString();
        const quoteToken = randomUUID();
        const snapshot = shippingBookingSnapshotSchema.parse({
          version: 1,
          quoteId: quote.id,
          listingId: input.listingId,
          buyerId: ctx.user.id,
          quantitySqFt: input.quantitySqFt,
          destinationZip,
          carrierName: quote.carrierName,
          carrierScac: quote.carrierCode,
          carrierRate,
          shippingPrice,
          commercialPolicy: captureCommercialPolicy(now),
          transitDays: quote.transitDays,
          quoteExpiresAt: quoteExpiresAt.toISOString(),
          originLocation: {
            address: {
              addressLine1: listing.seller.businessAddress!,
              city: locationCity,
              state: locationState,
              postalCode: originZip,
              country: "US",
            },
            contact: {
              companyName: listing.seller.businessName || listing.seller.name,
              contactName: listing.seller.name,
              phoneNumber: listing.seller.phone!,
              email: listing.seller.email,
            },
          },
          lineItems: [
            {
              freightClass,
              packagingType: "Pallet",
              units: palletsNeeded,
              pieces: 1,
              totalWeight: palletWeight * palletsNeeded,
              length: palletLength,
              width: palletWidth,
              height: palletHeight,
              description: `${listing.title} - Flooring`,
              isStackable: false,
              isHazardous: false,
              isUsed: listingConditionIsUsed(listing.condition),
              ...(nmfc ?? {}),
            },
          ],
          pickupWindow: {
            date: formatPriority1Date(pickupDate),
            startTime: "08:00",
            endTime: "17:00",
          },
          deliveryWindow: {
            date: estimatedDeliveryWindowDate,
            startTime: "08:00",
            endTime: "17:00",
          },
        });

        return [{
          quoteId: quote.id,
          quoteToken,
          carrierName: quote.carrierName,
          carrierScac: quote.carrierCode,
          shippingPrice,
          buyerFreightCharge: freightFunding.buyerFreightCharge,
          sellerFreightContribution:
            freightFunding.sellerFreightContribution,
          freightFundingMode: freightFunding.appliedMode,
          freightFundingReason: freightFunding.reason,
          appliedBuyerDropCharge:
            freightFunding.appliedBuyerDropCharge,
          destinationState,
          carrierRate,
          transitDays: quote.transitDays,
          estimatedDelivery,
          quoteExpiresAt: quoteExpiresAt.toISOString(),
          snapshot,
        }];
      });

      // Select top 3: cheapest, fastest, and best value middle option
      const byPrice = [...allQuotes].sort((a, b) => a.shippingPrice - b.shippingPrice);
      const bySpeed = [...allQuotes].sort((a, b) => a.transitDays - b.transitDays || a.shippingPrice - b.shippingPrice);

      const selectedMap = new Map<number, typeof allQuotes[0]>();

      // 1. Cheapest option
      if (byPrice[0]) selectedMap.set(byPrice[0].quoteId, byPrice[0]);

      // 2. Fastest option (if different from cheapest)
      if (bySpeed[0]) selectedMap.set(bySpeed[0].quoteId, bySpeed[0]);

      // 3. Fill remaining slot(s) with next best by price that isn't already selected
      for (const q of byPrice) {
        if (selectedMap.size >= 3) break;
        if (!selectedMap.has(q.quoteId)) selectedMap.set(q.quoteId, q);
      }

      const topQuotes = Array.from(selectedMap.values())
        .sort((a, b) => a.shippingPrice - b.shippingPrice);

      try {
        await Promise.all(
          topQuotes.map((quote) => {
            const secondsUntilProviderExpiry = Math.max(
              1,
              Math.floor(
                (new Date(quote.quoteExpiresAt).getTime() - Date.now()) / 1000,
              ),
            );
            const ttlSeconds = Math.min(1800, secondsUntilProviderExpiry);
            const cachedQuote = JSON.stringify({
              quoteId: quote.quoteId,
              quoteToken: quote.quoteToken,
              carrierRate: quote.carrierRate,
              shippingPrice: quote.shippingPrice,
              freightFundingMode: quote.freightFundingMode,
              buyerFreightCharge: quote.buyerFreightCharge,
              sellerFreightContribution:
                quote.sellerFreightContribution,
              freightFundingReason: quote.freightFundingReason,
              appliedBuyerDropCharge:
                quote.appliedBuyerDropCharge,
              carrierName: quote.carrierName,
              carrierScac: quote.carrierScac,
              transitDays: quote.transitDays,
              estimatedDelivery: quote.estimatedDelivery,
              quoteExpiresAt: quote.quoteExpiresAt,
              listingId: input.listingId,
              buyerId: ctx.user.id,
              quantitySqFt: input.quantitySqFt,
              destinationZip,
              destinationState: quote.destinationState,
            });

            return (
            Promise.all([
              redis.set(
                `shipping-quote-token:${quote.quoteToken}`,
                cachedQuote,
                { ex: ttlSeconds },
              ),
              redis.set(
                `shipping-quote:${quote.quoteId}`,
                cachedQuote,
                { ex: ttlSeconds },
              ),
              redis.set(
                getShippingBookingSnapshotKey(quote.quoteId),
                JSON.stringify(quote.snapshot),
                { ex: secondsUntilProviderExpiry },
              ),
            ])
            );
          }),
        );
      } catch (error) {
        console.error("Failed to cache shipping quotes in Redis:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to secure shipping quotes. Please try again.",
        });
      }

      // Return top 3 quotes WITHOUT carrierRate (internal cost stays server-side)
      const quotes: ShippingQuote[] = topQuotes.map((quote) => ({
        quoteId: quote.quoteId,
        quoteToken: quote.quoteToken,
        carrierName: quote.carrierName,
        carrierScac: quote.carrierScac,
        shippingPrice: quote.shippingPrice,
        buyerFreightCharge: quote.buyerFreightCharge,
        sellerFreightContribution: quote.sellerFreightContribution,
        freightFundingMode: quote.freightFundingMode,
        transitDays: quote.transitDays,
        estimatedDelivery: quote.estimatedDelivery,
        quoteExpiresAt: quote.quoteExpiresAt,
      }));
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
        columns: {
          id: true,
          status: true,
          trackingNumber: true,
        },
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

      const canSeeFreightDocuments =
        ctx.user.role === "admin" ||
        ctx.user.role === "seller" ||
        order.status === "delivered";

      // Tracking milestones are participant-visible. Provider internals and
      // freight documents stay hidden from buyers until identity release.
      return {
        status: shipment.status,
        carrierName: shipment.carrierName,
        carrierScac: shipment.carrierScac,
        proNumber: shipment.proNumber,
        priority1ShipmentId:
          ctx.user.role === "admin" ? shipment.priority1ShipmentId : null,
        bolUrl: canSeeFreightDocuments ? shipment.bolUrl : null,
        labelUrl: canSeeFreightDocuments ? shipment.labelUrl : null,
        deliveryReceiptUrl: canSeeFreightDocuments
          ? shipment.deliveryReceiptUrl
          : null,
        trackingEvents: shipment.trackingEvents,
        dispatchedAt: shipment.dispatchedAt,
        deliveredAt: shipment.deliveredAt,
        pickupDate: shipment.pickupDate,
      };
    }),

  // Get shipping documents (BOL, Delivery Receipt)
  getDocuments: strictProtectedProcedure
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
        columns: {
          id: true,
          status: true,
          trackingNumber: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      const shipment = await ctx.db.query.shipments.findFirst({
        where: eq(shipments.orderId, input.orderId),
      });

      if (!shipment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shipment not found",
        });
      }

      const isAdmin = ctx.user.role === "admin";
      const isSeller = ctx.user.role === "seller";
      const isDelivered = order.status === "delivered";
      const canAccessDocument =
        isAdmin ||
        (input.documentType === "BillOfLading" && isSeller) ||
        (input.documentType === "DeliveryReceipt" &&
          (isSeller || isDelivered));
      if (!canAccessDocument) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This freight document is not available for your order role and status.",
        });
      }

      const identifier = shipment.proNumber
        ? { proNumber: shipment.proNumber }
        : order.trackingNumber
          ? { bolNumber: order.trackingNumber }
          : null;
      if (!identifier) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shipment does not have a PRO or BOL identifier",
        });
      }

      // Call priority1.getDocuments()
      try {
        const documentsResponse = await priority1.getDocuments({
          shipmentImageTypeId: input.documentType,
          imageFormatTypeId: "PDF",
          ...identifier,
        });

        if (!documentsResponse.imageUrl) {
          throw new Error("Priority1 did not return a document URL");
        }
        return { imageUrl: documentsResponse.imageUrl };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("Failed to fetch shipping document from Priority1", {
          orderId: input.orderId,
          documentType: input.documentType,
          error: error instanceof Error ? error.name : "UnknownError",
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to fetch shipping document. Please try again later.",
        });
      }
    }),
});
