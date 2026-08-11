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
  const deleteRemote = params.deleteRemote ?? deleteUploadThingFile;
  const claimToken = randomUUID();
  const claimedAt = new Date();
  const staleBefore = new Date(claimedAt.getTime() - MEDIA_DELETION_LEASE_MS);

  const claimed = await database.transaction(async (tx) => {
    const [record] = await tx
      .select({
        id: media.id,
        key: media.key,
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
        "Media deletion is already in progress",
      );
    }

    return claimedRecord;
  });

  try {
    if (claimed.key) {
      await deleteRemote(claimed.key);
    }
  } catch (error) {
    await database
      .update(media)
      .set({ deletionClaimToken: null, deletionClaimedAt: null })
      .where(
        and(
          eq(media.id, params.mediaId),
          eq(media.deletionClaimToken, claimToken),
        ),
      );
    throw new MediaDeletionError(
      "provider_failed",
      "The remote media object could not be deleted",
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
