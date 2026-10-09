import { purgeAbandonedListingPhotos, purgeDeletedListingPhotoResidue, type ListingPhotoCleanupResult } from "./listing-photo-cleanup";
import { verificationDocumentId, verificationDocumentReference } from "@/lib/verification-documents";
import { deletePrivateVerificationDocument, purgeAbandonedVerificationDocuments } from "./verification-documents";
import { expireSellerActivationEvidence } from "./seller-activation";
import { purgeDeletedVerificationResidue, type VerificationResidueResult } from "./verification-document-residue";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, type Database } from "@/server/db";
import {
  sampleRequests,
  shippingAddresses,
  users,
  verificationDrafts,
  sellerActivationRequests,
} from "@/server/db/schema";
import {
  deleteUploadThingFile,
  getUploadThingFileKeyFromUrl,
} from "@/server/services/uploadthing-files";

type DbExecutor =
  | Database
  | Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface PrivacyRetentionSweepResult {
  listingPhotoResidue?: ListingPhotoCleanupResult;
  listingPhotoAbandoned?: ListingPhotoCleanupResult;
  verificationResidue?: VerificationResidueResult;
  verificationDraftsDeleted: number;
  verificationDraftProviderDeletionFailed: number;
  verificationDraftProviderRetentionBlocked: number;
  verificationEvidencePurged: number;
  verificationProviderDeletionFailed: number;
  verificationProviderRetentionBlocked: number;
  sampleRequestsPurged: number;
  shippingAddressesDeleted: number;
  sellerActivationsExpired: number;
  sellerActivationEvidencePurged: number;
  sellerActivationProviderDeletionFailed: number;
  sellerActivationProviderRetentionBlocked: number;
}

type VerificationDocumentReference = {
  kind: "draft" | "user" | "activation";
  id: string;
  documentUrl: string;
  trustedKey: string | null;
  groupKey: string;
  due: boolean;
};

function buildVerificationDocumentReference(params: {
  kind: "draft" | "user" | "activation";
  id: string;
  documentUrl: string | null | undefined;
  due: boolean;
}): VerificationDocumentReference {
  const documentUrl = params.documentUrl?.trim() || "";
  const privateId = verificationDocumentId(documentUrl);
  const trustedKey = privateId ? verificationDocumentReference(privateId) : getUploadThingFileKeyFromUrl(documentUrl);

  return {
    kind: params.kind,
    id: params.id,
    documentUrl,
    trustedKey,
    groupKey: trustedKey ? `key:${trustedKey}` : `url:${documentUrl}`,
    due: params.due,
  };
}

type VerificationDocumentPurgeOutcome =
  | "retained"
  | "deleted"
  | "blocked"
  | "failed";

async function resolveVerificationDocumentPurgeOutcomes(params: {
  references: readonly VerificationDocumentReference[];
  deleteVerificationDocument: (key: string) => Promise<void | "deleted" | "retained">;
}): Promise<Map<string, VerificationDocumentPurgeOutcome>> {
  const referenceGroups = new Map<string, VerificationDocumentReference[]>();
  for (const reference of params.references) {
    const existing = referenceGroups.get(reference.groupKey) ?? [];
    existing.push(reference);
    referenceGroups.set(reference.groupKey, existing);
  }

  const outcomes = new Map<string, VerificationDocumentPurgeOutcome>();
  for (const [groupKey, references] of referenceGroups) {
    if (!references.some((reference) => reference.due)) {
      continue;
    }

    if (references.some((reference) => !reference.due)) {
      outcomes.set(groupKey, "retained");
      continue;
    }

    const uploadThingKey = references[0]?.trustedKey ?? null;
    if (!uploadThingKey) {
      outcomes.set(groupKey, "blocked");
      continue;
    }

    try {
      const result = await params.deleteVerificationDocument(uploadThingKey);
      outcomes.set(groupKey, result === "retained" ? "retained" : "deleted");
    } catch {
      outcomes.set(groupKey, "failed");
    }
  }

  return outcomes;
}

