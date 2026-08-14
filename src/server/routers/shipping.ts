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
  computePalletsNeeded,
  formatPriority1Date,
  getNextBusinessDay,
  getShippingBookingSnapshotKeyByToken,
  getShippingQuoteTokenKey,
  isQuoteBookable,
  SHIPPING_OFFER_BOOKABILITY_BUFFER_MS,
  normalizeUsZip,
  parseNmfcCode,
  quoteArtifactTtlSeconds,
  resolveFreightAccessorialCodes,
  resolveListingFreightFunding,
  requireShippingStateMatchesZip,
  resolveUsStateForZip,
  selectTopShippingQuotes,
  shippingBookingSnapshotSchema,
} from "@/server/services/shipping-workflow";
import {
  buildShippingRateResponseCacheKey,
  normalizePriority1RateQuotes,
  readShippingRateResponseCache,
  type ShippingRateCacheProviderMode,
  writeShippingRateResponseCache,
} from "@/server/services/shipping-rate-cache";
import { canViewFreightDocuments } from "@/server/security/freight-document-access";
import {
  fetchPriority1DocumentUrl,
  shipmentDocumentIdentifiersFrom,
} from "@/server/services/shipment-documents";

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
              businessCity: true,
              businessState: true,
              businessZip: true,
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
        requireShippingStateMatchesZip({
          shippingState: locationState,
          shippingZip: originZip,
        });
        if (listing.seller.businessZip) {
          const sellerOriginZip = normalizeUsZip(listing.seller.businessZip);
          if (sellerOriginZip !== originZip) {
            throw new Error(
              "The seller legal address ZIP does not match this listing's warehouse ZIP. Update the listing pickup location before checkout.",
            );
          }
        }
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
      const pickupDateKey = formatPriority1Date(pickupDate);
      const nmfc = parseNmfcCode(nmfcCode);
      const piecesPerPallet = Math.max(1, Math.floor(Number(boxesPerPallet) || 1));
      const accessorialCodes = resolveFreightAccessorialCodes({
        liftgateDelivery: input.liftgateDelivery,
        residentialDelivery: input.residentialDelivery,
        appointmentDelivery: input.appointmentDelivery,
      });
      const rateItem = {
        freightClass: freightClass ?? "125",
        packagingType: "Pallet",
        units: palletsNeeded,
        pieces: piecesPerPallet,
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
      const providerMode: ShippingRateCacheProviderMode =
        priority1.isDryRun() ? "dry_run" : "live";

      const rateCacheKey = buildShippingRateResponseCacheKey({
        providerMode,
        listingId: input.listingId,
        title: listing.title,
        condition: listing.condition,
        originZip,
        destinationZip,
        pickupDate: pickupDateKey,
        quantitySqFt: input.quantitySqFt,
        palletsNeeded,
        piecesPerPallet,
        palletWeight,
        palletLength,
        palletWidth,
        palletHeight,
        freightClass,
        nmfcCode: nmfcCode ?? null,
        freightPaymentMode: listing.freightPaymentMode,
        sellerFreightStates: listing.sellerFreightStates ?? null,
        freightDropCharge:
          listing.freightDropCharge == null
            ? null
            : Number(listing.freightDropCharge),
        accessorialCodes,
      });

      let normalizedRateQuotes = null;
      try {
        normalizedRateQuotes = await readShippingRateResponseCache({
          redisClient: redis,
          cacheKey: rateCacheKey,
          providerMode,
          now,
        });
      } catch (error) {
        console.error("Failed to read cached shipping rates from Redis:", error);
      }

      if (!normalizedRateQuotes) {
        let ratesResponse;
        try {
          ratesResponse = await priority1.getRates({
            originZipCode: originZip,
            destinationZipCode: destinationZip,
            pickupDate: pickupDateISO,
            items: [rateItem],
            ...(accessorialCodes.length > 0
              ? {
                  accessorialServices: accessorialCodes.map((code) => ({
                    code,
                  })),
                }
              : {}),
          });
        } catch (error) {
          console.error("Failed to fetch shipping rates from Priority1:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to fetch shipping rates. Please try again later.",
          });
        }

        normalizedRateQuotes = normalizePriority1RateQuotes({
          quotes: ratesResponse.rateQuotes ?? [],
          now,
          pickupDate,
        });

        try {
          await writeShippingRateResponseCache({
            redisClient: redis,
            cacheKey: rateCacheKey,
            providerMode,
            quotes: normalizedRateQuotes,
            now,
          });
        } catch (error) {
          console.error("Failed to write cached shipping rates to Redis:", error);
        }
      }

      const mintNowMs = Date.now();
      const allQuotes = normalizedRateQuotes.flatMap((quote) => {
        const quoteExpiresAt = new Date(quote.quoteExpiresAt);
        // Align with order consumption: never mint near-expiry quotes.
        if (
          !isQuoteBookable(
            quoteExpiresAt,
            mintNowMs,
            SHIPPING_OFFER_BOOKABILITY_BUFFER_MS,
          )
        ) {
          return [];
        }
        const ttlSeconds = quoteArtifactTtlSeconds(quoteExpiresAt, mintNowMs);
        if (ttlSeconds == null) {
          return [];
        }

        const shippingPrice = applyShippingMarkup(quote.carrierRate);
        const freightFunding = resolveListingFreightFunding({
          listing: {
            freightPaymentMode: listing.freightPaymentMode,
            sellerFreightStates: listing.sellerFreightStates,
            freightDropCharge: listing.freightDropCharge,
          },
          fullFreightCharge: shippingPrice,
          destinationState,
        });
        const estimatedDeliveryDate = new Date(quote.estimatedDelivery);
        const estimatedDelivery = quote.estimatedDelivery;
        const quoteToken = randomUUID();
        const snapshot = shippingBookingSnapshotSchema.parse({
          version: 1,
          quoteId: quote.quoteId,
          listingId: input.listingId,
          buyerId: ctx.user.id,
          quantitySqFt: input.quantitySqFt,
          destinationZip,
          carrierName: quote.carrierName,
          carrierScac: quote.carrierScac,
          carrierRate: quote.carrierRate,
          shippingPrice,
          accessorialCodes,
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
              pieces: piecesPerPallet,
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
            date: formatPriority1Date(estimatedDeliveryDate),
            startTime: "08:00",
            endTime: "17:00",
          },
        });

        return [{
          quoteId: quote.quoteId,
          quoteToken,
          carrierName: quote.carrierName,
          carrierScac: quote.carrierScac,
          shippingPrice,
          buyerFreightCharge: freightFunding.buyerFreightCharge,
          sellerFreightContribution:
            freightFunding.sellerFreightContribution,
          freightFundingMode: freightFunding.appliedMode,
          freightFundingReason: freightFunding.reason,
          appliedBuyerDropCharge:
            freightFunding.appliedBuyerDropCharge,
          destinationState,
          carrierRate: quote.carrierRate,
          transitDays: quote.transitDays,
          estimatedDelivery,
          quoteExpiresAt: quoteExpiresAt.toISOString(),
          snapshot,
          ttlSeconds,
        }];
      });

      // Top 3: cheapest, fastest (if distinct), then best value (price/day).
      const topQuotes = selectTopShippingQuotes(allQuotes, 3);
      if (topQuotes.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "No bookable freight rates remain for this destination (quotes may be near expiry or filtered). Refresh rates and try again.",
        });
      }

      try {
        await Promise.all(
          topQuotes.map((quote) => {
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

            // Token-scoped artifacts only — never share booking snapshot by
            // Priority1 quoteId (rate cache reuses quote IDs across buyers).
            return Promise.all([
              redis.set(
                getShippingQuoteTokenKey(quote.quoteToken),
                cachedQuote,
                { ex: quote.ttlSeconds },
              ),
              redis.set(
                getShippingBookingSnapshotKeyByToken(quote.quoteToken),
                JSON.stringify(quote.snapshot),
                { ex: quote.ttlSeconds },
              ),
            ]);
          }),
        );
      } catch (error) {
        console.error("Failed to cache shipping quotes in Redis:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unable to secure shipping quotes. Please try again.",
        });
      }

      // Return top 3 quotes WITHOUT carrierRate (internal cost stays server-side).
      // Cap displayed/client bookability to Redis artifact life so UI expiry
      // matches what order consume can actually use.
      const responseNowMs = Date.now();
      const quotes: ShippingQuote[] = topQuotes.map((quote) => {
        const providerExpiresMs = new Date(quote.quoteExpiresAt).getTime();
        const artifactExpiresMs = responseNowMs + quote.ttlSeconds * 1000;
        const effectiveExpiresMs = Math.min(providerExpiresMs, artifactExpiresMs);
        return {
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
          quoteExpiresAt: new Date(effectiveExpiresMs).toISOString(),
        };
      });
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

      const canSeeFreightDocuments = canViewFreightDocuments({
        viewerRole: ctx.user.role,
        orderStatus: order.status,
      });

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
        documentType: z.enum([
          "BillOfLading",
          "DeliveryReceipt",
          "PalletLabel",
        ]),
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

      const canAccessDocument = canViewFreightDocuments({
        viewerRole: ctx.user.role,
        orderStatus: order.status,
      });
      if (!canAccessDocument) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "This freight document is not available for your order role and status.",
        });
      }

      const identifiers = shipmentDocumentIdentifiersFrom({
        proNumber: shipment.proNumber,
        bolNumber: shipment.bolNumber,
        trackingNumber: order.trackingNumber,
      });
      if (identifiers.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shipment does not have a PRO or BOL identifier",
        });
      }

      try {
        const document = await fetchPriority1DocumentUrl(
          input.documentType,
          identifiers,
        );
        if (!document.url) {
          throw new Error(
            document.error ?? "Priority1 did not return a document URL",
          );
        }
        return { imageUrl: document.url };
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
