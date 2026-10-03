import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@/server/db";
import { disputeEvidence, media, type Listing } from "@/server/db/schema";
import { normalizeEvidenceMimeType } from "@/server/security/evidence-files";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type LockedListing = Pick<Listing, "id" | "sellerId" | "status">;
type Candidate = Pick<
  typeof media.$inferSelect,
  | "id"
  | "uploaderId"
  | "listingId"
  | "buyerRequestId"
  | "deletionClaimToken"
  | "mimeType"
>;

export function isProductImageMimeType(value: string | null | undefined) {
  const normalized = normalizeEvidenceMimeType(value);
  return normalized !== null && normalized !== "application/pdf";
}

/** Filter before applying a cover-image limit, including legacy media rows. */
export function publicProductPhotoWhere(
  fields: Pick<typeof media, "id" | "mimeType" | "deletionClaimToken">,
) {
  return and(
    isNull(fields.deletionClaimToken),
    sql`lower(trim(${fields.mimeType})) in ('image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif')`,
    sql`not exists (select 1 from dispute_evidence as retained_evidence where retained_evidence.media_id = ${fields.id})`,
  );
}

export function validateListingMediaSelection(
  ids: string[],
  rows: Candidate[],
  sellerId: string,
  listingId: string,
) {
  if (ids.length > 20 || new Set(ids).size !== ids.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Choose up to 20 distinct photos",
    });
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of ids) {
    const row = byId.get(id);
    if (
      !row ||
      row.uploaderId !== sellerId ||
      row.buyerRequestId ||
      (row.listingId && row.listingId !== listingId) ||
      row.deletionClaimToken ||
      !isProductImageMimeType(row.mimeType)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "A selected photo is unavailable or is not a supported product image. Refresh the photos and try again.",
      });
    }
  }
}

export async function retainedMediaIds(tx: Transaction, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const retained = await tx
    .select({ mediaId: disputeEvidence.mediaId })
    .from(disputeEvidence)
    .where(inArray(disputeEvidence.mediaId, ids));
  return new Set(retained.map((row) => row.mediaId));
}

/** Caller holds the listing lock; always acquire media locks in ID order. */
export async function lockUsableListingPhotos(
  tx: Transaction,
  listing: Pick<LockedListing, "id" | "sellerId">,
) {
  const rows = await tx
    .select()
    .from(media)
    .where(eq(media.listingId, listing.id))
    .orderBy(asc(media.id))
    .for("update");
  const retained = await retainedMediaIds(
    tx,
    rows.map((row) => row.id),
  );
  return rows.filter(
    (row) =>
      row.uploaderId === listing.sellerId &&
      !row.buyerRequestId &&
      !row.deletionClaimToken &&
      isProductImageMimeType(row.mimeType) &&
      !retained.has(row.id),
  );
}

/** Caller must hold this owned listing's row lock, including for partial edits. */
export async function saveListingMedia(
  tx: Transaction,
  listing: LockedListing,
  selectedIds?: string[],
  append = false,
) {
  const { id: listingId, sellerId } = listing;
  // Lock attached and selected rows together to serialize against deletion claims.
  const rows = await tx
    .select()
    .from(media)
    .where(
      or(
        eq(media.listingId, listingId),
        selectedIds?.length ? inArray(media.id, selectedIds) : undefined,
      ),
    )
    .orderBy(asc(media.id))
    .for("update");
  const attachedIds = rows
      .filter((row) => row.listingId === listingId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .map((row) => row.id);
  const ids = append
    ? [...new Set([...attachedIds, ...(selectedIds ?? [])])]
    : selectedIds ?? attachedIds;
  validateListingMediaSelection(ids, rows, sellerId, listingId);
  const retained = await retainedMediaIds(tx, ids);
  if (retained.size)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Claim evidence cannot be used as a public product photo. Upload a separate product image.",
    });
  if (listing.status === "active" && !ids.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Keep at least one saved product photo on an active listing. Add a replacement before removing this photo.",
    });
  // A partial edit validates the saved selection without changing its order.
  if (selectedIds === undefined) return ids.length;
  const removed = rows.filter(
    (row) => row.listingId === listingId && !ids.includes(row.id),
  );
  if (removed.some((row) => row.deletionClaimToken)) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "A photo deletion is awaiting confirmation. Retry that deletion before changing the saved photos.",
    });
  }
  // Detach instead of destroying files: cancelled edits and historical evidence remain recoverable.
  if (removed.length)
    await tx
      .update(media)
      .set({ listingId: null })
      .where(
        and(
          inArray(
            media.id,
            removed.map((row) => row.id),
          ),
          eq(media.uploaderId, sellerId),
          eq(media.listingId, listingId),
        ),
      );
  for (const [sortOrder, id] of ids.entries()) {
    const [saved] = await tx
      .update(media)
      .set({ listingId, sortOrder })
      .where(
        and(
          eq(media.id, id),
          eq(media.uploaderId, sellerId),
          isNull(media.deletionClaimToken),
        ),
      )
      .returning({ id: media.id });
    if (!saved)
      throw new TRPCError({
        code: "CONFLICT",
        message: "A photo changed while saving. Refresh and try again.",
      });
  }
  return ids.length;
}
