import {
  createTRPCRouter,
  protectedProcedure,
  buyerProcedure,
  sellerProcedure,
  strictVerifiedBuyerProcedure,
} from "../trpc";
import {
  createOrderSchema,
  createOrderFromOfferSchema,
  updateOrderStatusSchema,
} from "@/lib/validators/order";
import { orders, listings, offers, shippingAddresses } from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  applyPlatformLiableTaxToOrderFees,
  calculateOrderFees,
} from "@/lib/fees";
import type { FreightFundingMode } from "@/lib/freight-funding";
import { resolveListingUnitPrice } from "@/lib/listing-pricing";
import { resolveSellingTerritoryEligibility } from "@/lib/selling-territory";
import { nanoid } from "nanoid";
import { redis } from "@/lib/redis/client";
import { maskUserForOrder } from "@/lib/contact-masking";
import {
  releaseReservedInventory,
  reserveListingInventory,
} from "@/server/services/inventory-reservation";
import { canSellerUpdateOrderStatus } from "@/server/services/order-transitions";
import {
  getShippingBookingSnapshotKeyByToken,
  getShippingQuoteTokenKey,
  getSellerFreightFundingIneligibilityReason,
  freightFundingMatchesQuotedTerms,
  freightSnapshotMatchesListing,
  computePalletsNeeded,
  isQuoteBookable,
  quoteArtifactTtlSeconds,
  SHIPPING_OFFER_BOOKABILITY_BUFFER_MS,
  requireShippingStateMatchesZip,
  resolveListingFreightFunding,
  shippingBookingSnapshotSchema,
  type ShippingBookingSnapshot,
} from "@/server/services/shipping-workflow";
import { cancelUncapturedOrderPayment } from "@/server/services/payment-intent-cancellation";
import type { Database } from "@/server/db";
import {
  canCreatePendingOrder,
  MAX_PENDING_UNPAID_ORDERS,
} from "@/server/services/pending-order-policy";
import { assertListingVisibleToBuyer } from "@/server/security/listing-visibility";
import {
  captureCommercialPolicy,
  CURRENT_COMMERCIAL_POLICY,
  type CommercialPolicy,
} from "@/lib/commercial-policy";
import {
  addRetentionDays,
  SHIPPING_ADDRESS_RETENTION_DAYS,
} from "@/lib/privacy-retention";
import {
  calculateOrderTax,
  TaxReadinessError,
  type CalculateOrderTaxInput,
} from "@/server/services/stripe-tax";
import { validateThenCompareDeletePair } from "@/server/services/verified-artifact-consumption";
import { assertSellerPayoutReadyForOrderReservation } from "@/server/services/seller-payout-readiness";

type DbExecutor =
  | Database
  | Parameters<Parameters<Database["transaction"]>[0]>[0];

const QUANTITY_TOLERANCE_SQFT = 0.01;

function getMinimumOrderQuantitySqFt(listing: {
  moq: number | null;
  moqUnit: "pallets" | "sqft" | null;
  sqFtPerBox: number | null;
  boxesPerPallet: number | null;
}): number {
  if (!listing.moq || listing.moq <= 0) {
    return 0;
  }

  if (listing.moqUnit === "pallets") {
    return (
      listing.moq *
      (listing.sqFtPerBox ?? 20) *
      (listing.boxesPerPallet ?? 30)
    );
  }

  return listing.moq;
}

async function enforcePendingOrderLimit(
  db: DbExecutor,
  buyerId: string,
): Promise<void> {
  // Serialize reservation creation per buyer so concurrent requests cannot
  // all pass the count before inserting. Pending orders expire separately.
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`pending-orders:${buyerId}`}))`,
  );
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.buyerId, buyerId), eq(orders.status, "pending")));

  if (!canCreatePendingOrder(result?.count ?? 0)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `You already have ${MAX_PENDING_UNPAID_ORDERS} unpaid checkout reservations. Complete one or allow it to expire before reserving more inventory.`,
    });
  }
}

function generateOrderNumber(): string {
  return `PM-${nanoid(8).toUpperCase()}`;
}

function getSellerTransferStatus(holdStatus: string, paymentStatus: string | null) {
  if (holdStatus === "refunded") return "refunded" as const;
  if (!paymentStatus || !["succeeded", "partially_refunded"].includes(paymentStatus)) {
    return "awaiting_payment" as const;
  }
  if (holdStatus === "released") return "transferred" as const;
  if (holdStatus === "held") return "scheduled_after_pickup" as const;
  return "awaiting_payment" as const;
}

interface SellerStatusTransitionOrder {
  id: string;
  status: string;
  escrowStatus: string;
  paymentStatus: string | null;
  selectedQuoteId: string | null;
  stripePaymentIntentId: string | null;
  totalPrice: number;
}

function assertSellerStatusTransition(
  order: SellerStatusTransitionOrder,
  nextStatus: z.infer<typeof updateOrderStatusSchema>["status"],
): void {
  if (
    !canSellerUpdateOrderStatus({
      currentStatus: order.status,
      nextStatus,
      paymentStatus: order.paymentStatus,
    })
  ) {
    if (
      nextStatus === "cancelled" &&
      (order.paymentStatus === "succeeded" ||
        order.paymentStatus === "partially_refunded")
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Paid orders must be cancelled by an admin so the refund can be processed.",
      });
    }

    if (
      nextStatus !== "cancelled" &&
      order.paymentStatus !== "succeeded" &&
      order.paymentStatus !== "partially_refunded"
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Order payment must succeed before it can move to the next fulfillment stage.",
      });
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot transition order from "${order.status}" to "${nextStatus}"`,
    });
  }

  if (
    order.selectedQuoteId &&
    (nextStatus === "shipped" || nextStatus === "delivered")
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Integrated shipment status is controlled by the carrier tracking provider.",
    });
  }
}

const cachedQuoteSchema = z
  .object({
    quoteId: z.number().int().positive(),
    quoteToken: z.string().optional(),
    carrierRate: z.number().nonnegative(),
    shippingPrice: z.number().positive(),
    freightFundingMode: z.enum([
      "buyer_pays",
      "seller_pays",
      "seller_pays_selected_states",
    ]),
    buyerFreightCharge: z.number().nonnegative(),
    sellerFreightContribution: z.number().nonnegative(),
    freightFundingReason: z.string().min(1),
    appliedBuyerDropCharge: z.number().nonnegative(),
    carrierName: z.string(),
    carrierScac: z.string().optional(),
    transitDays: z.number().int().optional(),
    estimatedDelivery: z.string().optional(),
    quoteExpiresAt: z.string().optional(),
    listingId: z.string().uuid(),
    buyerId: z.string().uuid(),
    quantitySqFt: z.number().positive(),
    destinationZip: z.string().min(5),
    destinationState: z.string().length(2),
  })
  .superRefine((quote, ctx) => {
    if (
      Math.round(
        (quote.buyerFreightCharge +
          quote.sellerFreightContribution) *
          100,
      ) !== Math.round(quote.shippingPrice * 100)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Freight funding split does not match the full quote",
      });
    }
    if (
      quote.freightFundingMode === "buyer_pays" &&
      quote.sellerFreightContribution > 0
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Buyer-funded quote cannot include a seller contribution",
      });
    }
  });

