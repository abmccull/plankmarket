import {
  createTRPCRouter,
  protectedProcedure,
} from "../trpc";
import { watchlist, listings } from "../db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { z } from "zod";

export const watchlistRouter = createTRPCRouter({
  // Add to watchlist
  add: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check if already watchlisted
      const existing = await ctx.db.query.watchlist.findFirst({
        where: and(
          eq(watchlist.userId, ctx.user.id),
          eq(watchlist.listingId, input.listingId)
        ),
      });

      if (existing) {
        return existing;
      }

      const [item] = await ctx.db
        .insert(watchlist)
        .values({
          userId: ctx.user.id,
          listingId: input.listingId,
        })
        .returning();

      // Increment watchlist count on listing
      await ctx.db
        .update(listings)
        .set({ watchlistCount: sql`${listings.watchlistCount} + 1` })
        .where(eq(listings.id, input.listingId));

      return item;
    }),

  // Remove from watchlist
  remove: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(watchlist)
        .where(
          and(
            eq(watchlist.userId, ctx.user.id),
            eq(watchlist.listingId, input.listingId)
          )
        );

      // Decrement watchlist count on listing
      await ctx.db
        .update(listings)
        .set({
          watchlistCount: sql`greatest(${listings.watchlistCount} - 1, 0)`,
        })
        .where(eq(listings.id, input.listingId));

      return { success: true };
    }),

  // Check if listing is watchlisted
  isWatchlisted: protectedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.db.query.watchlist.findFirst({
        where: and(
          eq(watchlist.userId, ctx.user.id),
          eq(watchlist.listingId, input.listingId)
        ),
      });

      return { isWatchlisted: !!item };
    }),

  // Get user's watchlist
  getMyWatchlist: protectedProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        ctx.db.query.watchlist.findMany({
          where: eq(watchlist.userId, ctx.user.id),
          with: {
            listing: {
              with: {
                media: {
                  orderBy: (media, { asc }) => [asc(media.sortOrder)],
                  limit: 1,
                },
                seller: {
                  columns: {
                    id: true,
                    businessName: true,
                    verified: true,
                  },
                },
              },
            },
          },
          orderBy: desc(watchlist.createdAt),
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(watchlist)
          .where(eq(watchlist.userId, ctx.user.id)),
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
});
