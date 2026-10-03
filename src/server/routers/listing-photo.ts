import { z } from "zod";
import { createTRPCRouter, listingPhotoProcedure } from "../trpc";
import { LISTING_PHOTO_MIME_TYPES, MAX_LISTING_PHOTO_BYTES } from "@/lib/listing-photos";
import { prepareListingPhoto, completeListingPhoto, listListingPhotos } from "@/server/services/listing-photos";

const id = z.string().uuid().transform(value => value.toLowerCase());
const scope = z.object({ expectedOwnerId: id, draftId: id }).strict();
const prepare = scope.extend({ uploadId: id, fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_LISTING_PHOTO_BYTES), mimeType: z.enum(LISTING_PHOTO_MIME_TYPES) });
const complete = scope.extend({ uploadId: id, expectedRevision: z.number().int().positive() });

export const listingPhotoRouter = createTRPCRouter({
  prepare: listingPhotoProcedure.input(prepare).mutation(({ ctx, input }) => prepareListingPhoto(ctx.db, {
    userId: ctx.user.id, authId: ctx.authUser.id, adminAssured: ctx.user.role === "admin",
  }, input)),
  complete: listingPhotoProcedure.input(complete).mutation(({ ctx, input }) => completeListingPhoto(ctx.db, {
    userId: ctx.user.id, authId: ctx.authUser.id, adminAssured: ctx.user.role === "admin",
  }, input)),
  list: listingPhotoProcedure.input(scope).query(({ ctx, input }) => listListingPhotos(ctx.db, {
    userId: ctx.user.id, authId: ctx.authUser.id, adminAssured: ctx.user.role === "admin",
  }, input)),
});