function normalizeZip(zip: string): string {
  return zip.trim().slice(0, 5);
}

function territoryFailureMessage(
  territoryDecision: ReturnType<typeof resolveSellingTerritoryEligibility>,
): string {
  return territoryDecision.reason === "destination_blocked"
    ? `This seller is not currently selling to ${territoryDecision.normalizedDestinationState}.`
    : "This listing's territory settings are incomplete for the selected destination.";
}

function getVerifiedDestinationState(params: {
  shippingState: string;
  shippingZip: string;
}): string {
  try {
    return requireShippingStateMatchesZip(params);
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof Error
          ? error.message
          : "Enter a valid US shipping destination.",
    });
  }
}

function calculateFreightFundedOrderFees(params: {
  listing: Parameters<typeof resolveListingFreightFunding>[0]["listing"];
  subtotal: number;
  fullFreightCharge: number;
  destinationState: string;
  commercialPolicy?: CommercialPolicy;
  quotedFreightFunding?: {
    freightFundingMode: FreightFundingMode;
    buyerFreightCharge: number;
    sellerFreightContribution: number;
    destinationState: string;
  };
}) {
  const resolvedFreightFunding = resolveListingFreightFunding({
    listing: params.listing,
    fullFreightCharge: params.fullFreightCharge,
    destinationState: params.destinationState,
  });
  if (
    params.quotedFreightFunding &&
    (params.quotedFreightFunding.destinationState !==
      params.destinationState ||
      !freightFundingMatchesQuotedTerms({
        applied: resolvedFreightFunding,
        quoted: params.quotedFreightFunding,
      }))
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "The seller's freight terms changed after this quote was shown. Request a new shipping quote before checkout.",
    });
  }
  const freightFunding = params.quotedFreightFunding
    ? {
        ...resolvedFreightFunding,
        appliedMode: params.quotedFreightFunding.freightFundingMode,
        buyerFreightCharge:
          params.quotedFreightFunding.buyerFreightCharge,
        sellerFreightContribution:
          params.quotedFreightFunding.sellerFreightContribution,
      }
    : resolvedFreightFunding;
  const feeBreakdown = calculateOrderFees(
    params.subtotal,
    freightFunding.buyerFreightCharge,
    freightFunding.sellerFreightContribution,
    params.commercialPolicy,
  );
  const freightFundingIneligibility =
    getSellerFreightFundingIneligibilityReason({
      sellerFreightContribution: freightFunding.sellerFreightContribution,
      sellerPayout: feeBreakdown.sellerPayout,
    });
  if (freightFundingIneligibility) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: freightFundingIneligibility,
    });
  }
  return { freightFunding, feeBreakdown };
}

async function calculateCheckoutTax(input: CalculateOrderTaxInput) {
  try {
    return await calculateOrderTax(input);
  } catch (error) {
    if (!(error instanceof TaxReadinessError)) throw error;
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: error.message,
      cause: error,
    });
  }
}

const SHIPPING_QUOTE_EXPIRED_MESSAGE =
  "Shipping quote has expired. Please select a new shipping option.";
const SHIPPING_QUOTE_INVALID_MESSAGE =
  "Shipping quote is invalid. Please request shipping options again.";
const SHIPPING_BOOKING_EXPIRED_MESSAGE =
  "Shipping booking details have expired. Please select a new shipping option.";
const SHIPPING_BOOKING_INVALID_MESSAGE =
  "Shipping booking details are invalid. Please request shipping options again.";

function parseRedisJsonValue(
  value: unknown,
  invalidMessage: string,
): { parsed: unknown; raw: string } {
  if (typeof value === "string") {
    try {
      return { parsed: JSON.parse(value), raw: value };
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: invalidMessage,
      });
    }
  }

  try {
    return { parsed: value, raw: JSON.stringify(value) };
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: invalidMessage,
    });
  }
}

