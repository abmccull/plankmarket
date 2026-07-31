import {
  createTRPCRouter,
  sellerProcedure,
  verifiedBuyerProcedure,
} from "../trpc";
import { disputeEvidence, media, listings } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { deleteMediaWithProvider } from "@/server/services/uploadthing-files";

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
      await ctx.db.transaction(async (tx) => {
        const [mediaRecord] = await tx
          .select({ id: media.id, key: media.key })
          .from(media)
          .where(
            and(
              eq(media.id, input.id),
              eq(media.uploaderId, ctx.user.id),
            ),
          )
          .for("update");
        if (!mediaRecord) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Media not found",
          });
        }

        const [attachedEvidence] = await tx
          .select({ id: disputeEvidence.id })
          .from(disputeEvidence)
          .where(eq(disputeEvidence.mediaId, input.id))
          .limit(1);
        if (attachedEvidence) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Evidence attached to a claim is retained with the transaction record",
          });
        }

        try {
          await deleteMediaWithProvider({
            key: mediaRecord.key,
            deleteMetadata: async () => {
              await tx
                .delete(media)
                .where(
                  and(
                    eq(media.id, input.id),
                    eq(media.uploaderId, ctx.user.id),
                  ),
                );
            },
          });
        } catch {
          console.error("Failed to delete seller upload", {
            mediaId: input.id,
            userId: ctx.user.id,
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The image could not be deleted. Please try again.",
          });
        }
      });
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
      await ctx.db.transaction(async (tx) => {
        const [mediaRecord] = await tx
          .select({ id: media.id, key: media.key })
          .from(media)
          .where(
            and(
              eq(media.id, input.id),
              eq(media.uploaderId, ctx.user.id),
            ),
          )
          .for("update");
        if (!mediaRecord) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Media not found",
          });
        }

        const [attachedEvidence] = await tx
          .select({ id: disputeEvidence.id })
          .from(disputeEvidence)
          .where(eq(disputeEvidence.mediaId, input.id))
          .limit(1);
        if (attachedEvidence) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Evidence attached to a claim is retained with the transaction record",
          });
        }

        try {
          await deleteMediaWithProvider({
            key: mediaRecord.key,
            deleteMetadata: async () => {
              await tx
                .delete(media)
                .where(
                  and(
                    eq(media.id, input.id),
                    eq(media.uploaderId, ctx.user.id),
                  ),
                );
            },
          });
        } catch {
          console.error("Failed to delete buyer upload", {
            mediaId: input.id,
            userId: ctx.user.id,
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The image could not be deleted. Please try again.",
          });
        }
      });
      return { success: true };
    }),
});
