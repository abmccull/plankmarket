import {
  createTRPCRouter,
  sellerProcedure,
} from "../trpc";
import { media, listings } from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
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

  // Reorder media — batched into a single query using CASE expression
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

      // Build a single UPDATE with CASE expression instead of N separate queries
      const ids = input.mediaOrder.map((m) => m.id);
      const caseFragments = input.mediaOrder
        .map((m) => `WHEN '${m.id}' THEN ${m.sortOrder}`)
        .join(" ");

      await ctx.db.execute(
        sql`UPDATE media SET sort_order = CASE id::text ${sql.raw(caseFragments)} END WHERE listing_id = ${input.listingId} AND id = ANY(${ids})`
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

  // Get media for a listing
  getListingMedia: sellerProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const items = await ctx.db.query.media.findMany({
        where: eq(media.listingId, input.listingId),
        orderBy: (media, { asc }) => [asc(media.sortOrder)],
      });

      return items;
    }),
});