async function consumeAcceptedOfferShippingArtifacts<T>(params: {
  selectedQuoteToken?: string;
  /** @deprecated Ignored — consume is token-only to avoid shared quoteId races. */
  selectedQuoteId?: string;
  buyerId: string;
  listingId: string;
  quantitySqFt: number;
  destinationZip: string;
  listingFreight: {
    locationZip: string | null;
    freightClass: string | null;
    palletWeight: number | null;
    palletLength: number | null;
    palletWidth: number | null;
    palletHeight: number | null;
    sqFtPerBox: number | null;
    boxesPerPallet: number | null;
    totalPallets: number | null;
  };
  validateBeforeConsume: (quote: {
    fullFreightCharge: number;
    freightFundingMode: FreightFundingMode;
    buyerFreightCharge: number;
    sellerFreightContribution: number;
    destinationState: string;
    commercialPolicy: CommercialPolicy;
  }) => Promise<T> | T;
}): Promise<{
  quoteId: string;
  shippingPrice: number;
  carrierRate: number;
  shippingMargin: number;
  selectedCarrier: string;
  estimatedTransitDays: number | undefined;
  quoteExpiresAt: Date;
  bookingSnapshot: ShippingBookingSnapshot;
  quotedFreightFunding: {
    freightFundingMode: FreightFundingMode;
    buyerFreightCharge: number;
    sellerFreightContribution: number;
    destinationState: string;
  };
  validationResult: T;
  /** Restore Redis artifacts if the DB transaction fails after CAS-delete. */
  restoreArtifacts: {
    quoteKey: string;
    quoteValue: string;
    snapshotKey: string;
    snapshotValue: string;
    quoteExpiresAt: Date;
  };
}> {
  if (!params.selectedQuoteToken) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A valid shipping quote is required before checkout.",
    });
  }

  const quoteKey = getShippingQuoteTokenKey(params.selectedQuoteToken);
  const snapshotKey = getShippingBookingSnapshotKeyByToken(
    params.selectedQuoteToken,
  );

  const cachedQuote = await redis.get(quoteKey);
  if (!cachedQuote) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: SHIPPING_QUOTE_EXPIRED_MESSAGE,
    });
  }

  const { parsed: rawQuote, raw: rawQuoteString } = parseRedisJsonValue(
    cachedQuote,
    SHIPPING_QUOTE_INVALID_MESSAGE,
  );
  const parsedQuote = cachedQuoteSchema.safeParse(rawQuote);
  if (!parsedQuote.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: SHIPPING_QUOTE_INVALID_MESSAGE,
    });
  }

  const quote = parsedQuote.data;
  if (quote.buyerId !== params.buyerId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Shipping quote does not belong to this buyer.",
    });
  }

  if (quote.listingId !== params.listingId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Shipping quote does not match this listing.",
    });
  }

  if (Math.abs(quote.quantitySqFt - params.quantitySqFt) > 0.01) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Shipping quote quantity does not match the offer.",
    });
  }

  if (
    normalizeZip(quote.destinationZip) !== normalizeZip(params.destinationZip)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Shipping quote destination does not match the shipping ZIP.",
    });
  }

  if (
    !quote.quoteExpiresAt ||
    Number.isNaN(new Date(quote.quoteExpiresAt).getTime()) ||
    !isQuoteBookable(
      quote.quoteExpiresAt,
      Date.now(),
      SHIPPING_OFFER_BOOKABILITY_BUFFER_MS,
    )
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: SHIPPING_QUOTE_EXPIRED_MESSAGE,
    });
  }

  const quoteId = String(quote.quoteId);
  const quoteExpiresAt = new Date(quote.quoteExpiresAt);
  const cachedSnapshot = await redis.get(snapshotKey);
  if (!cachedSnapshot) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: SHIPPING_BOOKING_EXPIRED_MESSAGE,
    });
  }

  const { parsed: rawSnapshot, raw: rawSnapshotString } = parseRedisJsonValue(
    cachedSnapshot,
    SHIPPING_BOOKING_INVALID_MESSAGE,
  );
  const parsedSnapshot = shippingBookingSnapshotSchema.safeParse(rawSnapshot);
  if (!parsedSnapshot.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: SHIPPING_BOOKING_INVALID_MESSAGE,
    });
  }

  const bookingSnapshot = parsedSnapshot.data;
  const matchesVerifiedQuote =
    String(bookingSnapshot.quoteId) === quoteId &&
    bookingSnapshot.listingId === params.listingId &&
    bookingSnapshot.buyerId === params.buyerId &&
    Math.abs(bookingSnapshot.quantitySqFt - params.quantitySqFt) <= 0.01 &&
    normalizeZip(bookingSnapshot.destinationZip) ===
      normalizeZip(params.destinationZip) &&
    bookingSnapshot.carrierName === quote.carrierName &&
    Math.abs(bookingSnapshot.carrierRate - quote.carrierRate) <= 0.01 &&
    Math.abs(bookingSnapshot.shippingPrice - quote.shippingPrice) <= 0.01 &&
    bookingSnapshot.transitDays === quote.transitDays &&
    new Date(bookingSnapshot.quoteExpiresAt).getTime() ===
      quoteExpiresAt.getTime() &&
    isQuoteBookable(
      quoteExpiresAt,
      Date.now(),
      SHIPPING_OFFER_BOOKABILITY_BUFFER_MS,
    );
  if (!matchesVerifiedQuote) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Shipping booking details do not match the selected quote. Please request shipping options again.",
    });
  }

  let palletsNeeded: number;
  try {
    palletsNeeded = computePalletsNeeded({
      quantitySqFt: params.quantitySqFt,
      sqFtPerBox: params.listingFreight.sqFtPerBox,
      boxesPerPallet: params.listingFreight.boxesPerPallet,
      totalPallets: params.listingFreight.totalPallets,
    });
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Listing freight information changed. Please request shipping options again.",
    });
  }
  if (
    !freightSnapshotMatchesListing({
      snapshot: bookingSnapshot,
      listing: params.listingFreight,
      palletsNeeded,
    })
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Listing freight dimensions or origin changed. Please request shipping options again.",
    });
  }

  const consumption = await validateThenCompareDeletePair({
    redisClient: redis,
    firstKey: quoteKey,
    firstExpectedValue: rawQuoteString,
    secondKey: snapshotKey,
    secondExpectedValue: rawSnapshotString,
    validate: () =>
      params.validateBeforeConsume({
        fullFreightCharge: quote.shippingPrice,
        freightFundingMode: quote.freightFundingMode,
        buyerFreightCharge: quote.buyerFreightCharge,
        sellerFreightContribution: quote.sellerFreightContribution,
        destinationState: quote.destinationState,
        commercialPolicy:
          bookingSnapshot.commercialPolicy ?? CURRENT_COMMERCIAL_POLICY,
      }),
  });

  if (!consumption.consumed) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: SHIPPING_QUOTE_EXPIRED_MESSAGE,
    });
  }

  return {
    quoteId,
    shippingPrice: quote.shippingPrice,
    carrierRate: quote.carrierRate,
    shippingMargin:
      Math.round((quote.shippingPrice - quote.carrierRate) * 100) / 100,
    selectedCarrier: quote.carrierName,
    estimatedTransitDays: quote.transitDays,
    quoteExpiresAt,
    bookingSnapshot,
    quotedFreightFunding: {
      freightFundingMode: quote.freightFundingMode,
      buyerFreightCharge: quote.buyerFreightCharge,
      sellerFreightContribution: quote.sellerFreightContribution,
      destinationState: quote.destinationState,
    },
    validationResult: consumption.validationResult,
    restoreArtifacts: {
      quoteKey,
      quoteValue: rawQuoteString,
      snapshotKey,
      snapshotValue: rawSnapshotString,
      quoteExpiresAt,
    },
  };
}

async function restoreConsumedShippingArtifacts(params: {
  quoteKey: string;
  quoteValue: string;
  snapshotKey: string;
  snapshotValue: string;
  quoteExpiresAt: Date;
}): Promise<void> {
  // Never restore unbookable/expired artifacts — buyer must re-quote.
  const ttlSeconds = quoteArtifactTtlSeconds(params.quoteExpiresAt);
  if (ttlSeconds == null || ttlSeconds <= 0) return;
  await Promise.all([
    redis.set(params.quoteKey, params.quoteValue, { ex: ttlSeconds }),
    redis.set(params.snapshotKey, params.snapshotValue, { ex: ttlSeconds }),
  ]);
}

