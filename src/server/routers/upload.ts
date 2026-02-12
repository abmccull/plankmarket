import {
  createTRPCRouter,
  sellerProcedure,
} from "../trpc";
import { media, listings } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const uploadRouter = createTRPCRouter({
  // Record uploaded media (after client-side upload to Uploadthing)
  recordUpload: sellerProcedure
    .input(
      z.object({
        listingId: z.string().uuid().optional(),
        files: z.array(
          z.object({
            url: z.string().url(),
            key: z.string(),
            fileName: z.string(),
            fileSize: z.number(),
            mimeType: z.string().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership if listingId is provided
      if (input.listingId) {
        const listing = await ctx.db.query.listings.findFirst({
          where: and(
            eq(listings.id, input.listingId),
            eq(listings.sellerId, ctx.user.id)
          ),
          columns: { id: true },
        });

        if (!listing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found or you do not have permission",
          });
        }
      }

      const records = await ctx.db
        .insert(media)
        .values(
          input.files.map((file, index) => ({
            listingId: input.listingId ?? null,
            url: file.url,
            key: file.key,
            fileName: file.fileName,
            fileSize: file.fileSize,
            mimeType: file.mimeType,
            sortOrder: index,
          }))
        )
        .returning();

      return records;
    }),

  // Reorder media — using parameterized queries (no sql.raw)
  reorderMedia: sellerProcedure
    .input(
      z.object({
        listingId: z.string().uuid(),
        mediaOrder: z.array(
          z.object({
            id: z.string().uuid(),
            sortOrder: z.number().int(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.mediaOrder.length === 0) return { success: true };

      // Verify ownership of the listing
      const listing = await ctx.db.query.listings.findFirst({
        where: and(
          eq(listings.id, input.listingId),
          eq(listings.sellerId, ctx.user.id)
        ),
        columns: { id: true },
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found or you do not have permission",
        });
      }

      // Use parameterized queries instead of sql.raw() to prevent SQL injection
      await Promise.all(
        input.mediaOrder.map(({ id, sortOrder }) =>
          ctx.db
            .update(media)
            .set({ sortOrder })
            .where(
              and(
                eq(media.id, id),
                eq(media.listingId, input.listingId)
              )
            )
        )
      );

      return { success: true };
    }),

  // Delete media — with ownership check
  deleteMedia: sellerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Verify the media belongs to a listing owned by this seller
      const mediaRecord = await ctx.db.query.media.findFirst({
        where: eq(media.id, input.id),
        with: {
          listing: {
            columns: { sellerId: true },
          },
        },
      });

      if (!mediaRecord || mediaRecord.listing?.sellerId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media not found",
        });
      }

      await ctx.db.delete(media).where(eq(media.id, input.id));
      return { success: true };
    }),

  // Get media for a listing (verify ownership)
  getListingMedia: sellerProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const listing = await ctx.db.query.listings.findFirst({
        where: and(
          eq(listings.id, input.listingId),
          eq(listings.sellerId, ctx.user.id)
        ),
        columns: { id: true },
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found or you do not have permission",
        });
      }

      const items = await ctx.db.query.media.findMany({
        where: eq(media.listingId, input.listingId),
        orderBy: (media, { asc }) => [asc(media.sortOrder)],
      });

      return items;
    }),
});
