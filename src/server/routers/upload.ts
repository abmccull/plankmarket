import {
  createTRPCRouter,
  sellerProcedure,
  buyerProcedure,
} from "../trpc";
import { media, listings, buyerRequests } from "../db/schema";
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
      // HIGH-2: Verify listing ownership before associating media
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
            code: "FORBIDDEN",
            message: "You can only upload media to your own listings",
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

  // Reorder media — using individual parameterized updates
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

      // HIGH-3: Verify listing ownership before reordering media
      const listing = await ctx.db.query.listings.findFirst({
        where: and(
          eq(listings.id, input.listingId),
          eq(listings.sellerId, ctx.user.id)
        ),
        columns: { id: true },
      });
      if (!listing) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only reorder media for your own listings",
        });
      }

      // CRITICAL-1: Use parameterized updates instead of sql.raw() to prevent SQL injection
      for (const item of input.mediaOrder) {
        await ctx.db
          .update(media)
          .set({ sortOrder: item.sortOrder })
          .where(
            and(
              eq(media.id, item.id),
              eq(media.listingId, input.listingId)
            )
          );
      }

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
      // HIGH-3: Verify listing ownership before returning media
      const listing = await ctx.db.query.listings.findFirst({
        where: and(
          eq(listings.id, input.listingId),
          eq(listings.sellerId, ctx.user.id)
        ),
        columns: { id: true },
      });
      if (!listing) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only view media for your own listings",
        });
      }

      const items = await ctx.db.query.media.findMany({
        where: eq(media.listingId, input.listingId),
        orderBy: (media, { asc }) => [asc(media.sortOrder)],
      });

      return items;
    }),

  // Record uploaded media for buyer requests
  recordBuyerUpload: buyerProcedure
    .input(
      z.object({
        buyerRequestId: z.string().uuid().optional(),
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
      if (input.buyerRequestId) {
        const request = await ctx.db.query.buyerRequests.findFirst({
          where: and(
            eq(buyerRequests.id, input.buyerRequestId),
            eq(buyerRequests.buyerId, ctx.user.id)
          ),
          columns: { id: true },
        });
        if (!request) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only upload media to your own requests",
          });
        }
      }

      const records = await ctx.db
        .insert(media)
        .values(
          input.files.map((file, index) => ({
            buyerRequestId: input.buyerRequestId ?? null,
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

  // Delete buyer request media — with ownership check
  deleteBuyerMedia: buyerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const mediaRecord = await ctx.db.query.media.findFirst({
        where: eq(media.id, input.id),
        with: {
          buyerRequest: {
            columns: { buyerId: true },
          },
        },
      });

      if (!mediaRecord || mediaRecord.buyerRequest?.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Media not found",
        });
      }

      await ctx.db.delete(media).where(eq(media.id, input.id));
      return { success: true };
    }),
});
