import {
  createTRPCRouter,
  protectedProcedure,
} from "../trpc";
import { notifications } from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const notificationRouter = createTRPCRouter({
  // Get paginated notifications for the current user
  getMyNotifications: protectedProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
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
    const [result] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, ctx.user.id),
          eq(notifications.read, false)
        )
      );

    return { count: result?.count ?? 0 };
  }),

  // Get latest notifications (for dropdown preview)
  getLatest: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().positive().max(10).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.query.notifications.findMany({
        where: eq(notifications.userId, ctx.user.id),
        orderBy: desc(notifications.createdAt),
        limit: input.limit,
      });

      return items;
    }),

  // Mark a single notification as read
  markAsRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership before marking as read
      const notification = await ctx.db.query.notifications.findFirst({
        where: and(
          eq(notifications.id, input.id),
          eq(notifications.userId, ctx.user.id)
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
          eq(notifications.read, false)
        )
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
          eq(notifications.read, true)
        )
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
            eq(notifications.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),
});
