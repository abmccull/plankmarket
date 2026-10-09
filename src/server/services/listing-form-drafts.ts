import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import type { Database } from "@/server/db";
import { listingFormDrafts, listings, media, users, type ListingFormDraft } from "@/server/db/schema";
import { blankListingDraftSnapshot, type advanceListingDraftSchema, type saveListingDraftSchema, type ListingDraftReference } from "@/lib/validators/listing-draft";
import { CLEARABLE_LISTING_NUMBER_FIELDS, listingCreationSchema, type ListingFormInput } from "@/lib/validators/listing";
import { isProductImageMimeType } from "./listing-media";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Pick<Database, "select">;
type SaveInput = z.infer<typeof saveListingDraftSchema>;
type AdvanceInput = z.infer<typeof advanceListingDraftSchema>;

function conflict(message = "This listing draft changed on another page or device. Reload the saved version before replacing it."): never {
  throw new TRPCError({ code: "CONFLICT", message });
}
function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter(key => object[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
const fingerprint = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

// Publication acquires listing-quota before this lock, then listing/media rows.
// Draft-only operations never acquire listing or quota locks, nor mutate media.
export async function lockListingFormDrafts(tx: Transaction, sellerId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`listing-form-drafts:${sellerId}`}, 0))`);
}
export async function assertDraftSeller(reader: Reader, sellerId: string) {
  const [seller] = await reader.select({ active: users.active, role: users.role }).from(users).where(eq(users.id, sellerId));
  if (!seller?.active || !["seller", "admin"].includes(seller.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "An active seller account is required to prepare a listing draft." });
  }
}
async function findLatest(reader: Reader, sellerId: string) {
  const [row] = await reader.select().from(listingFormDrafts).where(eq(listingFormDrafts.sellerId, sellerId)).orderBy(desc(listingFormDrafts.generation)).limit(1);
  return row;
}
async function findOwned(reader: Reader, sellerId: string, id: string) {
  const [row] = await reader.select().from(listingFormDrafts).where(and(eq(listingFormDrafts.id, id), eq(listingFormDrafts.sellerId, sellerId)));
  return row;
}

export async function listingDraftDto(reader: Reader, row: ListingFormDraft) {
  const ids = row.snapshot.uploadedMediaIds;
  const records = ids.length ? await reader.select({
    id: media.id, url: media.url, mimeType: media.mimeType, listingId: media.listingId,
    buyerRequestId: media.buyerRequestId, deletionClaimToken: media.deletionClaimToken,
    retained: sql<boolean>`exists(select 1 from dispute_evidence as retained_evidence where retained_evidence.media_id = "media"."id")`,
  }).from(media).where(and(inArray(media.id, ids), eq(media.uploaderId, row.sellerId))) : [];
  const byId = new Map(records.map(record => [record.id, record]));
  const mediaAvailability = ids.map(id => {
    const record = byId.get(id);
    if (!record || record.retained || record.buyerRequestId || !isProductImageMimeType(record.mimeType)) return { id, status: "unavailable" as const };
    if (record.deletionClaimToken) return { id, status: "deleting" as const };
    if (record.listingId && record.listingId !== row.publishedListingId) return { id, status: "reused" as const };
    return { id, status: "available" as const, url: record.url, mimeType: record.mimeType };
  });
  return {
    id: row.id, generation: row.generation, revision: row.revision, state: row.state,
    snapshot: row.snapshot, publishedListingId: row.publishedListingId,
    lastSaveOperationId: row.lastSaveOperationId, createdAt: row.createdAt, updatedAt: row.updatedAt,
    mediaAvailability,
  };
}

export async function getListingFormDraft(database: Database, sellerId: string, id?: string) {
  await assertDraftSeller(database, sellerId);
  const row = id ? await findOwned(database, sellerId, id) : await findLatest(database, sellerId);
  return row ? listingDraftDto(database, row) : null;
}

export async function saveListingFormDraft(database: Database, sellerId: string, input: SaveInput) {
  const row = await database.transaction(async tx => {
    await lockListingFormDrafts(tx, sellerId);
    await assertDraftSeller(tx, sellerId);
    const existing = await findOwned(tx, sellerId, input.id);
    const requestFingerprint = fingerprint({ expectedRevision: input.expectedRevision, snapshot: input.snapshot });
    if (existing?.lastSaveOperationId === input.operationId) {
      if (existing.lastSaveFingerprint !== requestFingerprint) conflict("This save identity was already used with different draft contents.");
      return existing;
    }
    if (input.expectedRevision === null) {
      if (existing || await findLatest(tx, sellerId)) conflict("An account draft already exists. Load it before starting another lot.");
      // Globally unique client IDs must never expose whether another seller owns one.
      const [collision] = await tx.select({ id: listingFormDrafts.id }).from(listingFormDrafts).where(eq(listingFormDrafts.id, input.id));
      if (collision) conflict("This draft identity is unavailable. Reload and try again.");
    } else if (!existing || existing.state !== "editing" || existing.revision !== input.expectedRevision) conflict();

    // Previously accepted IDs may become unavailable; preserve them for visible recovery.
    // New IDs must be owned. Soft references do not attach, retain, or guarantee availability.
    const priorIds = new Set(existing?.snapshot.uploadedMediaIds ?? []);
    const newIds = input.snapshot.uploadedMediaIds.filter(id => !priorIds.has(id));
    if (newIds.length) {
      const owned = await tx.select({ id: media.id }).from(media).where(and(inArray(media.id, newIds), eq(media.uploaderId, sellerId)));
      if (owned.length !== newIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "A selected photo is unavailable. Keep your draft and choose another photo." });
    }
    if (!existing) {
      const [created] = await tx.insert(listingFormDrafts).values({ id: input.id, sellerId, generation: 1, snapshot: input.snapshot, lastSaveOperationId: input.operationId, lastSaveFingerprint: requestFingerprint }).onConflictDoNothing().returning();
      if (!created) conflict("This draft identity is unavailable. Reload and try again.");
      return created;
    }
    const [updated] = await tx.update(listingFormDrafts).set({ snapshot: input.snapshot, revision: existing.revision + 1, lastSaveOperationId: input.operationId, lastSaveFingerprint: requestFingerprint, updatedAt: new Date() }).where(and(eq(listingFormDrafts.id, input.id), eq(listingFormDrafts.sellerId, sellerId), eq(listingFormDrafts.state, "editing"), eq(listingFormDrafts.revision, input.expectedRevision!))).returning();
    if (!updated) conflict();
    return updated;
  });
  return listingDraftDto(database, row);
}

export async function advanceListingFormDraft(database: Database, sellerId: string, input: AdvanceInput) {
  const row = await database.transaction(async tx => {
    await lockListingFormDrafts(tx, sellerId);
    await assertDraftSeller(tx, sellerId);
    const existing = await findOwned(tx, sellerId, input.id);
    if (!existing) conflict();
    const requestFingerprint = fingerprint({ expectedRevision: input.expectedRevision, nextId: input.nextId });
    if (existing.advanceOperationId === input.operationId) {
      if (existing.advanceFingerprint !== requestFingerprint || existing.nextDraftId !== input.nextId) conflict("This new-lot identity was already used for a different draft.");
      const next = await findOwned(tx, sellerId, input.nextId);
      if (!next) conflict("The next draft is unavailable. Reload your saved draft.");
      return next;
    }
    const latest = await findLatest(tx, sellerId);
    if (existing.revision !== input.expectedRevision || existing.nextDraftId || latest?.id !== existing.id) conflict();
    const [collision] = await tx.select({ id: listingFormDrafts.id }).from(listingFormDrafts).where(eq(listingFormDrafts.id, input.nextId));
    if (collision) conflict("This new draft identity is unavailable. Reload and try again.");
    const snapshot = blankListingDraftSnapshot();
    await tx.update(listingFormDrafts).set({ state: existing.state === "published" ? "published" : "discarded", revision: existing.revision + 1, nextDraftId: input.nextId, advanceOperationId: input.operationId, advanceFingerprint: requestFingerprint, updatedAt: new Date() }).where(and(eq(listingFormDrafts.id, existing.id), eq(listingFormDrafts.sellerId, sellerId), eq(listingFormDrafts.revision, input.expectedRevision)));
    const [created] = await tx.insert(listingFormDrafts).values({ id: input.nextId, sellerId, generation: existing.generation + 1, snapshot, lastSaveOperationId: input.operationId, lastSaveFingerprint: fingerprint({ expectedRevision: null, snapshot }) }).onConflictDoNothing().returning();
    if (!created) conflict("This new draft identity is unavailable. Reload and try again.");
    return created;
  });
  return listingDraftDto(database, row);
}

function publishableInput(input: ListingFormInput) {
  const { automaticMarkdownStartedAt, automaticMarkdownCurrentStep, automaticMarkdownLastAppliedAt, pricingRulesVersion, ...editable } = listingCreationSchema.parse(input);
  void automaticMarkdownStartedAt; void automaticMarkdownCurrentStep; void automaticMarkdownLastAppliedAt; void pricingRulesVersion;
  return editable;
}

/** Caller already holds listing quota; no provider work is allowed in this transaction. */
export async function prepareListingDraftPublication(tx: Transaction, sellerId: string, reference: ListingDraftReference, input: ListingFormInput) {
  await lockListingFormDrafts(tx, sellerId);
  const [draft] = await tx.select().from(listingFormDrafts).where(and(eq(listingFormDrafts.id, reference.id), eq(listingFormDrafts.sellerId, sellerId))).orderBy(asc(listingFormDrafts.id)).for("update");
  if (!draft) throw new TRPCError({ code: "NOT_FOUND", message: "The saved listing draft is unavailable." });
  const publicationFingerprint = fingerprint(publishableInput(input));
  if (draft.state === "published") {
    if (draft.publishedRevision !== reference.revision || draft.publicationFingerprint !== publicationFingerprint) conflict("This draft was already published with different contents. Open the published listing from your inventory.");
    const [receipt] = await tx.select().from(listings).where(and(eq(listings.id, draft.publishedListingId!), eq(listings.sellerId, sellerId)));
    if (!receipt) throw new TRPCError({ code: "NOT_FOUND", message: "This draft was already published, but the listing is no longer available. Check your inventory before preparing it again." });
    return { draft, receipt, publicationFingerprint };
  }
  if (draft.state !== "editing" || draft.revision !== reference.revision) conflict();
  const restored: Record<string, unknown> = { ...draft.snapshot.formData, mediaIds: draft.snapshot.uploadedMediaIds };
  for (const field of CLEARABLE_LISTING_NUMBER_FIELDS) if (restored[field] === null) restored[field] = undefined;
  const parsed = listingCreationSchema.safeParse(restored);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: `Finish the saved draft before publishing. ${parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join(" ")}` });
  if (fingerprint(publishableInput(parsed.data)) !== publicationFingerprint) conflict("Your latest form changes are not saved to this draft revision. Save and review them before publishing.");
  return { draft, receipt: null, publicationFingerprint };
}

export async function consumeListingFormDraft(tx: Transaction, draft: ListingFormDraft, listingId: string, publicationFingerprint: string) {
  const [updated] = await tx.update(listingFormDrafts).set({ state: "published", publishedListingId: listingId, publishedRevision: draft.revision, publicationFingerprint, revision: draft.revision + 1, updatedAt: new Date() }).where(and(eq(listingFormDrafts.id, draft.id), eq(listingFormDrafts.sellerId, draft.sellerId), eq(listingFormDrafts.state, "editing"), eq(listingFormDrafts.revision, draft.revision))).returning({ id: listingFormDrafts.id });
  if (!updated) conflict();
}
