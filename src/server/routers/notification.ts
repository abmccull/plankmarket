import { createTRPCRouter, protectedProcedure, assuredProtectedProcedure } from "../trpc";
import { notifications, orders, sampleRequests, offers, conversations } from "../db/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const notificationRouter = createTRPCRouter({
  getDestination: assuredProtectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const unavailable = () => new TRPCError({ code: "NOT_FOUND", message: "Notification destination unavailable" });
      const notification = await ctx.db.query.notifications.findFirst({
        where: and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)),
        columns: { id: true, userId: true, data: true },
      });
      if (!notification || notification.userId !== ctx.user.id) throw unavailable();
      const data = notification.data;
      if (!data || Array.isArray(data)) throw unavailable();

      const kind = data.type === "sample_request_created" || data.type === "sample_request_updated"
        ? "sample" : data.orderId !== undefined ? "order" : data.offerId !== undefined ? "offer"
          : data.conversationId !== undefined ? "conversation" : null;
      const rawId = kind === "sample" ? data.sampleRequestId : kind === "order" ? data.orderId
        : kind === "offer" ? data.offerId : data.conversationId;
      const parsedId = z.string().uuid().safeParse(rawId);
      if (!kind || !parsedId.success) throw unavailable();
      const id = parsedId.data;
      const columns = { id: true, buyerId: true, sellerId: true } as const;
      const owner = ctx.user.id;
      // Restrict the actual query as well as checking participation after the read.
      const transaction = kind === "sample"
        ? await ctx.db.query.sampleRequests.findFirst({ columns, where: and(eq(sampleRequests.id, id), or(eq(sampleRequests.buyerId, owner), eq(sampleRequests.sellerId, owner))) })
        : kind === "order"
          ? await ctx.db.query.orders.findFirst({ columns, where: and(eq(orders.id, id), ctx.user.role === "admin" ? undefined : or(eq(orders.buyerId, owner), eq(orders.sellerId, owner))) })
          : kind === "offer"
            ? await ctx.db.query.offers.findFirst({ columns, where: and(eq(offers.id, id), or(eq(offers.buyerId, owner), eq(offers.sellerId, owner))) })
            : await ctx.db.query.conversations.findFirst({ columns, where: and(eq(conversations.id, id), or(eq(conversations.buyerId, owner), eq(conversations.sellerId, owner))) });
      if (!transaction) throw unavailable();
      if (kind === "order" && ctx.user.role === "admin") return { ownerId: owner, href: "/admin/orders" };
      const side = transaction.buyerId === owner ? "buyer" : transaction.sellerId === owner ? "seller" : null;
      if (!side) throw unavailable();
      const href = kind === "order" ? `/${side}/orders/${transaction.id}`
        : kind === "sample" ? `/${side}/samples`
          : kind === "offer" ? `/offers/${transaction.id}?workspace=${side}`
            : `/messages/${transaction.id}?workspace=${side}`;
      return { ownerId: owner, href };
    }),

  // Get paginated notifications for the current user
  getMyNotifications: protectedProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        ctx.db.query.notifications.findMany({
          where: eq(notifications.userId, ctx.user.id),
          orderBy: desc(notifications.createdAt),
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(notifications)
          .where(eq(notifications.userId, ctx.user.id)),
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

  // Get unread notification count
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    try {
      const [result] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, ctx.user.id),
            eq(notifications.read, false),
          ),
        );

      return { count: result?.count ?? 0 };
    } catch (error) {
      console.error("notification.getUnreadCount failed", {
        userId: ctx.user.id,
        error,
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "We couldn't load your unread notification count. Try again.",
      });
    }
  }),

  // Get latest notifications (for dropdown preview)
  getLatest: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().positive().max(10).default(5),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        const items = await ctx.db.query.notifications.findMany({
          where: eq(notifications.userId, ctx.user.id),
          orderBy: desc(notifications.createdAt),
          limit: input.limit,
        });

        return items;
      } catch (error) {
        console.error("notification.getLatest failed", {
          userId: ctx.user.id,
          error,
        });
        return [];
      }
    }),

  // Mark a single notification as read
  markAsRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership before marking as read
      const notification = await ctx.db.query.notifications.findFirst({
        where: and(
          eq(notifications.id, input.id),
          eq(notifications.userId, ctx.user.id),
        ),
      });

      if (!notification) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Notification not found",
        });
      }

      await ctx.db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.id, input.id));

      return { success: true };
    }),

  // Mark all notifications as read
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          eq(notifications.read, false),
        ),
      );

    return { success: true };
  }),

  // Delete all read notifications
  clearRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db
      .delete(notifications)
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          eq(notifications.read, true),
        ),
      );

    return { success: true };
  }),

  // Delete a notification
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(notifications)
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.userId, ctx.user.id),
          ),
        );

      return { success: true };
    }),
});
