import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@/server/db";
import { listingFormDrafts, media, users } from "@/server/db/schema";
import { listingPhotoUploads } from "@/server/db/schema/listing-photo-uploads";
import {
  listingPhotoHref, LISTING_PHOTO_UPLOAD_TTL_MS,
  MAX_LISTING_PHOTO_PREPARATIONS_PER_DAY, MAX_OUTSTANDING_LISTING_PHOTO_UPLOADS,
} from "@/lib/listing-photos";
import { listingDraftDto, lockListingFormDrafts, saveListingFormDraft } from "./listing-form-drafts";
import { privateListingPhotoStorage, validateListingPhotoRaster } from "./listing-photo-storage";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Upload = typeof listingPhotoUploads.$inferSelect;
type Draft = typeof listingFormDrafts.$inferSelect;
type Photo = typeof media.$inferSelect;
type Storage = Awaited<ReturnType<typeof privateListingPhotoStorage>>;

/** Constructed only by an authenticated, admin-assured server procedure. */
export type ListingPhotoActor = { userId: string; authId: string; adminAssured: boolean };
export type ListingPhotoScope = { expectedOwnerId: string; draftId: string };
export type PrepareListingPhotoInput = ListingPhotoScope & {
  uploadId: string; fileName: string; fileSize: number; mimeType: "image/jpeg" | "image/png" | "image/webp";
};
export type CompleteListingPhotoInput = ListingPhotoScope & { uploadId: string; expectedRevision: number };

function conflict(message = "This listing draft changed. Check the saved draft before retrying this photo."): never {
  throw new TRPCError({ code: "CONFLICT", message });
}
function unavailable(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "This photo upload is unavailable. Check your saved draft." });
}
function assertOwner(actor: ListingPhotoActor, input: ListingPhotoScope) {
  if (input.expectedOwnerId !== actor.userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Your account changed. Reload the draft before uploading photos." });
  }
}
async function assertCurrentSeller(tx: Transaction, actor: ListingPhotoActor) {
  const [user] = await tx.select({ authId: users.authId, active: users.active, role: users.role })
    .from(users).where(eq(users.id, actor.userId));
  if (!user || !user.active || user.authId !== actor.authId || (user.role !== "seller" && user.role !== "admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "An active seller account is required to prepare listing photos." });
  }
  // A stale seller context cannot inherit an administrative role without MFA.
  if (user.role === "admin" && !actor.adminAssured) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Reload and verify your administrator security session." });
  }
}
async function lockCurrentDraft(tx: Transaction, actor: ListingPhotoActor, input: ListingPhotoScope) {
  assertOwner(actor, input);
  await lockListingFormDrafts(tx, actor.userId);
  await assertCurrentSeller(tx, actor);
  const [draft] = await tx.select().from(listingFormDrafts)
    .where(and(eq(listingFormDrafts.id, input.draftId), eq(listingFormDrafts.sellerId, actor.userId))).for("update");
  const [latest] = await tx.select({ id: listingFormDrafts.id }).from(listingFormDrafts)
    .where(eq(listingFormDrafts.sellerId, actor.userId)).orderBy(desc(listingFormDrafts.generation)).limit(1);
  if (!draft) unavailable();
  if (draft.state !== "editing" || latest?.id !== draft.id || draft.nextDraftId) conflict("This draft is no longer being edited. Open the current saved draft.");
  return draft;
}
function assertLiveIntent(upload: Upload, databaseNowMs = Date.now()) {
  if (upload.deletionRequestedAt || upload.deletedAt) unavailable();
  if (upload.expiresAt.getTime() <= Math.max(Date.now(), databaseNowMs)) conflict("This upload expired. Keep your draft and choose the photo again.");
}
async function databaseClock(database: Pick<Database, "execute">) {
  const [value] = await database.execute<{ now: string }>(sql`select clock_timestamp()::text as now`);
  if (!value?.now || !Number.isFinite(new Date(value.now).getTime())) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Photo preparation could not verify its deadline. Try again." });
  return value.now;
}
function assertIntentScope(upload: Upload | undefined, actor: ListingPhotoActor, draft: Draft): asserts upload is Upload {
  if (!upload || upload.ownerId !== actor.userId || upload.draftId !== draft.id || upload.draftGeneration !== draft.generation || upload.deletionRequestedAt || upload.deletedAt) unavailable();
}
function safePhoto(photo: Photo) {
  return { id: photo.id, url: listingPhotoHref(photo.id), fileName: photo.fileName ?? "Product photo", sortOrder: photo.sortOrder };
}
function assertReadyPhoto(photo: Photo | undefined, upload: Upload): asserts photo is Photo {
  if (!photo || !upload.readyAt || !upload.readyMediaId || !upload.contentSha256 || !upload.completedRevision ||
    photo.id !== upload.readyMediaId || photo.uploaderId !== upload.ownerId || photo.storageProvider !== "supabase_listing" ||
    photo.listingPhotoUploadId !== upload.id || photo.deletionClaimToken || photo.buyerRequestId || photo.listingId ||
    photo.url !== listingPhotoHref(photo.id) || photo.mimeType !== upload.mimeType || photo.fileSize !== upload.fileSize) unavailable();
}

