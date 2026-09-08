import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@/server/db";
import { media } from "@/server/db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Candidate = { id: string; uploaderId: string | null; listingId: string | null; buyerRequestId: string | null; deletionClaimToken: string | null };

export function validateListingMediaSelection(ids: string[], rows: Candidate[], sellerId: string, listingId: string) {
  if (ids.length > 20 || new Set(ids).size !== ids.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose up to 20 distinct photos" });
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.uploaderId !== sellerId || row.buyerRequestId || (row.listingId && row.listingId !== listingId) || row.deletionClaimToken) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A selected photo is unavailable. Refresh the photos and try again." });
    }
  }
}

/** Caller must hold the listing row lock; association changes commit with the listing. */
export async function saveListingMedia(tx: Transaction, sellerId: string, listingId: string, ids: string[]) {
  // Lock attached and selected rows together to serialize against deletion claims.
  const rows = await tx.select().from(media).where(or(
    eq(media.listingId, listingId),
    ids.length ? inArray(media.id, ids) : undefined,
  )).for("update");
  validateListingMediaSelection(ids, rows, sellerId, listingId);
  const removed = rows.filter((row) => row.listingId === listingId && !ids.includes(row.id));
  if (removed.some((row) => row.deletionClaimToken)) {
    throw new TRPCError({ code: "CONFLICT", message: "A photo is being deleted. Refresh and try again." });
  }
  // Detach instead of destroying files: cancelled edits and historical evidence remain recoverable.
  if (removed.length) await tx.update(media).set({ listingId: null }).where(and(
    inArray(media.id, removed.map((row) => row.id)), eq(media.uploaderId, sellerId), eq(media.listingId, listingId),
  ));
  for (const [sortOrder, id] of ids.entries()) {
    await tx.update(media).set({ listingId, sortOrder }).where(and(
      eq(media.id, id), eq(media.uploaderId, sellerId), isNull(media.deletionClaimToken),
    ));
  }
  return ids.length;
}
