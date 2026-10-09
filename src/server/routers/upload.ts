import {
  createTRPCRouter,
  sellerProcedure,
  verifiedBuyerProcedure,
} from "../trpc";
import { media, listings, disputeEvidence } from "../db/schema";
import { eq, and, desc, inArray, isNull, notExists, sql } from "drizzle-orm";
import { isProductImageMimeType, publicProductPhotoWhere } from "@/server/services/listing-media";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  deleteOwnedMediaWithProvider,
  MediaDeletionError,
} from "@/server/services/uploadthing-files";

function toMediaDeletionTrpcError(error: unknown): TRPCError {
  if (error instanceof MediaDeletionError) {
    if (error.failure === "not_found") {
      return new TRPCError({ code: "NOT_FOUND", message: error.message });
    }
    if (
      error.failure === "evidence_retained" ||
      error.failure === "listing_attached"
    ) {
      return new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    if (
      error.failure === "already_processing" ||
      error.failure === "claim_lost" ||
      error.failure === "provider_failed"
    ) {
      return new TRPCError({ code: "CONFLICT", message: error.message });
    }
  }

  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "The image could not be deleted. Please try again.",
    cause: error,
  });
}

export const uploadRouter = createTRPCRouter({
  getUnattachedPhotos: sellerProcedure
    .input(z.object({
      expectedOwnerId: z.string().uuid(),
      cursor: z.object({ createdAt: z.string().datetime(), id: z.string().uuid() }).optional(),
    }))
    .query(async ({ ctx, input }) => {
      if (input.expectedOwnerId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Your account changed. Reload before recovering photos." });
      }
      const records = await ctx.db.select({
        id: media.id, url: media.url, fileName: media.fileName,
        fileSize: media.fileSize, createdAt: media.createdAt,
        // Keep the exact database boundary; JS Date truncates microseconds.
        cursorCreatedAt: sql<string>`to_char(${media.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      }).from(media).where(and(
        eq(media.uploaderId, ctx.user.id),
        eq(media.storageProvider, "uploadthing"),
        isNull(media.listingId),
        isNull(media.buyerRequestId),
        publicProductPhotoWhere(media),
        input.cursor ? sql`(${media.createdAt}, ${media.id}) < (${input.cursor.createdAt}::timestamptz, ${input.cursor.id}::uuid)` : undefined,
      )).orderBy(desc(media.createdAt), desc(media.id)).limit(21);
      const items = records.slice(0, 20);
      const last = items.at(-1);
      return {
        ownerId: ctx.user.id,
        items: items.map(photo => ({ id: photo.id, url: photo.url, fileName: photo.fileName, fileSize: photo.fileSize, createdAt: photo.createdAt })),
        nextCursor: records.length > 20 && last ? { createdAt: last.cursorCreatedAt, id: last.id } : null,
      };
    }),
  getOwnedMedia: sellerProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).max(20) }))
    .query(async ({ ctx, input }) => {
      if (!input.ids.length) return [];
      const records = await ctx.db.query.media.findMany({
        where: and(
          inArray(media.id, input.ids),
          eq(media.uploaderId, ctx.user.id),
          isNull(media.buyerRequestId),
          isNull(media.deletionClaimToken),
          notExists(
            ctx.db
              .select({ id: sql`1` })
              .from(disputeEvidence)
              .where(eq(disputeEvidence.mediaId, media.id)),
          ),
        ),
      });
      const byId = new Map(
        records
          .filter((record) => isProductImageMimeType(record.mimeType))
          .map((record) => [record.id, record]),
      );
      return input.ids.flatMap((id) => {
        const record = byId.get(id);
        return record ? [record] : [];
      });
    }),
  // Upload records are created only by UploadThing's signed server callback.
  // This endpoint only changes ordering on records owned by this seller.
  reorderMedia: sellerProcedure
    .input(
      z.object({
        listingId: z.string().uuid(),
        mediaOrder: z
          .array(
            z.object({
              id: z.string().uuid(),
              sortOrder: z.number().int().min(0).max(19),
            }),
          )
          .max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.mediaOrder.length === 0) return { success: true };

      const listing = await ctx.db.query.listings.findFirst({
        where: and(
          eq(listings.id, input.listingId),
          eq(listings.sellerId, ctx.user.id),
        ),
        columns: { id: true },
      });
      if (!listing) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only reorder media for your own listings",
        });
      }

      for (const item of input.mediaOrder) {
        await ctx.db
          .update(media)
          .set({ sortOrder: item.sortOrder })
          .where(
            and(
              eq(media.id, item.id),
              eq(media.listingId, input.listingId),
              eq(media.uploaderId, ctx.user.id),
            ),
          );
      }

      return { success: true };
    }),

  deleteMedia: sellerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteOwnedMediaWithProvider({
          mediaId: input.id,
          uploaderId: ctx.user.id,
          database: ctx.db,
        });
      } catch (error) {
        console.error("Failed to delete seller upload", {
          mediaId: input.id,
          userId: ctx.user.id,
          error: error instanceof Error ? error.name : "UnknownError",
        });
        throw toMediaDeletionTrpcError(error);
      }
      return { success: true };
    }),

  getListingMedia: sellerProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: and(
          eq(listings.id, input.listingId),
          eq(listings.sellerId, ctx.user.id),
        ),
        columns: { id: true },
      });
      if (!listing) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only view media for your own listings",
        });
      }

      return ctx.db.query.media.findMany({
        where: and(
          eq(media.listingId, input.listingId),
          eq(media.uploaderId, ctx.user.id),
          isNull(media.deletionClaimToken),
        ),
        orderBy: (media, { asc }) => [asc(media.sortOrder)],
      });
    }),

  deleteBuyerMedia: verifiedBuyerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await deleteOwnedMediaWithProvider({
          mediaId: input.id,
          uploaderId: ctx.user.id,
          database: ctx.db,
        });
      } catch (error) {
        console.error("Failed to delete buyer upload", {
          mediaId: input.id,
          userId: ctx.user.id,
          error: error instanceof Error ? error.name : "UnknownError",
        });
        throw toMediaDeletionTrpcError(error);
      }
      return { success: true };
    }),
});