function getVerificationDocumentPurgeOutcome(
  documentUrl: string | null | undefined,
  outcomes: ReadonlyMap<string, VerificationDocumentPurgeOutcome>,
): VerificationDocumentPurgeOutcome | "no_document" {
  const normalizedUrl = documentUrl?.trim() || null;
  if (!normalizedUrl) return "no_document";

  const privateId = verificationDocumentId(normalizedUrl);
  const uploadThingKey = privateId ? verificationDocumentReference(privateId) : getUploadThingFileKeyFromUrl(normalizedUrl);
  const groupKey = uploadThingKey
    ? `key:${uploadThingKey}`
    : `url:${normalizedUrl}`;
  return outcomes.get(groupKey) ?? "blocked";
}

const TERMINAL_SAMPLE_REQUEST_STATUSES = ["declined", "cancelled", "delivered"] as const;

export async function runPrivacyRetentionSweep(
  executor: DbExecutor = db,
  now = new Date(),
  deleteVerificationDocument: (key: string) => Promise<void | "deleted" | "retained"> = async key => { if (verificationDocumentId(key)) return deletePrivateVerificationDocument(key, { now }); else await deleteUploadThingFile(key); },
): Promise<PrivacyRetentionSweepResult> {
  // Existing tombstones are already unavailable. Their periodic cleanup must
  // commit claims and cannot run inside an injected retention transaction.
  const verificationResidue = executor === db ? await purgeDeletedVerificationResidue() : undefined;
  // Each photo queue has a bounded budget and commits its own durable claims.
  const listingPhotoResidue = executor === db ? await purgeDeletedListingPhotoResidue(db, { budgetMs: 8_000 }) : undefined;
  const listingPhotoAbandoned = executor === db ? await purgeAbandonedListingPhotos(db, { budgetMs: 8_000 }) : undefined;
  // Expiration is a state transition first; no provider removal may race an
  // otherwise-approvable due application. This never resets buyer verification.
  const sellerActivationsExpired = await expireSellerActivationEvidence(executor, now);
  const draftDocumentReferences = await executor
    .select({
      userId: verificationDrafts.userId,
      verificationDocUrl: verificationDrafts.verificationDocUrl,
    })
    .from(verificationDrafts)
    .where(sql`nullif(trim(${verificationDrafts.verificationDocUrl}), '') is not null`);

  const userDocumentReferences = await executor
    .select({
      id: users.id,
      verificationDocUrl: users.verificationDocUrl,
    })
    .from(users)
    .where(
      and(
        isNull(users.verificationEvidencePurgedAt),
        sql`nullif(trim(${users.verificationDocUrl}), '') is not null`,
      ),
    );

  const draftsToPurge = await executor
    .select({
      userId: verificationDrafts.userId,
      verificationDocUrl: verificationDrafts.verificationDocUrl,
    })
    .from(verificationDrafts)
    .where(lte(verificationDrafts.purgeAfter, now));

  const usersToPurge = await executor
    .select({
      id: users.id,
      verificationDocUrl: users.verificationDocUrl,
    })
    .from(users)
    .where(
      and(
        lte(users.verificationDataPurgeAfter, now),
        isNull(users.verificationEvidencePurgedAt),
        or(
          sql`nullif(trim(${users.einTaxId}), '') is not null`,
          sql`nullif(trim(${users.verificationDocUrl}), '') is not null`,
        ),
      ),
    );

  const activationDocumentReferences = await executor
    .select({ id: sellerActivationRequests.id, documentId: sellerActivationRequests.documentId })
    .from(sellerActivationRequests)
    .where(sql`${sellerActivationRequests.documentId} is not null`);

  const activationsToPurge = await executor
    .select({ id: sellerActivationRequests.id, documentId: sellerActivationRequests.documentId })
    .from(sellerActivationRequests)
    .where(and(
      lte(sellerActivationRequests.purgeAfter, now),
      isNull(sellerActivationRequests.evidencePurgedAt),
      sql`(${sellerActivationRequests.status} in ('stale','rejected') or (${sellerActivationRequests.status}='approved' and ${sellerActivationRequests.syncState}='complete'))`,
    ));

  const purgeableDraftUserIds: string[] = [];
  let verificationDraftProviderDeletionFailed = 0;
  let verificationDraftProviderRetentionBlocked = 0;
  const dueDraftIds = new Set(draftsToPurge.map((draft) => draft.userId));
  const dueUserIds = new Set(usersToPurge.map((user) => user.id));
  const dueActivationIds = new Set(activationsToPurge.map(application => application.id));
  const sharedDraftReferences = draftDocumentReferences.map((reference) =>
    buildVerificationDocumentReference({
      kind: "draft",
      id: reference.userId,
      documentUrl: reference.verificationDocUrl,
      due: dueDraftIds.has(reference.userId),
      }),
  );
  const sharedUserReferences = userDocumentReferences.map((reference) =>
    buildVerificationDocumentReference({
      kind: "user",
      id: reference.id,
      documentUrl: reference.verificationDocUrl,
      due: dueUserIds.has(reference.id),
    }),
  );
  const providerPurgeOutcomes = await resolveVerificationDocumentPurgeOutcomes({
    references: [...sharedDraftReferences, ...sharedUserReferences, ...activationDocumentReferences.map(application =>
      buildVerificationDocumentReference({
        kind: "activation",
        id: application.id,
        documentUrl: application.documentId ? `verification-document:${application.documentId}` : null,
        due: dueActivationIds.has(application.id),
      }),
    )],
    deleteVerificationDocument,
  });

  for (const draft of draftsToPurge) {
    const purgeStatus = getVerificationDocumentPurgeOutcome(
      draft.verificationDocUrl,
      providerPurgeOutcomes,
    );

    if (
      purgeStatus === "no_document" ||
      purgeStatus === "retained" ||
      purgeStatus === "deleted"
    ) {
      purgeableDraftUserIds.push(draft.userId);
    } else if (purgeStatus === "blocked") {
      verificationDraftProviderRetentionBlocked += 1;
    } else {
      verificationDraftProviderDeletionFailed += 1;
    }
  }

  const deletedDrafts =
    purgeableDraftUserIds.length === 0
      ? []
      : await executor
          .delete(verificationDrafts)
          .where(and(
            lte(verificationDrafts.purgeAfter, now),
            or(...draftsToPurge.filter(draft => purgeableDraftUserIds.includes(draft.userId)).map(draft => and(
              eq(verificationDrafts.userId, draft.userId),
              sql`${verificationDrafts.verificationDocUrl} is not distinct from ${draft.verificationDocUrl}`,
            ))),
          ))
          .returning({ userId: verificationDrafts.userId });

  const purgeableUserIds: string[] = [];
  let verificationProviderDeletionFailed = 0;
  let verificationProviderRetentionBlocked = 0;

  for (const user of usersToPurge) {
    const purgeStatus = getVerificationDocumentPurgeOutcome(
      user.verificationDocUrl,
      providerPurgeOutcomes,
    );

    if (
      purgeStatus === "no_document" ||
      purgeStatus === "retained" ||
      purgeStatus === "deleted"
    ) {
      purgeableUserIds.push(user.id);
    } else if (purgeStatus === "blocked") {
      verificationProviderRetentionBlocked += 1;
    } else {
      verificationProviderDeletionFailed += 1;
    }
  }

  const purgedUsers =
    purgeableUserIds.length === 0
      ? []
      : await executor
          .update(users)
          .set({
            einTaxId: null,
            einLast4: null,
            verificationDocUrl: null,
            verificationNotes: null,
            verificationDataPurgeAfter: null,
            verificationEvidencePurgedAt: now,
            updatedAt: now,
          })
          .where(and(
            lte(users.verificationDataPurgeAfter, now),
            isNull(users.verificationEvidencePurgedAt),
            or(...usersToPurge.filter(user => purgeableUserIds.includes(user.id)).map(user => and(
              eq(users.id, user.id),
              sql`${users.verificationDocUrl} is not distinct from ${user.verificationDocUrl}`,
            ))),
          ))
          .returning({ id: users.id });

  const purgeableActivationIds: string[] = [];
  let sellerActivationProviderDeletionFailed = 0;
  let sellerActivationProviderRetentionBlocked = 0;
  for (const application of activationsToPurge) {
    const outcome = getVerificationDocumentPurgeOutcome(
      application.documentId ? `verification-document:${application.documentId}` : null,
      providerPurgeOutcomes,
    );
    if (outcome === "no_document" || outcome === "retained" || outcome === "deleted") {
      purgeableActivationIds.push(application.id);
    } else if (outcome === "blocked") {
      sellerActivationProviderRetentionBlocked++;
    } else {
      sellerActivationProviderDeletionFailed++;
    }
  }
  const purgedActivations = purgeableActivationIds.length === 0 ? [] : await executor
    .update(sellerActivationRequests)
    .set({ einTaxId: null, einLast4: null, documentId: null, evidencePurgedAt: now, updatedAt: now })
    .where(and(
      inArray(sellerActivationRequests.id, purgeableActivationIds),
      lte(sellerActivationRequests.purgeAfter, now),
      isNull(sellerActivationRequests.evidencePurgedAt),
      sql`(${sellerActivationRequests.status} in ('stale','rejected') or (${sellerActivationRequests.status}='approved' and ${sellerActivationRequests.syncState}='complete'))`,
    ))
    .returning({ id: sellerActivationRequests.id });

  const purgedSampleRequests = await executor
    .update(sampleRequests)
    .set({
      buyerMessage: null,
      shippingName: "[redacted]",
      shippingAddress1: "[redacted]",
      shippingAddress2: null,
      shippingCity: "[redacted]",
      shippingState: "NA",
      shippingZip: "00000",
      shippingPhone: null,
      carrier: null,
      trackingNumber: null,
      lastActionReason: null,
      auditLog: sql`'[]'::jsonb`,
      piiPurgedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        inArray(
          sampleRequests.status,
          [...TERMINAL_SAMPLE_REQUEST_STATUSES],
        ),
        lte(sampleRequests.retentionPurgeAfter, now),
        isNull(sampleRequests.piiPurgedAt),
      ),
    )
    .returning({ id: sampleRequests.id });

  const deletedShippingAddresses = await executor
    .delete(shippingAddresses)
    .where(lte(shippingAddresses.retentionPurgeAfter, now))
    .returning({ id: shippingAddresses.id });

  if (executor === db) await purgeAbandonedVerificationDocuments(now);

  return {
    ...(verificationResidue ? { verificationResidue } : {}),
    ...(listingPhotoResidue ? { listingPhotoResidue } : {}),
    ...(listingPhotoAbandoned ? { listingPhotoAbandoned } : {}),
    verificationDraftsDeleted: deletedDrafts.length,
    verificationDraftProviderDeletionFailed,
    verificationDraftProviderRetentionBlocked,
    verificationEvidencePurged: purgedUsers.length,
    verificationProviderDeletionFailed,
    verificationProviderRetentionBlocked,
    sampleRequestsPurged: purgedSampleRequests.length,
    shippingAddressesDeleted: deletedShippingAddresses.length,
    sellerActivationsExpired,
    sellerActivationEvidencePurged: purgedActivations.length,
    sellerActivationProviderDeletionFailed,
    sellerActivationProviderRetentionBlocked,
  };
}
