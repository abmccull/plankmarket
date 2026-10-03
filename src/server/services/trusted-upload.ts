import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { UploadThingError } from "uploadthing/server";
import { db, type Database } from "@/server/db";
import { listings, media } from "@/server/db/schema";
import { isTrustedUploadThingFileUrl } from "@/server/security/uploadthing";
import { isProductImageMimeType, retainedMediaIds } from "./listing-media";

/** Only the signed, content-validated UploadThing callback may call this helper. */
export async function persistTrustedUpload(params: {
  userId: string;
  file: { url: string; key: string; name: string; size: number; type: string };
  listingId?: string;
  mimeTypeOverride?: string;
  database?: Database;
}) {
  const { userId, file, listingId, mimeTypeOverride } = params;
  if (!isTrustedUploadThingFileUrl(file.url, file.key)) {
    throw new UploadThingError({
      code: "UPLOAD_FAILED",
      message: "Upload callback returned an invalid file location",
    });
  }
  return (params.database ?? db).transaction(async (tx) => {
    // Listing first, then media: match editor/publication lock order. Recheck
    // ownership because upload completion can outlive its initial middleware.
    if (listingId) {
      const [listing] = await tx
        .select({ id: listings.id })
        .from(listings)
        .where(and(eq(listings.id, listingId), eq(listings.sellerId, userId)))
        .for("update");
      if (!listing)
        throw new UploadThingError({
          code: "FORBIDDEN",
          message: "You can only upload to your own listing",
        });
    }
    await tx
      .insert(media)
      .values({
        uploaderId: userId,
        url: file.url,
        key: file.key,
        fileName: file.name,
        fileSize: file.size,
        mimeType: mimeTypeOverride ?? file.type,
        sortOrder: 0,
      })
      .onConflictDoNothing({
        target: media.key,
        where: sql`${media.key} is not null`,
      });
    // A retry and concurrent insert converge here. Never change object identity
    // or report a claimed object as a usable upload.
    const rows = await tx
      .select()
      .from(media)
      .where(
        or(
          eq(media.key, file.key),
          listingId ? eq(media.listingId, listingId) : undefined,
        ),
      )
      .orderBy(asc(media.id))
      .for("update");
    const record = rows.find((row) => row.key === file.key);
    if (!record || record.uploaderId !== userId)
      throw new UploadThingError({
        code: "FORBIDDEN",
        message: "Upload ownership mismatch",
      });
    if (record.deletionClaimToken)
      throw new UploadThingError({
        code: "UPLOAD_FAILED",
        message:
          "This upload is awaiting deletion confirmation and cannot be reused.",
      });
    if (!listingId) return record;
    if (
      record.buyerRequestId ||
      (record.listingId && record.listingId !== listingId)
    )
      throw new UploadThingError({
        code: "FORBIDDEN",
        message: "Upload is already attached to another listing or request",
      });
    if (!isProductImageMimeType(record.mimeType))
      throw new UploadThingError({
        code: "BAD_REQUEST",
        message: "Use a supported product image for listing photos.",
      });
    const retained = await retainedMediaIds(tx, [record.id]);
    if (retained.size)
      throw new UploadThingError({
        code: "BAD_REQUEST",
        message: "Claim evidence cannot be used as a public product photo.",
      });
    if (record.listingId === listingId) return record;
    const attached = rows
      .filter((row) => row.listingId === listingId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    if (attached.length >= 20)
      throw new UploadThingError({
        code: "BAD_REQUEST",
        message: "A listing can have up to 20 photos.",
      });
    // Keep existing image order, normalizing gaps so the appended index stays
    // within the public 0..19 ordering contract.
    for (const [sortOrder, photo] of attached.entries()) {
      if (photo.sortOrder !== sortOrder)
        await tx.update(media).set({ sortOrder }).where(eq(media.id, photo.id));
    }
    const [saved] = await tx
      .update(media)
      .set({ listingId, sortOrder: attached.length })
      .where(
        and(
          eq(media.id, record.id),
          eq(media.uploaderId, userId),
          isNull(media.listingId),
          isNull(media.buyerRequestId),
          isNull(media.deletionClaimToken),
        ),
      )
      .returning();
    if (!saved)
      throw new UploadThingError({
        code: "UPLOAD_FAILED",
        message: "The photo changed while attaching. Refresh and try again.",
      });
    return saved;
  });
}
