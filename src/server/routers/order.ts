import {
  createTRPCRouter,
  protectedProcedure,
  buyerProcedure,
  sellerProcedure,
  verifiedBuyerProcedure,
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
import { calculateOrderFees } from "@/lib/fees";
import { nanoid } from "nanoid";
import { sendOrderConfirmationEmail } from "@/lib/email/send";
import { inngest } from "@/lib/inngest/client";
import { redis } from "@/lib/redis/client";
import { maskUserForOrder } from "@/lib/contact-masking";
import { releaseReservedInventory } from "@/server/services/inventory-reservation";

function generateOrderNumber(): string {
  return `PM-${nanoid(8).toUpperCase()}`;
}

/** Valid order status transitions (state machine) */
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

const cachedQuoteSchema = z.object({
  quoteId: z.number().int().optional(),
  quoteToken: z.string().optional(),
  carrierRate: z.number(),
  shippingPrice: z.number(),
  carrierName: z.string(),
  carrierScac: z.string().optional(),
  transitDays: z.number().int().optional(),
  estimatedDelivery: z.string().optional(),
  quoteExpiresAt: z.string().optional(),
  listingId: z.string().uuid(),
  buyerId: z.string().uuid().optional(),
  quantitySqFt: z.number().positive().optional(),
  destinationZip: z.string().optional(),
});

function normalizeZip(zip: string): string {
  return zip.trim().slice(0, 5);
}

export const orderRouter = createTRPCRouter({
  // Create a new order (Buy Now) — wrapped in a transaction with row locking
  create: verifiedBuyerProcedure
    .input(createOrderSchema)
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.transaction(async (tx) => {
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

        // SECURITY: Verify shipping quote from server-side cache
        // Prevents client from manipulating shipping prices
        let verifiedShippingPrice = 0;
        let verifiedCarrierRate = 0;
        let verifiedShippingMargin = 0;
        let verifiedSelectedCarrier = input.selectedCarrier;
        let verifiedEstimatedTransitDays = input.estimatedTransitDays;
        let verifiedQuoteId: string | undefined;
        let quoteExpiresAt: Date | undefined;

        if (input.selectedQuoteToken) {
          const cachedQuote = await redis.get(
            `shipping-quote-token:${input.selectedQuoteToken}`,
          );

          if (!cachedQuote) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Shipping quote has expired. Please select a new shipping option.",
            });
          }

          const rawQuote =
            typeof cachedQuote === "string"
              ? JSON.parse(cachedQuote)
              : cachedQuote;
          const parsedQuote = cachedQuoteSchema.safeParse(rawQuote);
          if (!parsedQuote.success) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Shipping quote is invalid. Please request shipping options again.",
            });
          }

          const quote = parsedQuote.data;
          if (quote.listingId !== input.listingId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Shipping quote does not match the selected listing.",
            });
          }

          if (quote.buyerId && quote.buyerId !== ctx.user.id) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Shipping quote does not belong to this buyer.",
            });
          }

          if (
            typeof quote.quantitySqFt === "number" &&
            Math.abs(quote.quantitySqFt - input.quantitySqFt) > 0.01
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Shipping quote does not match the selected quantity.",
            });
          }

          if (
            quote.destinationZip &&
            normalizeZip(quote.destinationZip) !== normalizeZip(input.shippingZip)
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Shipping quote destination does not match the shipping ZIP.",
            });
          }

          // Consume token immediately to prevent replay.
          await redis.del(`shipping-quote-token:${input.selectedQuoteToken}`);

          verifiedQuoteId = quote.quoteId ? String(quote.quoteId) : undefined;
          verifiedShippingPrice = quote.shippingPrice;
          verifiedCarrierRate = quote.carrierRate;
          verifiedShippingMargin =
            Math.round((verifiedShippingPrice - verifiedCarrierRate) * 100) / 100;
          verifiedSelectedCarrier = quote.carrierName;
          verifiedEstimatedTransitDays = quote.transitDays;
          quoteExpiresAt = quote.quoteExpiresAt
            ? new Date(quote.quoteExpiresAt)
            : undefined;
        } else if (input.selectedQuoteId) {
          // Deprecated fallback path for short-lived older clients.
          const cachedQuote = await redis.get(`shipping-quote:${input.selectedQuoteId}`);
          if (!cachedQuote) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Shipping quote has expired. Please select a new shipping option.",
            });
          }

          const rawQuote =
            typeof cachedQuote === "string"
              ? JSON.parse(cachedQuote)
              : cachedQuote;
          const parsedQuote = cachedQuoteSchema.safeParse(rawQuote);
          if (!parsedQuote.success) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Shipping quote is invalid. Please request shipping options again.",
            });
          }
          const quote = parsedQuote.data;

          if (quote.listingId !== input.listingId) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Shipping quote does not match the selected listing.",
            });
          }
          if (quote.buyerId && quote.buyerId !== ctx.user.id) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Shipping quote does not belong to this buyer.",
            });
          }
          if (
            typeof quote.quantitySqFt === "number" &&
            Math.abs(quote.quantitySqFt - input.quantitySqFt) > 0.01
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Shipping quote does not match the selected quantity.",
            });
          }
          if (
            quote.destinationZip &&
            normalizeZip(quote.destinationZip) !== normalizeZip(input.shippingZip)
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                "Shipping quote destination does not match the shipping ZIP.",
            });
          }

          // Consume token to prevent replay attacks (matches primary path behavior)
          await redis.del(`shipping-quote:${input.selectedQuoteId}`);

          verifiedQuoteId = input.selectedQuoteId;
          verifiedShippingPrice = quote.shippingPrice;
          verifiedCarrierRate = quote.carrierRate;
          verifiedShippingMargin =
            Math.round((verifiedShippingPrice - verifiedCarrierRate) * 100) / 100;
          verifiedSelectedCarrier = quote.carrierName;
          verifiedEstimatedTransitDays = quote.transitDays;
          quoteExpiresAt = quote.quoteExpiresAt
            ? new Date(quote.quoteExpiresAt)
            : undefined;
        }

        // buyNowPrice is already stored as per-sq-ft
        const pricePerSqFt = listing.buyNowPrice ?? listing.askPricePerSqFt;
        const subtotal =
          Math.round(input.quantitySqFt * pricePerSqFt * 100) / 100;
        const shippingPrice = verifiedShippingPrice; // Use verified value
        const feeBreakdown = calculateOrderFees(subtotal, shippingPrice);

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
            sellerPayout: feeBreakdown.sellerPayout,
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
              shippingMargin: verifiedShippingMargin,
              estimatedTransitDays: verifiedEstimatedTransitDays,
              quoteExpiresAt,
            }),
            status: "pending",
            escrowStatus: "held",
          })
          .returning();

        // Update listing within the same transaction
        if (input.quantitySqFt >= listing.totalSqFt) {
          await tx
            .update(listings)
            .set({
              status: "sold",
              soldAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(listings.id, listing.id));
        } else {
          await tx
            .update(listings)
            .set({
              totalSqFt: listing.totalSqFt - input.quantitySqFt,
              updatedAt: new Date(),
            })
            .where(eq(listings.id, listing.id));
        }

        return newOrder;
      });

      // Auto-save shipping address if it doesn't exist (fire-and-forget)
      (async () => {
        try {
          const existing = await ctx.db.query.shippingAddresses.findFirst({
            where: and(
              eq(shippingAddresses.userId, ctx.user.id),
              eq(shippingAddresses.address, input.shippingAddress),
              eq(shippingAddresses.zip, input.shippingZip)
            ),
          });
          if (!existing) {
            await ctx.db.insert(shippingAddresses).values({
              userId: ctx.user.id,
              label: `${input.shippingCity}, ${input.shippingState}`,
              name: input.shippingName,
              address: input.shippingAddress,
              city: input.shippingCity,
              state: input.shippingState,
              zip: input.shippingZip,
              phone: input.shippingPhone ?? null,
              isDefault: false,
            });
          }
        } catch (err) {
          console.error("Failed to auto-save shipping address:", err);
        }
      })();

      // Send order confirmation email (fire-and-forget, outside transaction)
      sendOrderConfirmationEmail({
        to: ctx.user.email,
        buyerName: ctx.user.name,
        orderNumber: order.orderNumber,
        listingTitle: "Order",
        quantity: `${order.quantitySqFt}`,
        pricePerSqFt: `${order.pricePerSqFt}`,
        subtotal: `${order.subtotal}`,
        buyerFee: `${order.buyerFee}`,
        total: `${order.totalPrice}`,
        orderId: order.id,
      }).catch((err) => {
        console.error("Failed to send order confirmation email:", err);
      });

      return order;
    }),

  // Create an order from an accepted offer
  createFromOffer: verifiedBuyerProcedure
    .input(createOrderFromOfferSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify shipping quote from server-side cache (same pattern as Buy Now)
      let verifiedShippingPrice = 0;
      let verifiedCarrierRate = 0;
      let verifiedShippingMargin = 0;
      let verifiedSelectedCarrier = input.selectedCarrier;
      let verifiedEstimatedTransitDays = input.estimatedTransitDays;
      let verifiedQuoteId: string | undefined;
      let quoteExpiresAt: Date | undefined;

      if (input.selectedQuoteToken) {
        const cachedQuote = await redis.get(
          `shipping-quote-token:${input.selectedQuoteToken}`,
        );

        if (!cachedQuote) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Shipping quote has expired. Please select a new shipping option.",
          });
        }

        const rawQuote =
          typeof cachedQuote === "string"
            ? JSON.parse(cachedQuote)
            : cachedQuote;
        const parsedQuote = cachedQuoteSchema.safeParse(rawQuote);
        if (!parsedQuote.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Shipping quote is invalid. Please request shipping options again.",
          });
        }

        const quote = parsedQuote.data;

        if (quote.buyerId && quote.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Shipping quote does not belong to this buyer.",
          });
        }

        if (
          quote.destinationZip &&
          normalizeZip(quote.destinationZip) !== normalizeZip(input.shippingZip)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Shipping quote destination does not match the shipping ZIP.",
          });
        }

        // Consume token immediately to prevent replay
        await redis.del(`shipping-quote-token:${input.selectedQuoteToken}`);

        verifiedQuoteId = quote.quoteId ? String(quote.quoteId) : undefined;
        verifiedShippingPrice = quote.shippingPrice;
        verifiedCarrierRate = quote.carrierRate;
        verifiedShippingMargin =
          Math.round((verifiedShippingPrice - verifiedCarrierRate) * 100) / 100;
        verifiedSelectedCarrier = quote.carrierName;
        verifiedEstimatedTransitDays = quote.transitDays;
        quoteExpiresAt = quote.quoteExpiresAt
          ? new Date(quote.quoteExpiresAt)
          : undefined;
      } else if (input.selectedQuoteId) {
        // Deprecated fallback path
        const cachedQuote = await redis.get(`shipping-quote:${input.selectedQuoteId}`);
        if (!cachedQuote) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Shipping quote has expired. Please select a new shipping option.",
          });
        }

        const rawQuote =
          typeof cachedQuote === "string"
            ? JSON.parse(cachedQuote)
            : cachedQuote;
        const parsedQuote = cachedQuoteSchema.safeParse(rawQuote);
        if (!parsedQuote.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Shipping quote is invalid. Please request shipping options again.",
          });
        }
        const quote = parsedQuote.data;

        if (quote.buyerId && quote.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Shipping quote does not belong to this buyer.",
          });
        }
        if (
          quote.destinationZip &&
          normalizeZip(quote.destinationZip) !== normalizeZip(input.shippingZip)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Shipping quote destination does not match the shipping ZIP.",
          });
        }

        // Consume token to prevent replay
        await redis.del(`shipping-quote:${input.selectedQuoteId}`);

        verifiedQuoteId = input.selectedQuoteId;
        verifiedShippingPrice = quote.shippingPrice;
        verifiedCarrierRate = quote.carrierRate;
        verifiedShippingMargin =
          Math.round((verifiedShippingPrice - verifiedCarrierRate) * 100) / 100;
        verifiedSelectedCarrier = quote.carrierName;
        verifiedEstimatedTransitDays = quote.transitDays;
        quoteExpiresAt = quote.quoteExpiresAt
          ? new Date(quote.quoteExpiresAt)
          : undefined;
      }

      const order = await ctx.db.transaction(async (tx) => {
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

        // Validate sufficient quantity
        if (offer.quantitySqFt > listing.totalSqFt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Insufficient inventory. Only ${listing.totalSqFt} sq ft available.`,
          });
        }

        // Determine accepted price from offer
        const pricePerSqFt = offer.counterPricePerSqFt ?? offer.offerPricePerSqFt;
        const subtotal =
          Math.round(offer.quantitySqFt * pricePerSqFt * 100) / 100;
        const shippingPrice = verifiedShippingPrice;
        const feeBreakdown = calculateOrderFees(subtotal, shippingPrice);

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
            sellerPayout: feeBreakdown.sellerPayout,
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
              shippingMargin: verifiedShippingMargin,
              estimatedTransitDays: verifiedEstimatedTransitDays,
              quoteExpiresAt,
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

        // Update listing inventory (same as Buy Now flow)
        if (offer.quantitySqFt >= listing.totalSqFt) {
          await tx
            .update(listings)
            .set({
              status: "sold",
              soldAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(listings.id, listing.id));
        } else {
          await tx
            .update(listings)
            .set({
              totalSqFt: listing.totalSqFt - offer.quantitySqFt,
              updatedAt: new Date(),
            })
            .where(eq(listings.id, listing.id));
        }

        return newOrder;
      });

      // Auto-save shipping address if it doesn't exist (fire-and-forget)
      (async () => {
        try {
          const existing = await ctx.db.query.shippingAddresses.findFirst({
            where: and(
              eq(shippingAddresses.userId, ctx.user.id),
              eq(shippingAddresses.address, input.shippingAddress),
              eq(shippingAddresses.zip, input.shippingZip)
            ),
          });
          if (!existing) {
            await ctx.db.insert(shippingAddresses).values({
              userId: ctx.user.id,
              label: `${input.shippingCity}, ${input.shippingState}`,
              name: input.shippingName,
              address: input.shippingAddress,
              city: input.shippingCity,
              state: input.shippingState,
              zip: input.shippingZip,
              phone: input.shippingPhone ?? null,
              isDefault: false,
            });
          }
        } catch (err) {
          console.error("Failed to auto-save shipping address:", err);
        }
      })();

      // Send order confirmation email (fire-and-forget)
      sendOrderConfirmationEmail({
        to: ctx.user.email,
        buyerName: ctx.user.name,
        orderNumber: order!.orderNumber,
        listingTitle: "Order",
        quantity: `${order!.quantitySqFt}`,
        pricePerSqFt: `${order!.pricePerSqFt}`,
        subtotal: `${order!.subtotal}`,
        buyerFee: `${order!.buyerFee}`,
        total: `${order!.totalPrice}`,
        orderId: order!.id,
      }).catch((err) => {
        console.error("Failed to send order confirmation email:", err);
      });

      return order;
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
        with: {
          listing: {
            with: {
              media: {
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
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      const isAdmin = ctx.user.role === "admin";

      return {
        ...order,
        buyer: maskUserForOrder(order.buyer, order.status, isAdmin),
        seller: maskUserForOrder(order.seller, order.status, isAdmin),
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
          with: {
            listing: {
              columns: {
                id: true,
                title: true,
                materialType: true,
              },
              with: {
                media: {
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
        items,
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
          with: {
            listing: {
              columns: {
                id: true,
                title: true,
                materialType: true,
              },
              with: {
                media: {
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
        items,
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
      const order = await ctx.db.query.orders.findFirst({
        where: and(
          eq(orders.id, input.orderId),
          eq(orders.sellerId, ctx.user.id)
        ),
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      // Validate status transition
      const allowedTransitions = VALID_STATUS_TRANSITIONS[order.status];
      if (!allowedTransitions || !allowedTransitions.includes(input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot transition order from "${order.status}" to "${input.status}"`,
        });
      }

      const updateData: Record<string, unknown> = {
        status: input.status,
        updatedAt: new Date(),
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

      // Set timestamp and escrow status based on status transition
      switch (input.status) {
        case "confirmed":
          updateData.confirmedAt = new Date();
          break;
        case "shipped":
          updateData.shippedAt = new Date();
          break;
        case "delivered":
          updateData.deliveredAt = new Date();
          break;
        case "cancelled":
          updateData.cancelledAt = new Date();
          // Release escrow back to buyer on cancellation
          if (order.escrowStatus === "held") {
            updateData.escrowStatus = "refunded";
          }
          break;
      }

      const [updated] = await ctx.db.transaction(async (tx) => {
        const [nextOrder] = await tx
          .update(orders)
          .set(updateData)
          .where(eq(orders.id, input.orderId))
          .returning();

        if (input.status === "cancelled") {
          await releaseReservedInventory({
            db: tx,
            orderId: input.orderId,
            reason: "seller_cancelled_before_delivery",
          });
        }

        return [nextOrder];
      });

      // Fire Inngest event for escrow release on shipment pickup
      if (input.status === "shipped") {
        inngest.send({
          name: "order/picked-up",
          data: {
            orderId: order.id,
            pickedUpAt: new Date().toISOString(),
          },
        }).catch((err) => {
          console.error("Failed to send escrow release event:", err);
        });
      }

      return updated;
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
