import {
  createTRPCRouter,
  protectedProcedure,
  buyerProcedure,
  sellerProcedure,
} from "../trpc";
import {
  createOrderSchema,
  updateOrderStatusSchema,
} from "@/lib/validators/order";
import { orders, listings } from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { calculateBuyerFee, calculateSellerFee } from "@/lib/utils";
import { nanoid } from "nanoid";
import { sendOrderConfirmationEmail } from "@/lib/email/send";
import { inngest } from "@/lib/inngest/client";

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

export const orderRouter = createTRPCRouter({
  // Create a new order (Buy Now) — wrapped in a transaction with row locking
  create: buyerProcedure
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

        // Validate quantity
        if (listing.moq && input.quantitySqFt < listing.moq) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Minimum order quantity is ${listing.moq} sq ft`,
          });
        }

        if (input.quantitySqFt > listing.totalSqFt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Maximum available quantity is ${listing.totalSqFt} sq ft`,
          });
        }

        // Prevent self-purchase
        if (listing.sellerId === ctx.user.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You cannot purchase your own listing",
          });
        }

        // Calculate pricing using originalTotalSqFt for stable buyNowPrice calculation
        const originalSqFt = listing.originalTotalSqFt ?? listing.totalSqFt;
        const pricePerSqFt = listing.buyNowPrice
          ? listing.buyNowPrice / originalSqFt
          : listing.askPricePerSqFt;
        const subtotal =
          Math.round(input.quantitySqFt * pricePerSqFt * 100) / 100;
        const buyerFee = calculateBuyerFee(subtotal);
        const sellerFee = calculateSellerFee(subtotal);
        const totalPrice = Math.round((subtotal + buyerFee) * 100) / 100;
        const sellerPayout = Math.round((subtotal - sellerFee) * 100) / 100;

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
            buyerFee,
            sellerFee,
            totalPrice,
            sellerPayout,
            shippingName: input.shippingName,
            shippingAddress: input.shippingAddress,
            shippingCity: input.shippingCity,
            shippingState: input.shippingState,
            shippingZip: input.shippingZip,
            shippingPhone: input.shippingPhone,
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
        sellerName: "",
        orderId: order.id,
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
            },
          },
          seller: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              email: true,
              phone: true,
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

      return order;
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
                businessName: true,
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
                businessName: true,
                email: true,
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

      const [updated] = await ctx.db
        .update(orders)
        .set(updateData)
        .where(eq(orders.id, input.orderId))
        .returning();

      // Fire Inngest event for escrow auto-release on delivery
      if (input.status === "delivered") {
        inngest.send({
          name: "order/delivered",
          data: {
            orderId: order.id,
            deliveredAt: new Date().toISOString(),
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