async function saveShippingAddressBestEffort(params: {
  db: Database;
  userId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone?: string;
}): Promise<void> {
  try {
    const now = new Date();
    const retentionPurgeAfter = addRetentionDays(
      now,
      SHIPPING_ADDRESS_RETENTION_DAYS,
    );

    await params.db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '2000ms'`);
      await tx.execute(sql`set local lock_timeout = '1500ms'`);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`shipping-address:${params.userId}`}))`,
      );
      const [existing] = await tx
        .select({ id: shippingAddresses.id })
        .from(shippingAddresses)
        .where(
          and(
            eq(shippingAddresses.userId, params.userId),
            eq(shippingAddresses.address, params.address),
            eq(shippingAddresses.zip, params.zip),
          ),
        )
        .limit(1);
      if (existing) {
        await tx
          .update(shippingAddresses)
          .set({
            lastUsedAt: now,
            retentionPurgeAfter,
            updatedAt: now,
          })
          .where(eq(shippingAddresses.id, existing.id));
        return;
      }

      await tx.insert(shippingAddresses).values({
        userId: params.userId,
        label: `${params.city}, ${params.state}`,
        name: params.name,
        address: params.address,
        city: params.city,
        state: params.state,
        zip: params.zip,
        phone: params.phone ?? null,
        isDefault: false,
        lastUsedAt: now,
        retentionPurgeAfter,
      });
    });
  } catch {
    console.error("Best-effort shipping address save failed");
  }
}

