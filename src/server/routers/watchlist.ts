import {
  createTRPCRouter,
  buyerProcedure,
} from "../trpc";
import { watchlist, listings, offers, orders } from "../db/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { z } from "zod";

type BuyerStatus =
  | "delivered"
  | "shipped"
  | "order_pending"
  | "offer_accepted"
  | "offer_pending"
  | "sold"
  | "available";

export const watchlistRouter = createTRPCRouter({
  // Add to watchlist
  add: buyerProcedure
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
  remove: buyerProcedure
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
  isWatchlisted: buyerProcedure
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
  getMyWatchlist: buyerProcedure
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
                    name: true,
                    verified: true,
                    role: true,
                    businessCity: true,
                    businessState: true,
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

      const listingIds = items.map((i) => i.listingId);

      // Fetch buyer's offers and orders for these listings in parallel
      const [buyerOffers, buyerOrders] = listingIds.length > 0
        ? await Promise.all([
            ctx.db
              .select({
                listingId: offers.listingId,
                status: offers.status,
              })
              .from(offers)
              .where(
                and(
                  eq(offers.buyerId, ctx.user.id),
                  inArray(offers.listingId, listingIds)
                )
              ),
            ctx.db
              .select({
                listingId: orders.listingId,
                status: orders.status,
              })
              .from(orders)
              .where(
                and(
                  eq(orders.buyerId, ctx.user.id),
                  inArray(orders.listingId, listingIds)
                )
              ),
          ])
        : [[], []];

      // Group by listing ID
      const offersByListing = new Map<string, typeof buyerOffers>();
      for (const o of buyerOffers) {
        const arr = offersByListing.get(o.listingId) ?? [];
        arr.push(o);
        offersByListing.set(o.listingId, arr);
      }

      const ordersByListing = new Map<string, typeof buyerOrders>();
      for (const o of buyerOrders) {
        const arr = ordersByListing.get(o.listingId) ?? [];
        arr.push(o);
        ordersByListing.set(o.listingId, arr);
      }

      const itemsWithStatus = items.map((item) => {
        const listingOffers = offersByListing.get(item.listingId) ?? [];
        const listingOrders = ordersByListing.get(item.listingId) ?? [];

        let buyerStatus: BuyerStatus = "available";

        // Priority: delivered > shipped > order_pending > offer_accepted > offer_pending > sold > available
        if (listingOrders.some((o) => o.status === "delivered")) {
          buyerStatus = "delivered";
        } else if (listingOrders.some((o) => o.status === "shipped")) {
          buyerStatus = "shipped";
        } else if (
          listingOrders.some((o) =>
            ["pending", "confirmed", "processing"].includes(o.status)
          )
        ) {
          buyerStatus = "order_pending";
        } else if (listingOffers.some((o) => o.status === "accepted")) {
          buyerStatus = "offer_accepted";
        } else if (
          listingOffers.some((o) =>
            ["pending", "countered"].includes(o.status)
          )
        ) {
          buyerStatus = "offer_pending";
        } else if (item.listing.status === "sold") {
          buyerStatus = "sold";
        }

        return { ...item, buyerStatus };
      });

      return {
        items: itemsWithStatus,
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        hasMore: offset + items.length < total,
      };
    }),
});