/** Commits the durable intent before issuing a token; a lost token response can be reconciled by UUID. */
export async function prepareListingPhoto(database: Database, actor: ListingPhotoActor, input: PrepareListingPhotoInput) {
  assertOwner(actor, input);
  const upload = await database.transaction(async tx => {
    const draft = await lockCurrentDraft(tx, actor, input);
    const now = await databaseClock(tx);
    const [existing] = await tx.select().from(listingPhotoUploads).where(eq(listingPhotoUploads.id, input.uploadId)).for("update");
    if (existing) {
      if (existing.ownerId !== actor.userId || existing.draftId !== draft.id || existing.draftGeneration !== draft.generation ||
        existing.fileName !== input.fileName || existing.fileSize !== input.fileSize || existing.mimeType !== input.mimeType) {
        conflict("This upload identity is unavailable for these photo details. Check the existing upload before trying again.");
      }
      assertLiveIntent(existing, new Date(now).getTime());
      return existing;
    }
    const [daily] = await tx.select({ value: sql<number>`count(*)::int` }).from(listingPhotoUploads)
      .where(and(eq(listingPhotoUploads.ownerId, actor.userId), gte(listingPhotoUploads.createdAt, sql`clock_timestamp() - interval '24 hours'`)));
    const [outstanding] = await tx.select({ value: sql<number>`count(*)::int` }).from(listingPhotoUploads)
      .where(and(eq(listingPhotoUploads.ownerId, actor.userId), eq(listingPhotoUploads.draftId, draft.id), eq(listingPhotoUploads.draftGeneration, draft.generation), isNull(listingPhotoUploads.deletedAt)));
    if (daily.value >= MAX_LISTING_PHOTO_PREPARATIONS_PER_DAY || outstanding.value >= MAX_OUTSTANDING_LISTING_PHOTO_UPLOADS) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "This account has reached its photo preparation limit. Your saved draft and photos are safe. Try again later." });
    }
    const origin = `${draft.id}/${draft.generation}/${input.uploadId}`;
    const [created] = await tx.insert(listingPhotoUploads).values({
      id: input.uploadId, ownerId: actor.userId, draftId: draft.id, draftGeneration: draft.generation,
      fileName: input.fileName, fileSize: input.fileSize, mimeType: input.mimeType,
      incomingPath: `${actor.userId}/incoming/${origin}`, frozenPath: `${actor.userId}/frozen/${origin}`,
      createdAt: sql`${now}::timestamptz`, expiresAt: sql`${now}::timestamptz + (${LISTING_PHOTO_UPLOAD_TTL_MS} * interval '1 millisecond')`,
    }).onConflictDoNothing().returning();
    if (!created) conflict("This upload identity is unavailable. Check your saved upload before trying again.");
    return created;
  });
  assertLiveIntent(upload, new Date(await databaseClock(database)).getTime());
  const storage = await privateListingPhotoStorage({ database });
  const signed = await storage.createSignedUploadUrl(upload.incomingPath, { upsert: false });
  if (signed.error || !signed.data || signed.data.path !== upload.incomingPath || !signed.data.token) {
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Photo storage could not start the transfer. Retry this same photo upload." });
  }
  // Tokens may have their own provider lifetime. This immutable application
  // deadline remains authoritative; retries never extend the ledger deadline.
  assertLiveIntent(upload, new Date(await databaseClock(database)).getTime());
  return { uploadId: upload.id, path: upload.incomingPath, token: signed.data.token, expiresAt: upload.expiresAt };
}

