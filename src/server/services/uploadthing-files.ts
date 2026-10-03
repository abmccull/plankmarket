import { deletePrivateListingPhoto } from "./listing-photo-cleanup";
import { UTApi } from "uploadthing/server";
import { randomUUID } from "crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db, type Database } from "@/server/db";
import { disputeEvidence, media } from "@/server/db/schema";

type UploadThingDeleteClient = Pick<UTApi, "deleteFiles">;

const MEDIA_DELETION_LEASE_MS = 5 * 60 * 1000;

export type MediaDeletionFailure =
  | "not_found"
  | "evidence_retained"
  | "listing_attached"
  | "already_processing"
  | "claim_lost"
  | "provider_failed";

export class MediaDeletionError extends Error {
  constructor(
    readonly failure: MediaDeletionFailure,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MediaDeletionError";
  }
}

export async function deleteUploadThingFile(
  key: string,
  client: UploadThingDeleteClient = new UTApi(),
): Promise<void> {
  const result = await client.deleteFiles(key);
  if (!result.success) {
    throw new Error("UploadThing did not confirm file deletion");
  }
  // success with deletedCount=0 is intentionally idempotent: the object was
  // already absent, so local metadata can still be removed safely.
}

export function getUploadThingFileKeyFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password || parsed.port) return null;

    const trustedHost =
      parsed.hostname === "utfs.io" ||
      /^[a-z0-9-]+\.ufs\.sh$/i.test(parsed.hostname);
    if (!trustedHost) return null;

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "f") return null;

    return decodeURIComponent(segments[1] ?? "") || null;
  } catch {
    return null;
  }
}

export async function deleteMediaWithProvider(params: {
  key: string | null;
  deleteRemote?: (key: string) => Promise<void>;
  deleteMetadata: () => Promise<void>;
}): Promise<void> {
  const deleteRemote = params.deleteRemote ?? deleteUploadThingFile;
  if (params.key) {
    await deleteRemote(params.key);
  }
  await params.deleteMetadata();
}

export async function deleteOwnedMediaWithProvider(params: {
  mediaId: string;
  uploaderId: string;
  database?: Database;
  deleteRemote?: (key: string) => Promise<void>;
}): Promise<void> {
  const database = params.database ?? db;
const [stored] = await database.select({ storageProvider: media.storageProvider, listingPhotoUploadId: media.listingPhotoUploadId })
  .from(media).where(and(eq(media.id, params.mediaId), eq(media.uploaderId, params.uploaderId))).limit(1);
if (!stored) throw new MediaDeletionError("not_found", "Media not found");
if (stored.storageProvider === "supabase_listing") {
  if (!stored.listingPhotoUploadId) throw new MediaDeletionError("not_found", "Media not found");
  let result: "deleted" | "retained" | "not_found";
  try { result = await deletePrivateListingPhoto({ database, uploadId: stored.listingPhotoUploadId, ownerId: params.uploaderId }); }
  catch (error) { throw new MediaDeletionError("provider_failed", "Deletion is awaiting confirmation. This photo cannot be reused. Try again.", { cause: error }); }
  if (result === "retained") throw new MediaDeletionError("evidence_retained", "This photo is retained by a saved draft, listing or transaction.");
  if (result === "not_found") throw new MediaDeletionError("not_found", "Media not found");
  return;
}

  const deleteRemote = params.deleteRemote ?? deleteUploadThingFile;
  const claimToken = randomUUID();

  const claimed = await database.transaction(async (tx) => {
    const [record] = await tx
      .select({
        id: media.id,
        key: media.key,
        listingId: media.listingId,
        deletionClaimToken: media.deletionClaimToken,
        deletionClaimedAt: media.deletionClaimedAt,
      })
      .from(media)
      .where(
        and(
          eq(media.id, params.mediaId),
          eq(media.uploaderId, params.uploaderId),
        ),
      )
      .for("update");

    if (!record) {
      throw new MediaDeletionError("not_found", "Media not found");
    }

    const [attachedEvidence] = await tx
      .select({ id: disputeEvidence.id })
      .from(disputeEvidence)
      .where(eq(disputeEvidence.mediaId, params.mediaId))
      .limit(1);
    if (attachedEvidence) {
      throw new MediaDeletionError(
        "evidence_retained",
        "Evidence attached to a claim is retained with the transaction record",
      );
    }

    // A previous claim is already an admitted operation, even if it predates
    // detach-first admission. Keep its recovery path after the lease expires.
    if (record.listingId && !record.deletionClaimToken) {
      throw new MediaDeletionError(
        "listing_attached",
        "Remove this photo from the listing and save your changes first.",
      );
    }
    const claimedAt = new Date();
    const staleBefore = new Date(claimedAt.getTime() - MEDIA_DELETION_LEASE_MS);

    const [claimedRecord] = await tx
      .update(media)
      .set({ deletionClaimToken: claimToken, deletionClaimedAt: claimedAt })
      .where(
        and(
          eq(media.id, params.mediaId),
          eq(media.uploaderId, params.uploaderId),
          or(
            isNull(media.deletionClaimToken),
            lt(media.deletionClaimedAt, staleBefore),
          ),
        ),
      )
      .returning({ key: media.key });

    if (!claimedRecord) {
      throw new MediaDeletionError(
        "already_processing",
        "Deletion is awaiting confirmation. Retry in a few minutes.",
      );
    }

    return claimedRecord;
  });

  try {
    if (claimed.key) {
      await deleteRemote(claimed.key);
    }
  } catch (error) {
    // A timeout can follow accepted deletion. Keep the claim so an unavailable
    // object cannot be reattached; a later idempotent retry confirms its state.
    throw new MediaDeletionError(
      "provider_failed",
      "Deletion is awaiting confirmation. This photo cannot be reused. Retry in a few minutes.",
      { cause: error },
    );
  }

  await database.transaction(async (tx) => {
    const [record] = await tx
      .select({ id: media.id, deletionClaimToken: media.deletionClaimToken })
      .from(media)
      .where(eq(media.id, params.mediaId))
      .for("update");
    if (!record) return;
    if (record.deletionClaimToken !== claimToken) {
      throw new MediaDeletionError(
        "claim_lost",
        "Media deletion ownership changed before finalization",
      );
    }

    const [attachedEvidence] = await tx
      .select({ id: disputeEvidence.id })
      .from(disputeEvidence)
      .where(eq(disputeEvidence.mediaId, params.mediaId))
      .limit(1);
    if (attachedEvidence) {
      throw new MediaDeletionError(
        "evidence_retained",
        "Evidence was attached before media deletion could finalize",
      );
    }

    const [deleted] = await tx
      .delete(media)
      .where(
        and(
          eq(media.id, params.mediaId),
          eq(media.uploaderId, params.uploaderId),
          eq(media.deletionClaimToken, claimToken),
        ),
      )
      .returning({ id: media.id });
    if (!deleted) {
      throw new MediaDeletionError(
        "claim_lost",
        "Media deletion could not be finalized",
      );
    }
  });
}