export const orderRouter = createTRPCRouter({
  // Create a new order (Buy Now) — wrapped in a transaction with row locking
  create: strictVerifiedBuyerProcedure
    .input(createOrderSchema)
    .mutation(async ({ ctx, input }) => {
      let restoreArtifacts: Awaited<
        ReturnType<typeof consumeAcceptedOfferShippingArtifacts>
      >["restoreArtifacts"] | null = null;
      let order;
      try {
      order = await ctx.db.transaction(async (tx) => {
        await enforcePendingOrderLimit(tx, ctx.user.id);

        // Lock the listing row to prevent concurrent purchases (SELECT ... FOR UPDATE)
        const [listing] = await tx
          .select()
          .from(listings)
          .where(
            and(
              eq(listings.id, input.listingId),
              eq(listings.status, "active")
            )
          )
          .for("update");

        if (!listing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found or no longer available",
          });
        }

        assertListingVisibleToBuyer(
          listing,
          "Listing not found or no longer available",
        );

        const destinationState = getVerifiedDestinationState({
          shippingState: input.shippingState,
          shippingZip: input.shippingZip,
        });
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

        // Validate quantity — convert MOQ to sq ft if specified in pallets
        const moqSqFt = listing.moqUnit === "pallets" && listing.moq
          ? listing.moq * (listing.sqFtPerBox ?? 20) * (listing.boxesPerPallet ?? 30)
          : (listing.moq ?? 0);

        if (moqSqFt > 0 && input.quantitySqFt < moqSqFt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Minimum order quantity is ${moqSqFt} sq ft`,
          });
        }

        if (input.quantitySqFt > listing.totalSqFt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Maximum available quantity is ${listing.totalSqFt} sq ft`,
          });
        }

        // Validate box-size multiples
        if (listing.sqFtPerBox && listing.sqFtPerBox > 0) {
          const remainder = input.quantitySqFt % listing.sqFtPerBox;
          // Allow small floating-point tolerance
          if (remainder > 0.01 && (listing.sqFtPerBox - remainder) > 0.01) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Quantity must be a multiple of ${listing.sqFtPerBox} sq ft (box size)`,
            });
          }
        }

        // Prevent self-purchase
        if (listing.sellerId === ctx.user.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You cannot purchase your own listing",
          });
        }

        await assertSellerPayoutReadyForOrderReservation(tx, listing.sellerId);

        const resolvedListingPrice = resolveListingUnitPrice({
          baseUnitPrice: listing.buyNowPrice ?? listing.askPricePerSqFt,
          availableQuantity: listing.totalSqFt,
          requestedQuantity: input.quantitySqFt,
          fullLotOnly: listing.fullLotOnly,
          partialQuantityMarkupPercent: listing.partialQuantityMarkupPercent,
        });
        if (!resolvedListingPrice.isValid || !resolvedListingPrice.purchaseAllowed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              resolvedListingPrice.reason === "blocked_full_lot_only"
                ? "This seller currently sells this inventory only as a full lot."
                : "The selected quantity or pricing configuration is not valid for this listing.",
          });
        }

        const pricePerSqFt = resolvedListingPrice.finalUnitPrice!;
        const subtotal =
          Math.round(input.quantitySqFt * pricePerSqFt * 100) / 100;
        // Every business/provider check runs while the quote and booking
        // snapshot remain in Redis. Only a successful validation reaches the
        // compare-and-delete CAS, so a tax readiness failure is retryable.
        const {
          quoteId: verifiedQuoteId,
          shippingPrice: verifiedShippingPrice,
          carrierRate: verifiedCarrierRate,
          shippingMargin: verifiedShippingMargin,
          selectedCarrier: verifiedSelectedCarrier,
          estimatedTransitDays: verifiedEstimatedTransitDays,
          quoteExpiresAt,
          bookingSnapshot: verifiedBookingSnapshot,
          validationResult: {
            freightFunding,
            feeBreakdown,
            checkoutTax,
          },
          restoreArtifacts: consumedRestore,
        } = await consumeAcceptedOfferShippingArtifacts({
          selectedQuoteToken: input.selectedQuoteToken,
          selectedQuoteId: input.selectedQuoteId,
          buyerId: ctx.user.id,
          listingId: listing.id,
          quantitySqFt: input.quantitySqFt,
          destinationZip: input.shippingZip,
          listingFreight: {
            locationZip: listing.locationZip,
            freightClass: listing.freightClass,
            palletWeight: listing.palletWeight,
            palletLength: listing.palletLength,
            palletWidth: listing.palletWidth,
            palletHeight: listing.palletHeight,
            sqFtPerBox: listing.sqFtPerBox,
            boxesPerPallet: listing.boxesPerPallet,
            totalPallets: listing.totalPallets,
          },
          validateBeforeConsume: async (quotedFreightFunding) => {
            const {
              freightFunding,
              feeBreakdown: preTaxFeeBreakdown,
            } = calculateFreightFundedOrderFees({
              listing: {
                freightPaymentMode: listing.freightPaymentMode,
                sellerFreightStates: listing.sellerFreightStates,
                freightDropCharge: listing.freightDropCharge,
              },
              subtotal,
              fullFreightCharge:
                quotedFreightFunding.fullFreightCharge,
              destinationState,
              commercialPolicy: quotedFreightFunding.commercialPolicy,
              quotedFreightFunding,
            });
            const checkoutTax = await calculateCheckoutTax({
              checkoutReference:
                input.selectedQuoteToken ?? input.selectedQuoteId!,
              listingId: listing.id,
              inventoryAmount: subtotal,
              buyerFreightAmount: freightFunding.buyerFreightCharge,
              buyerMarketplaceFeeAmount: preTaxFeeBreakdown.buyerFee,
              inventoryTaxCode: listing.stripeTaxCode,
              inventoryTaxCodeStatus: listing.taxCodeStatus,
              shipFrom: {
                city: listing.locationCity,
                state: listing.locationState,
                postalCode: listing.locationZip,
              },
              shipTo: {
                line1: input.shippingAddress,
                city: input.shippingCity,
                state: destinationState,
                postalCode: input.shippingZip,
              },
            });
            const feeBreakdown =
              checkoutTax.taxLiability === "platform"
                ? applyPlatformLiableTaxToOrderFees(
                    preTaxFeeBreakdown,
                    checkoutTax.taxAmount,
                    quotedFreightFunding.commercialPolicy,
                  )
                : preTaxFeeBreakdown;
            return { freightFunding, feeBreakdown, checkoutTax };
          },
        });
        restoreArtifacts = consumedRestore;

        // Create the order within the transaction
        const [newOrder] = await tx
          .insert(orders)
          .values({
            orderNumber: generateOrderNumber(),
            buyerId: ctx.user.id,
            sellerId: listing.sellerId,
            listingId: listing.id,
            quantitySqFt: input.quantitySqFt,
            pricePerSqFt,
            subtotal,
            buyerFee: feeBreakdown.buyerFee,
            sellerFee: feeBreakdown.sellerFee,
            stripeProcessingFee: feeBreakdown.totalStripeFee,
            sellerStripeFee: feeBreakdown.sellerStripeFee,
            platformStripeFee: feeBreakdown.platformStripeFee,
            totalPrice: feeBreakdown.totalCharge,
            originalSellerPayout: feeBreakdown.sellerPayout,
            sellerPayout: feeBreakdown.sellerPayout,
            commercialPolicySnapshot:
              verifiedBookingSnapshot.commercialPolicy ??
              captureCommercialPolicy(),
            ...checkoutTax,
            shippingName: input.shippingName,
            shippingAddress: input.shippingAddress,
            shippingCity: input.shippingCity,
            shippingState: input.shippingState,
            shippingZip: input.shippingZip,
            shippingPhone: input.shippingPhone,
            // Priority1 shipping fields (if buyer selected a shipping quote)
            // Use VERIFIED values from Redis cache, not client input
            ...(verifiedQuoteId && {
              selectedQuoteId: verifiedQuoteId,
              selectedCarrier: verifiedSelectedCarrier,
              carrierRate: verifiedCarrierRate,
              shippingPrice: verifiedShippingPrice,
              freightFundingMode: freightFunding.appliedMode,
              buyerFreightCharge: freightFunding.buyerFreightCharge,
              sellerFreightContribution:
                freightFunding.sellerFreightContribution,
              shippingMargin: verifiedShippingMargin,
              estimatedTransitDays: verifiedEstimatedTransitDays,
              quoteExpiresAt,
              shippingBookingSnapshot: verifiedBookingSnapshot,
            }),
            status: "pending",
            escrowStatus: "held",
          })
          .returning();

        await reserveListingInventory({
          db: tx,
          listingId: listing.id,
          availableQuantity: listing.totalSqFt,
          reservedQuantity: input.quantitySqFt,
        });

        return newOrder;
      });
      } catch (error) {
        if (restoreArtifacts) {
          await restoreConsumedShippingArtifacts(restoreArtifacts).catch(
            (restoreError) => {
              console.error(
                "Failed to restore shipping quote artifacts after order create failure",
                restoreError,
              );
            },
          );
        }
        throw error;
      }

      await saveShippingAddressBestEffort({
        db: ctx.db,
        userId: ctx.user.id,
        name: input.shippingName,
        address: input.shippingAddress,
        city: input.shippingCity,
        state: input.shippingState,
        zip: input.shippingZip,
        phone: input.shippingPhone,
      });

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalPrice: order.totalPrice,
        taxAmount: order.taxAmount,
        taxStatus: order.taxStatus,
        taxLiability: order.taxLiability,
        taxJurisdictionSummary: order.taxJurisdictionSummary,
      };
    }),

  // Create an order from an accepted offer
  createFromOffer: strictVerifiedBuyerProcedure
    .input(createOrderFromOfferSchema)
    .mutation(async ({ ctx, input }) => {
      let restoreArtifacts: Awaited<
        ReturnType<typeof consumeAcceptedOfferShippingArtifacts>
      >["restoreArtifacts"] | null = null;
      let order;
      try {
      order = await ctx.db.transaction(async (tx) => {
        await enforcePendingOrderLimit(tx, ctx.user.id);

        // Lock offer row with FOR UPDATE
        const [offer] = await tx
          .select()
          .from(offers)
          .where(eq(offers.id, input.offerId))
          .for("update");

        if (!offer) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Offer not found",
          });
        }

        // Validate offer belongs to this buyer
        if (offer.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only create orders from your own offers",
          });
        }

        // Validate offer status
        if (offer.status !== "accepted") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only accepted offers can be converted to orders",
          });
        }

        // Validate no order already created from this offer
        if (offer.orderId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "An order has already been created from this offer",
          });
        }

        // Validate offer has not expired
        if (offer.expiresAt && new Date() > offer.expiresAt) {
          // Auto-expire the offer
          await tx
            .update(offers)
            .set({ status: "expired", updatedAt: new Date() })
            .where(eq(offers.id, input.offerId));

          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This offer has expired. Please negotiate a new offer.",
          });
        }

        // Lock listing row with FOR UPDATE
        const [listing] = await tx
          .select()
          .from(listings)
          .where(
            and(
              eq(listings.id, offer.listingId),
              eq(listings.status, "active")
            )
          )
          .for("update");

        if (!listing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found or no longer available",
          });
        }

        assertListingVisibleToBuyer(
          listing,
          "Listing not found or no longer available",
        );

        const destinationState = getVerifiedDestinationState({
          shippingState: input.shippingState,
          shippingZip: input.shippingZip,
        });
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

        // Validate sufficient quantity
        const minimumOrderQtySqFt = getMinimumOrderQuantitySqFt(listing);

        if (
          minimumOrderQtySqFt > 0 &&
          Number(offer.quantitySqFt) <
            minimumOrderQtySqFt - QUANTITY_TOLERANCE_SQFT
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Minimum order quantity is ${minimumOrderQtySqFt} sq ft`,
          });
        }

        if (
          Number(offer.quantitySqFt) >
          Number(listing.totalSqFt) + QUANTITY_TOLERANCE_SQFT
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Insufficient inventory. Only ${listing.totalSqFt} sq ft available.`,
          });
        }

        if (
          listing.fullLotOnly &&
          Number(offer.quantitySqFt) <
            Number(listing.totalSqFt) - QUANTITY_TOLERANCE_SQFT
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This seller currently sells this inventory only as a full lot.",
          });
        }

        await assertSellerPayoutReadyForOrderReservation(tx, listing.sellerId);

        // Price and freight funding are both locked before the quote artifacts
        // are atomically consumed, so a business-rule rejection remains
        // retryable with the same verified quote.
        const pricePerSqFt =
          offer.counterPricePerSqFt ?? offer.offerPricePerSqFt;
        const subtotal =
          Math.round(offer.quantitySqFt * pricePerSqFt * 100) / 100;
        const listingFreightSnapshot = {
          freightPaymentMode: listing.freightPaymentMode,
          sellerFreightStates: listing.sellerFreightStates,
          freightDropCharge: listing.freightDropCharge,
        };
        const {
          quoteId: verifiedQuoteId,
          shippingPrice: verifiedShippingPrice,
          carrierRate: verifiedCarrierRate,
          shippingMargin: verifiedShippingMargin,
          selectedCarrier: verifiedSelectedCarrier,
          estimatedTransitDays: verifiedEstimatedTransitDays,
          quoteExpiresAt,
          bookingSnapshot: verifiedBookingSnapshot,
          validationResult: {
            freightFunding,
            feeBreakdown,
            checkoutTax,
          },
          restoreArtifacts: consumedRestore,
        } = await consumeAcceptedOfferShippingArtifacts({
          selectedQuoteToken: input.selectedQuoteToken,
          selectedQuoteId: input.selectedQuoteId,
          buyerId: ctx.user.id,
          listingId: offer.listingId,
          quantitySqFt: offer.quantitySqFt,
          destinationZip: input.shippingZip,
          listingFreight: {
            locationZip: listing.locationZip,
            freightClass: listing.freightClass,
            palletWeight: listing.palletWeight,
            palletLength: listing.palletLength,
            palletWidth: listing.palletWidth,
            palletHeight: listing.palletHeight,
            sqFtPerBox: listing.sqFtPerBox,
            boxesPerPallet: listing.boxesPerPallet,
            totalPallets: listing.totalPallets,
          },
          validateBeforeConsume: async (quotedFreightFunding) => {
            const {
              freightFunding,
              feeBreakdown: preTaxFeeBreakdown,
            } = calculateFreightFundedOrderFees({
              listing: listingFreightSnapshot,
              subtotal,
              fullFreightCharge:
                quotedFreightFunding.fullFreightCharge,
              destinationState,
              commercialPolicy:
                quotedFreightFunding.commercialPolicy,
              quotedFreightFunding,
            });
            const checkoutTax = await calculateCheckoutTax({
              checkoutReference:
                input.selectedQuoteToken ?? input.selectedQuoteId!,
              listingId: listing.id,
              inventoryAmount: subtotal,
              buyerFreightAmount: freightFunding.buyerFreightCharge,
              buyerMarketplaceFeeAmount: preTaxFeeBreakdown.buyerFee,
              inventoryTaxCode: listing.stripeTaxCode,
              inventoryTaxCodeStatus: listing.taxCodeStatus,
              shipFrom: {
                city: listing.locationCity,
                state: listing.locationState,
                postalCode: listing.locationZip,
              },
              shipTo: {
                line1: input.shippingAddress,
                city: input.shippingCity,
                state: destinationState,
                postalCode: input.shippingZip,
              },
            });
            const feeBreakdown =
              checkoutTax.taxLiability === "platform"
                ? applyPlatformLiableTaxToOrderFees(
                    preTaxFeeBreakdown,
                    checkoutTax.taxAmount,
                    quotedFreightFunding.commercialPolicy,
                  )
                : preTaxFeeBreakdown;
            return { freightFunding, feeBreakdown, checkoutTax };
          },
        });
        restoreArtifacts = consumedRestore;

        // Create the order with offerId linked
        const [newOrder] = await tx
          .insert(orders)
          .values({
            orderNumber: generateOrderNumber(),
            buyerId: ctx.user.id,
            sellerId: offer.sellerId,
            listingId: offer.listingId,
            offerId: offer.id,
            quantitySqFt: offer.quantitySqFt,
            pricePerSqFt,
            subtotal,
            buyerFee: feeBreakdown.buyerFee,
            sellerFee: feeBreakdown.sellerFee,
            stripeProcessingFee: feeBreakdown.totalStripeFee,
            sellerStripeFee: feeBreakdown.sellerStripeFee,
            platformStripeFee: feeBreakdown.platformStripeFee,
            totalPrice: feeBreakdown.totalCharge,
            originalSellerPayout: feeBreakdown.sellerPayout,
            sellerPayout: feeBreakdown.sellerPayout,
            commercialPolicySnapshot:
              verifiedBookingSnapshot.commercialPolicy ??
              captureCommercialPolicy(),
            ...checkoutTax,
            shippingName: input.shippingName,
            shippingAddress: input.shippingAddress,
            shippingCity: input.shippingCity,
            shippingState: input.shippingState,
            shippingZip: input.shippingZip,
            shippingPhone: input.shippingPhone,
            // Priority1 shipping fields (verified from Redis cache)
            ...(verifiedQuoteId && {
              selectedQuoteId: verifiedQuoteId,
              selectedCarrier: verifiedSelectedCarrier,
              carrierRate: verifiedCarrierRate,
              shippingPrice: verifiedShippingPrice,
              freightFundingMode: freightFunding.appliedMode,
              buyerFreightCharge: freightFunding.buyerFreightCharge,
              sellerFreightContribution:
                freightFunding.sellerFreightContribution,
              shippingMargin: verifiedShippingMargin,
              estimatedTransitDays: verifiedEstimatedTransitDays,
              quoteExpiresAt,
              shippingBookingSnapshot: verifiedBookingSnapshot,
            }),
            status: "pending",
            escrowStatus: "held",
          })
          .returning();

        // Link the order back to the offer
        await tx
          .update(offers)
          .set({
            orderId: newOrder!.id,
            updatedAt: new Date(),
          })
          .where(eq(offers.id, offer.id));

        await reserveListingInventory({
          db: tx,
          listingId: listing.id,
          availableQuantity: listing.totalSqFt,
          reservedQuantity: offer.quantitySqFt,
        });

        return newOrder;
      });
      } catch (error) {
        if (restoreArtifacts) {
          await restoreConsumedShippingArtifacts(restoreArtifacts).catch(
            (restoreError) => {
              console.error(
                "Failed to restore shipping quote artifacts after offer order create failure",
                restoreError,
              );
            },
          );
        }
        throw error;
      }

      await saveShippingAddressBestEffort({
        db: ctx.db,
        userId: ctx.user.id,
        name: input.shippingName,
        address: input.shippingAddress,
        city: input.shippingCity,
        state: input.shippingState,
        zip: input.shippingZip,
        phone: input.shippingPhone,
      });

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalPrice: order.totalPrice,
        taxAmount: order.taxAmount,
        taxStatus: order.taxStatus,
        taxLiability: order.taxLiability,
        taxJurisdictionSummary: order.taxJurisdictionSummary,
      };
    }),

  // Get order by ID
  getById: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: and(
          eq(orders.id, input.id),
          // Users can only see their own orders
          ctx.user.role === "admin"
            ? undefined
            : ctx.user.role === "seller"
              ? eq(orders.sellerId, ctx.user.id)
              : eq(orders.buyerId, ctx.user.id)
        ),
        columns: {
          id: true,
          orderNumber: true,
          buyerId: true,
          sellerId: true,
          listingId: true,
          quantitySqFt: true,
          pricePerSqFt: true,
          subtotal: true,
          buyerFee: true,
          sellerFee: true,
          sellerStripeFee: true,
          taxAmount: true,
          taxStatus: true,
          taxLiability: true,
          taxJurisdictionSummary: true,
          taxReversalStatus: true,
          totalPrice: true,
          sellerPayout: true,
          shippingName: true,
          shippingAddress: true,
          shippingCity: true,
          shippingState: true,
          shippingZip: true,
          shippingPhone: true,
          trackingNumber: true,
          carrier: true,
          shippingPrice: true,
          freightFundingMode: true,
          buyerFreightCharge: true,
          sellerFreightContribution: true,
          carrierRate: true,
          shippingMargin: true,
          selectedQuoteId: true,
          selectedCarrier: true,
          estimatedTransitDays: true,
          quoteExpiresAt: true,
          status: true,
          escrowStatus: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          confirmedAt: true,
          shippedAt: true,
          deliveredAt: true,
          cancelledAt: true,
          refundedAt: true,
          refundedAmount: true,
          stripeRefundId: true,
          paymentStatus: true,
          stripePaymentIntentId: true,
          stripeTransferId: true,
          stripeTransferReversalId: true,
          transferReversedAmount: true,
          transferFailedAt: true,
          transferError: true,
        },
        with: {
          listing: {
            columns: {
              id: true,
              slug: true,
              title: true,
              description: true,
              materialType: true,
              species: true,
              finish: true,
              grade: true,
              color: true,
              colorFamily: true,
              thickness: true,
              width: true,
              length: true,
              wearLayer: true,
              brand: true,
              modelNumber: true,
              sqFtPerBox: true,
              boxesPerPallet: true,
              condition: true,
              certifications: true,
            },
            with: {
              media: {
                columns: {
                  id: true,
                  url: true,
                  altText: true,
                  sortOrder: true,
                },
                orderBy: (media, { asc }) => [asc(media.sortOrder)],
                limit: 1,
              },
            },
          },
          buyer: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              email: true,
              phone: true,
              role: true,
              businessCity: true,
              businessState: true,
            },
          },
          seller: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              email: true,
              phone: true,
              role: true,
              businessCity: true,
              businessState: true,
            },
          },
          shipment: {
            columns: {
              status: true,
              dispatchedAt: true,
              pickupDate: true,
              deliveredAt: true,
            },
          },
          dispute: {
            columns: {
              status: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      const isAdmin = ctx.user.role === "admin";
      const isSeller = ctx.user.id === order.sellerId;
      const {
        sellerFee,
        sellerStripeFee,
        sellerPayout,
        carrierRate,
        shippingMargin,
        stripePaymentIntentId,
        stripeTransferId,
        stripeTransferReversalId,
        transferReversedAmount,
        transferFailedAt,
        transferError,
        stripeRefundId,
        notes,
        escrowStatus,
        shippingName,
        shippingAddress,
        shippingCity,
        shippingState,
        shippingZip,
        shippingPhone,
        ...participantOrder
      } = order;
      const canSeeShippingDestination =
        isAdmin || !isSeller || Boolean(order.confirmedAt);

      return {
        ...participantOrder,
        shippingName: canSeeShippingDestination ? shippingName : null,
        shippingAddress: canSeeShippingDestination ? shippingAddress : null,
        shippingCity: canSeeShippingDestination ? shippingCity : null,
        shippingState: canSeeShippingDestination ? shippingState : null,
        shippingZip: canSeeShippingDestination ? shippingZip : null,
        shippingPhone: canSeeShippingDestination ? shippingPhone : null,
        sellerTransferStatus: getSellerTransferStatus(
          escrowStatus,
          participantOrder.paymentStatus,
        ),
        buyer: maskUserForOrder(order.buyer, order.status, isAdmin),
        seller: maskUserForOrder(order.seller, order.status, isAdmin),
        sellerFinancials:
          isSeller || isAdmin
            ? {
                sellerFee,
                sellerStripeFee,
                sellerFreightContribution:
                  participantOrder.sellerFreightContribution,
                sellerPayout,
                payoutStatus: order.escrowStatus,
                payoutNeedsAttention: Boolean(transferFailedAt),
              }
            : null,
        adminFinancials: isAdmin
          ? {
              carrierRate,
              shippingMargin,
              stripePaymentIntentId,
              stripeTransferId,
              stripeTransferReversalId,
              transferReversedAmount,
              transferFailedAt,
              transferError,
              stripeRefundId,
              notes,
            }
          : null,
      };
    }),

  // Get buyer's orders
  getMyOrders: buyerProcedure
    .input(
      z.object({
        status: z
          .enum([
            "pending",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
            "refunded",
          ])
          .optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(orders.buyerId, ctx.user.id)];
      if (input.status) {
        conditions.push(eq(orders.status, input.status));
      }

      const where = and(...conditions);
      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        ctx.db.query.orders.findMany({
          where,
          columns: {
            id: true,
            orderNumber: true,
            quantitySqFt: true,
            totalPrice: true,
            shippingPrice: true,
            freightFundingMode: true,
            buyerFreightCharge: true,
            sellerFreightContribution: true,
            status: true,
            createdAt: true,
          },
          with: {
            listing: {
              columns: {
                id: true,
                title: true,
                materialType: true,
              },
              with: {
                media: {
                  columns: {
                    id: true,
                    url: true,
                    altText: true,
                    sortOrder: true,
                  },
                  orderBy: (media, { asc }) => [asc(media.sortOrder)],
                  limit: 1,
                },
              },
            },
            seller: {
              columns: {
                id: true,
                name: true,
                role: true,
                businessCity: true,
                businessState: true,
              },
            },
          },
          orderBy: desc(orders.createdAt),
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(orders)
          .where(where),
      ]);

      const total = countResult[0]?.count ?? 0;

      return {
        items: items.map((item) => ({
          ...item,
          seller: maskUserForOrder(item.seller, item.status, false),
        })),
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        hasMore: offset + items.length < total,
      };
    }),

  // Get seller's orders
  getSellerOrders: sellerProcedure
    .input(
      z.object({
        status: z
          .enum([
            "pending",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
            "refunded",
          ])
          .optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(orders.sellerId, ctx.user.id)];
      if (input.status) {
        conditions.push(eq(orders.status, input.status));
      }

      const where = and(...conditions);
      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        ctx.db.query.orders.findMany({
          where,
          columns: {
            id: true,
            orderNumber: true,
            quantitySqFt: true,
            subtotal: true,
            totalPrice: true,
            sellerFee: true,
            sellerStripeFee: true,
            sellerPayout: true,
            shippingPrice: true,
            freightFundingMode: true,
            buyerFreightCharge: true,
            sellerFreightContribution: true,
            status: true,
            createdAt: true,
          },
          with: {
            listing: {
              columns: {
                id: true,
                title: true,
                materialType: true,
              },
              with: {
                media: {
                  columns: {
                    id: true,
                    url: true,
                    altText: true,
                    sortOrder: true,
                  },
                  orderBy: (media, { asc }) => [asc(media.sortOrder)],
                  limit: 1,
                },
              },
            },
            buyer: {
              columns: {
                id: true,
                name: true,
                role: true,
                businessCity: true,
                businessState: true,
              },
            },
          },
          orderBy: desc(orders.createdAt),
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(orders)
          .where(where),
      ]);

      const total = countResult[0]?.count ?? 0;

      return {
        items: items.map((item) => ({
          ...item,
          buyer: maskUserForOrder(item.buyer, item.status, false),
        })),
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        hasMore: offset + items.length < total,
      };
    }),

  // Update order status (seller action) — with status transition validation
  updateStatus: sellerProcedure
    .input(updateOrderStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const initialOrder = await ctx.db.query.orders.findFirst({
        where: and(
          eq(orders.id, input.orderId),
          eq(orders.sellerId, ctx.user.id)
        ),
        columns: {
          id: true,
          status: true,
          escrowStatus: true,
          paymentStatus: true,
          selectedQuoteId: true,
          stripePaymentIntentId: true,
          totalPrice: true,
        },
      });

      if (!initialOrder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      assertSellerStatusTransition(initialOrder, input.status);

      if (input.status === "cancelled") {
        await cancelUncapturedOrderPayment({
          orderId: initialOrder.id,
          paymentIntentId: initialOrder.stripePaymentIntentId,
          expectedAmountCents: Math.round(Number(initialOrder.totalPrice) * 100),
        });
      }

      return ctx.db.transaction(async (tx) => {
        // Re-read under a row lock after any provider cancellation. Refund and
        // webhook handlers lock/update this same order, so stale seller actions
        // cannot overwrite a newer terminal financial state.
        const [lockedOrder] = await tx
          .select({
            id: orders.id,
            status: orders.status,
            escrowStatus: orders.escrowStatus,
            paymentStatus: orders.paymentStatus,
            selectedQuoteId: orders.selectedQuoteId,
            stripePaymentIntentId: orders.stripePaymentIntentId,
            totalPrice: orders.totalPrice,
          })
          .from(orders)
          .where(
            and(
              eq(orders.id, input.orderId),
              eq(orders.sellerId, ctx.user.id),
            ),
          )
          .for("update");

        if (!lockedOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }

        assertSellerStatusTransition(lockedOrder, input.status);

        if (
          input.status === "cancelled" &&
          (lockedOrder.stripePaymentIntentId !==
            initialOrder.stripePaymentIntentId ||
            Math.round(Number(lockedOrder.totalPrice) * 100) !==
              Math.round(Number(initialOrder.totalPrice) * 100))
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Order payment details changed while cancellation was in progress. Please refresh and retry.",
          });
        }

        const transitionedAt = new Date();
        const updateData: Record<string, unknown> = {
          status: input.status,
          updatedAt: transitionedAt,
        };

        if (input.trackingNumber) {
          updateData.trackingNumber = input.trackingNumber;
        }
        if (input.carrier) {
          updateData.carrier = input.carrier;
        }
        if (input.notes) {
          updateData.notes = input.notes;
        }

        switch (input.status) {
          case "confirmed":
            updateData.confirmedAt = transitionedAt;
            break;
          case "shipped":
            updateData.shippedAt = transitionedAt;
            break;
          case "delivered":
            updateData.deliveredAt = transitionedAt;
            break;
          case "cancelled":
            updateData.cancelledAt = transitionedAt;
            if (lockedOrder.escrowStatus === "held") {
              updateData.escrowStatus = "refunded";
            }
            break;
        }

        const [updated] = await tx
          .update(orders)
          .set(updateData)
          .where(
            and(
              eq(orders.id, input.orderId),
              eq(orders.sellerId, ctx.user.id),
              eq(orders.status, lockedOrder.status),
            ),
          )
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Order changed while it was being updated. Please retry.",
          });
        }

        if (input.status === "cancelled") {
          await releaseReservedInventory({
            db: tx,
            orderId: input.orderId,
            reason: "seller_cancelled_before_delivery",
          });
        }

        return updated;
      });
    }),

  // Get seller order stats
  getSellerOrderStats: sellerProcedure.query(async ({ ctx }) => {
    const stats = await ctx.db
      .select({
        status: orders.status,
        count: sql<number>`count(*)::int`,
        totalRevenue: sql<number>`coalesce(sum(${orders.sellerPayout}), 0)::float`,
      })
      .from(orders)
      .where(eq(orders.sellerId, ctx.user.id))
      .groupBy(orders.status);

    return stats;
  }),
});
