import {
  createTRPCRouter,
  protectedProcedure,
  adminProcedure,
} from "../trpc";
import { disputes, disputeMessages, orders } from "../db/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const disputeRouter = createTRPCRouter({
  // Create a dispute on an order
  create: protectedProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
        reason: z.string().min(1).max(255),
        description: z.string().min(10).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the order
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      // Verify user is buyer or seller of this order
      if (order.buyerId !== ctx.user.id && order.sellerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only create disputes for your own orders",
        });
      }

      // Check if dispute already exists
      const existingDispute = await ctx.db.query.disputes.findFirst({
        where: eq(disputes.orderId, input.orderId),
      });

      if (existingDispute) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A dispute already exists for this order",
        });
      }

      // Create the dispute
      const [dispute] = await ctx.db
        .insert(disputes)
        .values({
          orderId: input.orderId,
          initiatorId: ctx.user.id,
          reason: input.reason,
          description: input.description,
        })
        .returning();

      return dispute;
    }),

  // Add a message to a dispute
  addMessage: protectedProcedure
    .input(
      z.object({
        disputeId: z.string().uuid(),
        message: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the dispute with order details
      const dispute = await ctx.db.query.disputes.findFirst({
        where: eq(disputes.id, input.disputeId),
        with: {
          order: true,
        },
      });

      if (!dispute) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dispute not found",
        });
      }

      // Verify user is a participant (buyer, seller, or admin)
      const isParticipant =
        dispute.order.buyerId === ctx.user.id ||
        dispute.order.sellerId === ctx.user.id ||
        ctx.user.role === "admin";

      if (!isParticipant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to comment on this dispute",
        });
      }

      // Create the message
      const [message] = await ctx.db
        .insert(disputeMessages)
        .values({
          disputeId: input.disputeId,
          senderId: ctx.user.id,
          message: input.message,
        })
        .returning();

      // Update dispute updatedAt
      await ctx.db
        .update(disputes)
        .set({ updatedAt: new Date() })
        .where(eq(disputes.id, input.disputeId));

      return message;
    }),

  // Get all disputes for current user
  getMyDisputes: protectedProcedure
    .input(
      z.object({
        status: z
          .enum([
            "open",
            "under_review",
            "resolved_buyer",
            "resolved_seller",
            "closed",
          ])
          .optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      // Get orders where user is buyer or seller
      const userOrders = await ctx.db.query.orders.findMany({
        where: or(
          eq(orders.buyerId, ctx.user.id),
          eq(orders.sellerId, ctx.user.id)
        ),
        columns: { id: true },
      });

      const orderIds = userOrders.map((o) => o.id);

      if (orderIds.length === 0) {
        return {
          disputes: [],
          total: 0,
          page: input.page,
          limit: input.limit,
          totalPages: 0,
        };
      }

      // Build where clause
      const whereConditions = [sql`${disputes.orderId} IN ${orderIds}`];
      if (input.status) {
        whereConditions.push(eq(disputes.status, input.status));
      }

      const whereClause =
        whereConditions.length > 1
          ? and(...whereConditions)
          : whereConditions[0];

      const disputesList = await ctx.db.query.disputes.findMany({
        where: whereClause,
        orderBy: [desc(disputes.createdAt)],
        limit: input.limit,
        offset,
        with: {
          order: {
            columns: {
              id: true,
              orderNumber: true,
              status: true,
            },
            with: {
              buyer: {
                columns: {
                  id: true,
                  name: true,
                  businessName: true,
                },
              },
              seller: {
                columns: {
                  id: true,
                  name: true,
                  businessName: true,
                },
              },
            },
          },
          initiator: {
            columns: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(disputes)
        .where(whereClause);

      return {
        disputes: disputesList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Get a single dispute with messages
  getDispute: protectedProcedure
    .input(z.object({ disputeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Get the dispute
      const dispute = await ctx.db.query.disputes.findFirst({
        where: eq(disputes.id, input.disputeId),
        with: {
          order: {
            with: {
              buyer: {
                columns: {
                  id: true,
                  name: true,
                  businessName: true,
                  avatarUrl: true,
                },
              },
              seller: {
                columns: {
                  id: true,
                  name: true,
                  businessName: true,
                  avatarUrl: true,
                },
              },
            },
          },
          initiator: {
            columns: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          resolver: {
            columns: {
              id: true,
              name: true,
            },
          },
          messages: {
            orderBy: [desc(disputeMessages.createdAt)],
            with: {
              sender: {
                columns: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                  role: true,
                },
              },
            },
          },
        },
      });

      if (!dispute) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dispute not found",
        });
      }

      // Verify user is a participant or admin
      const isParticipant =
        dispute.order.buyerId === ctx.user.id ||
        dispute.order.sellerId === ctx.user.id ||
        ctx.user.role === "admin";

      if (!isParticipant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to view this dispute",
        });
      }

      return dispute;
    }),

  // Resolve a dispute (admin only)
  resolve: adminProcedure
    .input(
      z.object({
        disputeId: z.string().uuid(),
        resolution: z.string().min(10).max(2000),
        outcome: z.enum(["resolved_buyer", "resolved_seller", "closed"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the dispute
      const dispute = await ctx.db.query.disputes.findFirst({
        where: eq(disputes.id, input.disputeId),
      });

      if (!dispute) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dispute not found",
        });
      }

      // Verify dispute is not already resolved
      if (
        dispute.status === "resolved_buyer" ||
        dispute.status === "resolved_seller" ||
        dispute.status === "closed"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This dispute has already been resolved",
        });
      }

      // Update the dispute
      const [updatedDispute] = await ctx.db
        .update(disputes)
        .set({
          status: input.outcome,
          resolution: input.resolution,
          resolvedBy: ctx.user.id,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(disputes.id, input.disputeId))
        .returning();

      return updatedDispute;
    }),
});