async function lockOperation(tx: Transaction, actor: ListingPhotoActor, input: CompleteListingPhotoInput) {
  const draft = await lockCurrentDraft(tx, actor, input);
  // Read identity first, then lock existing media before its ledger. The shared
  // draft lock serializes competing completion/save/publication operations.
  const [peek] = await tx.select().from(listingPhotoUploads).where(eq(listingPhotoUploads.id, input.uploadId));
  assertIntentScope(peek, actor, draft);
  const existingMediaIds = [...new Set([...draft.snapshot.uploadedMediaIds, ...(peek.readyMediaId ? [peek.readyMediaId] : [])])];
  const photos = existingMediaIds.length ? await tx.select().from(media)
    .where(inArray(media.id, existingMediaIds)).orderBy(asc(media.id)).for("update") : [];
  const [upload] = await tx.select().from(listingPhotoUploads).where(eq(listingPhotoUploads.id, input.uploadId)).for("update");
  assertIntentScope(upload, actor, draft);
  if (upload.readyMediaId) {
    const photo = photos.find(item => item.id === upload.readyMediaId);
    assertReadyPhoto(photo, upload);
    return { draft, upload, photo };
  }
  assertLiveIntent(upload, new Date(await databaseClock(tx)).getTime());
  if (draft.revision !== input.expectedRevision) conflict();
  if (draft.snapshot.uploadedMediaIds.length >= 20) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This draft already has 20 photos. Save a removal before adding another photo." });
  }
  return { draft, upload, photo: null };
}
function isMissingObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const data = error as { statusCode?: unknown; status?: unknown; code?: unknown };
  return String(data.statusCode ?? "") === "404" || String(data.status ?? "") === "404" ||
    [data.statusCode, data.code].some(code => code === "NoSuchKey" || code === "NoSuchObject");
}
async function downloadBytes(storage: Storage, objectPath: string, allowMissing: boolean) {
  const result = await storage.download(objectPath);
  if (result.error || !result.data) {
    if (allowMissing && isMissingObject(result.error)) return null;
    throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "The photo transfer could not be confirmed. Retry this same upload." });
  }
  return new Uint8Array(await result.data.arrayBuffer());
}
async function checkedHash(bytes: Uint8Array, upload: Upload) {
  try { await validateListingPhotoRaster(bytes, upload.fileSize, upload.mimeType); }
  catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "The uploaded photo could not be read. Export a still JPEG, PNG or WebP under 4 MB and choose it again." }); }
  return createHash("sha256").update(bytes).digest("hex");
}
async function freezePhotoBytes(storage: Storage, upload: Upload) {
  // Reconcile the immutable destination before repeating any uncertain copy.
  let frozen = await downloadBytes(storage, upload.frozenPath, true);
  const incoming = await downloadBytes(storage, upload.incomingPath, false);
  if (!incoming) unavailable();
  const incomingHash = await checkedHash(incoming, upload);
  if (!frozen) {
    try {
      // Copy has no overwrite flag: the signed URL can only target incoming.
      // An error is uncertain until the deterministic destination is read back.
      await storage.copy(upload.incomingPath, upload.frozenPath);
    } catch { /* Confirm the original operation before offering a retry. */ }
    frozen = await downloadBytes(storage, upload.frozenPath, false);
  }
  if (!frozen) unavailable();
  const frozenHash = await checkedHash(frozen, upload);
  if (frozenHash !== incomingHash) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The photo changed during upload. Choose the original photo again." });
  }
  return frozenHash;
}

