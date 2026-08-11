import {
  createTRPCRouter,
  sellerProcedure,
  verifiedBuyerProcedure,
} from "../trpc";
import { media, listings } from "../db/schema";
import { eq, and } from "drizzle-orm";
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
    if (error.failure === "evidence_retained") {
      return new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    if (
      error.failure === "already_processing" ||
      error.failure === "claim_lost"
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
