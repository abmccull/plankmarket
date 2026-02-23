import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
} from "../trpc";
import { savedSearches, listings } from "../db/schema";
import { and, eq, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { listingFilterSchema } from "@/lib/validators/listing";
import type { SearchFilters } from "@/types";

export const searchRouter = createTRPCRouter({
  // Save a search
  saveSearch: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        filters: listingFilterSchema,
        alertEnabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [search] = await ctx.db
        .insert(savedSearches)
        .values({
          userId: ctx.user.id,
          name: input.name,
          filters: input.filters as SearchFilters,
          alertEnabled: input.alertEnabled,
        })
        .returning();

      return search;
    }),

  // Get saved searches
  getMySavedSearches: protectedProcedure.query(async ({ ctx }) => {
    const searches = await ctx.db.query.savedSearches.findMany({
      where: eq(savedSearches.userId, ctx.user.id),
      orderBy: desc(savedSearches.createdAt),
    });

    return searches;
  }),

  // Update saved search
  updateSavedSearch: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(255).optional(),
        filters: listingFilterSchema.optional(),
        alertEnabled: z.boolean().optional(),
        alertFrequency: z.enum(["instant", "daily", "weekly"]).optional(),
        alertChannels: z.array(z.enum(["in_app", "email"])).min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.savedSearches.findFirst({
        where: eq(savedSearches.id, input.id),
      });

      if (!existing || existing.userId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Saved search not found",
        });
      }

      const updateData: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) updateData.name = input.name;
      if (input.filters !== undefined)
        updateData.filters = input.filters as SearchFilters;
      if (input.alertEnabled !== undefined)
        updateData.alertEnabled = input.alertEnabled;
      if (input.alertFrequency !== undefined)
        updateData.alertFrequency = input.alertFrequency;
      if (input.alertChannels !== undefined)
        updateData.alertChannels = input.alertChannels;

      const [updated] = await ctx.db
        .update(savedSearches)
        .set(updateData)
        .where(eq(savedSearches.id, input.id))
        .returning();

      return updated;
    }),

  // Delete saved search — with ownership check
  deleteSavedSearch: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(savedSearches)
        .where(
          and(
            eq(savedSearches.id, input.id),
            eq(savedSearches.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  // Get search facet counts (for filter sidebar)
  getFacets: publicProcedure.query(async ({ ctx }) => {
    const { db } = ctx;

    const [materialCounts, conditionCounts, stateCounts] = await Promise.all([
      db
        .select({
          value: listings.materialType,
          count: sql<number>`count(*)::int`,
        })
        .from(listings)
        .where(eq(listings.status, "active"))
        .groupBy(listings.materialType),

      db
        .select({
          value: listings.condition,
          count: sql<number>`count(*)::int`,
        })
        .from(listings)
        .where(eq(listings.status, "active"))
        .groupBy(listings.condition),

      db
        .select({
          value: listings.locationState,
          count: sql<number>`count(*)::int`,
        })
        .from(listings)
        .where(eq(listings.status, "active"))
        .groupBy(listings.locationState),
    ]);

    return {
      materialType: materialCounts,
      condition: conditionCounts,
      state: stateCounts,
    };
  }),
});
