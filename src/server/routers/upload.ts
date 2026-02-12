import {
  createTRPCRouter,
  sellerProcedure,
} from "../trpc";
import { media } from "../db/schema";
import { eq, and, inArray } from "drizzle-orm";
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
            listingId: input.listingId || "00000000-0000-0000-0000-000000000000", // temp placeholder
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

  // Reorder media
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
      await Promise.all(
        input.mediaOrder.map(({ id, sortOrder }) =>
          ctx.db
            .update(media)
            .set({ sortOrder })
            .where(
              and(eq(media.id, id), eq(media.listingId, input.listingId))
            )
        )
      );

      return { success: true };
    }),

  // Delete media
  deleteMedia: sellerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
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