/** No provider I/O occurs in either database transaction. Final ready/append is one atomic commit. */
export async function completeListingPhoto(database: Database, actor: ListingPhotoActor, input: CompleteListingPhotoInput) {
  assertOwner(actor, input);
  const before = await database.transaction(async tx => {
    const operation = await lockOperation(tx, actor, input);
    return { ...operation, receipt: operation.photo ? {
      photo: safePhoto(operation.photo), draft: await listingDraftDto(tx, operation.draft),
    } : null };
  });
  if (before.receipt) return before.receipt;
  const storage = await privateListingPhotoStorage({ database });
  const contentSha256 = await freezePhotoBytes(storage, before.upload);
  return database.transaction(async tx => {
    const current = await lockOperation(tx, actor, input);
    if (current.photo) return { photo: safePhoto(current.photo), draft: await listingDraftDto(tx, current.draft) };
    const id = randomUUID();
    const [photo] = await tx.insert(media).values({
      id, uploaderId: actor.userId, listingId: null, buyerRequestId: null,
      url: listingPhotoHref(id), key: null, fileName: current.upload.fileName,
      fileSize: current.upload.fileSize, mimeType: current.upload.mimeType,
      sortOrder: current.draft.snapshot.uploadedMediaIds.length,
      storageProvider: "supabase_listing", listingPhotoUploadId: current.upload.id,
    }).returning();
    const [completed] = await tx.update(listingPhotoUploads).set({
      readyMediaId: id, readyAt: sql`clock_timestamp()`, contentSha256, completedRevision: current.draft.revision + 1,
    }).where(and(eq(listingPhotoUploads.id, current.upload.id), isNull(listingPhotoUploads.readyAt),
      isNull(listingPhotoUploads.deletionRequestedAt), isNull(listingPhotoUploads.deletedAt))).returning({ id: listingPhotoUploads.id });
    if (!completed) conflict();
    // Reuse the existing draft CAS, normalization and operation fingerprint.
    // Its nested transaction is a savepoint within this same atomic commit.
    const draft = await saveListingFormDraft(tx as unknown as Database, actor.userId, {
      id: current.draft.id, expectedRevision: input.expectedRevision, operationId: input.uploadId,
      snapshot: { ...current.draft.snapshot, uploadedMediaIds: [...current.draft.snapshot.uploadedMediaIds, id] },
    });
    return { photo: safePhoto(photo), draft };
  });
}

/** Recovery receipt only: no token, object path, hash, or incomplete preparation metadata. */
export async function listListingPhotos(database: Database, actor: ListingPhotoActor, input: ListingPhotoScope) {
  assertOwner(actor, input);
  return database.transaction(async tx => {
    const draft = await lockCurrentDraft(tx, actor, input);
    const rows = await tx.select({ uploadId: listingPhotoUploads.id, photo: media }).from(listingPhotoUploads)
      .innerJoin(media, and(eq(media.id, listingPhotoUploads.readyMediaId), eq(media.listingPhotoUploadId, listingPhotoUploads.id)))
      .where(and(eq(listingPhotoUploads.ownerId, actor.userId), eq(listingPhotoUploads.draftId, draft.id), eq(listingPhotoUploads.draftGeneration, draft.generation),
        isNull(listingPhotoUploads.deletionRequestedAt), isNull(listingPhotoUploads.deletedAt),
        eq(media.uploaderId, actor.userId), eq(media.storageProvider, "supabase_listing"), isNull(media.listingId), isNull(media.buyerRequestId), isNull(media.deletionClaimToken),
        sql`not exists(select 1 from dispute_evidence e where e.media_id=${media.id})`))
      .orderBy(asc(listingPhotoUploads.readyAt), asc(listingPhotoUploads.id));
    return rows.map(row => ({ uploadId: row.uploadId, photo: safePhoto(row.photo) }));
  });
}
