import { withRoleProviderCoordinator, type RoleProviderCoordinator } from "./role-provider-coordinator";
import { openRoleProviderWriteSession } from "./role-provider-write-session";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@/server/db";
import { sellerActivationRequests, users, verificationDocuments, notifications,
  type SellerActivationRequest, type SellerActivationIdentitySnapshot, type User } from "@/server/db/schema";
import { getVerificationSubmissionSchema } from "@/lib/validators/auth";
import { sellerActivationDraftSchema, sellerActivationSubmitSchema, sellerActivationReviewSchema,
  type SellerActivationDraftInput, type SellerActivationSubmitInput, type SellerActivationReviewInput } from "@/lib/validators/seller-activation";
import { verificationDocumentId, verificationDocumentReference } from "@/lib/verification-documents";
import { appendAuditEvent } from "./audit-ledger";
import { sellerActivationRoleProvider, type SellerActivationRoleProvider } from "./seller-activation-provider";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;
type Reader = Pick<Database, "select">;
type Document = typeof verificationDocuments.$inferSelect;
const DAY = 86_400_000;
const CLAIM_MS = 60_000;
const EIN = /^\d{2}-\d{7}$/;
const normalizeEin = (value: string) => value.trim().replace(/^(\d{2})(\d{7})$/, "$1-$2");
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter(key => object[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}
const fingerprint = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
function conflict(message = "Selling setup changed. Reload the saved application before continuing."): never {
  throw new TRPCError({ code: "CONFLICT", message });
}
function unavailable(message: string): never { throw new TRPCError({ code: "PRECONDITION_FAILED", message }); }
function verified(user: User) { return user.active && user.verified && user.verificationStatus === "verified"; }
function identity(user: User): SellerActivationIdentitySnapshot {
  return {
    businessName: user.businessName ?? "", businessAddress: user.businessAddress ?? "",
    businessCity: user.businessCity ?? "", businessState: user.businessState ?? "", businessZip: user.businessZip ?? "",
    authId: user.authId, sourceVerificationSubmissionId: user.verificationSubmissionId,
  };
}
function outstanding(row: SellerActivationRequest) {
  return ["draft", "pending"].includes(row.status) || (row.status === "approved" && row.syncState !== "complete") ||
    (row.status === "stale" && ["pending", "in_progress", "uncertain", "blocked"].includes(row.syncState));
}
function staleReason(user: User, row: SellerActivationRequest, now: Date): string | null {
  if (!user.active || user.role !== "buyer") return "account_changed";
  if (row.purgeAfter <= now || row.evidencePurgedAt) return "evidence_expired";
  if (row.submittedAt && (!verified(user) || row.identityFingerprint !== fingerprint(identity(user)))) return "business_changed";
  return null;
}
async function lockUser(tx: Transaction, userId: string) {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
  return user;
}
async function lockApplication(tx: Transaction, userId: string, id: string) {
  const [row] = await tx.select().from(sellerActivationRequests)
    .where(and(eq(sellerActivationRequests.userId, userId), eq(sellerActivationRequests.id, id))).for("update");
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Selling application not found" });
  return row;
}
async function markStale(tx: Transaction, row: SellerActivationRequest, reason: string, now: Date) {
  if (!outstanding(row)) return row;
  const [changed] = await tx.update(sellerActivationRequests).set({
    status: "stale", revision: row.revision + (row.status === "stale" ? 0 : 1),
    syncState: row.activationOperationId ? "blocked" : "none", claimToken: null, claimExpiresAt: null,
    lastErrorCode: reason, updatedAt: now,
  }).where(eq(sellerActivationRequests.id, row.id)).returning();
  return changed;
}
function documentDeadline(user: User, document: Document) {
  return new Date(Math.min(document.createdAt.getTime() + 30 * DAY,
    document.purpose === "business_verification" ? user.verificationDataPurgeAfter?.getTime() ?? Infinity : Infinity));
}
function usableDocument(user: User, rowId: string | null, document: Document | undefined, now: Date): document is Document {
  return Boolean(document && document.userId === user.id && document.readyAt && !document.deletedAt && !document.deletionRequestedAt &&
    ["business_verification", "seller_activation"].includes(document.purpose) && documentDeadline(user, document) > now &&
    (document.purpose !== "seller_activation" || (rowId && document.objectPath === `${user.id}/ready/${rowId}/${document.id}`)));
}
async function ownedDocument(tx: Transaction, user: User, applicationId: string, id: string, now: Date) {
  const [document] = await tx.select().from(verificationDocuments).where(eq(verificationDocuments.id, id)).for("share");
  if (!usableDocument(user, applicationId, document, now)) unavailable("Choose a current supporting document owned by this application or your business verification.");
  return document;
}
function retainedEin(user: User, now: Date) {
  return user.einTaxId && !user.verificationEvidencePurgedAt && (!user.verificationDataPurgeAfter || user.verificationDataPurgeAfter > now)
    && EIN.test(normalizeEin(user.einTaxId)) ? normalizeEin(user.einTaxId) : null;
}
function documentReceipt(user: User, rowId: string | null, document: Document | undefined, now: Date) {
  return usableDocument(user, rowId, document, now) ? {
    id: document.id, fileName: document.fileName, reference: verificationDocumentReference(document.id),
    ready: true, expiresAt: documentDeadline(user, document),
  } : null;
}
async function dto(reader: Reader, user: User, row: SellerActivationRequest | undefined) {
  const now = new Date(), reusableId = verificationDocumentId(user.verificationDocUrl);
  const ids = [...new Set([row?.documentId, reusableId].filter((id): id is string => Boolean(id)))];
  const documents = ids.length ? await reader.select().from(verificationDocuments).where(and(eq(verificationDocuments.userId, user.id), inArray(verificationDocuments.id, ids))) : [];
  const reusable = documentReceipt(user, null, documents.find(document => document.id === reusableId), now);
  const reusableEin = retainedEin(user, now);
  const sellerAccessActive = verified(user) && user.role === "seller";
  const reason = row && outstanding(row) ? staleReason(user, row, now) : null;
  const effectiveStatus = reason ? "stale" as const : row?.status;
  const canEdit = Boolean(row && effectiveStatus === "draft" && user.active && user.role === "buyer");
  const document = row ? documentReceipt(user, row.id, documents.find(document => document.id === row.documentId), now) : null;
  const hasEin = Boolean(row && !row.evidencePurgedAt && row.purgeAfter > now && (row.einTaxId ? EIN.test(normalizeEin(row.einTaxId)) : reusableEin));
  const canSubmit = Boolean(canEdit && verified(user) && document && hasEin && row?.businessWebsite);
  const canReconcile = Boolean(row?.activationOperationId && !["complete", "cancelled"].includes(row.syncState) &&
    (!row.claimExpiresAt || row.claimExpiresAt <= now));
  const nextAction = sellerAccessActive ? "open_selling"
    : !user.active || user.role !== "buyer" ? "contact_support"
    : row?.syncState === "complete" ? "contact_support"
    : canReconcile ? "retry_activation"
    : effectiveStatus === "approved" ? "await_activation"
    : effectiveStatus === "pending" ? "await_review"
    : effectiveStatus === "stale" || effectiveStatus === "rejected" ? "replace_application"
    : !verified(user) ? "verify_business" : canSubmit ? "submit" : "prepare";
  return {
    ownerId: user.id,
    currentBusiness: {
      businessName: user.businessName, businessWebsite: user.businessWebsite, businessAddress: user.businessAddress, businessCity: user.businessCity,
      businessState: user.businessState, businessZip: user.businessZip, role: user.role, active: user.active, verified: verified(user),
    },
    sellerAccessActive,
    application: row ? {
      id: row.id, requestId: row.requestId, revision: row.revision, status: effectiveStatus!, syncState: row.syncState,
      businessWebsite: row.businessWebsite, hasEin, einLast4: hasEin ? (row.einTaxId ? normalizeEin(row.einTaxId).slice(-4) : row.einLast4 ?? reusableEin?.slice(-4) ?? null) : null,
      document, submittedAt: row.submittedAt, reviewedAt: row.reviewedAt, reviewDecision: row.reviewDecision, reviewNote: row.reviewNote,
      purgeAfter: row.purgeAfter, evidencePurgedAt: row.evidencePurgedAt, submittedRevision: row.submittedRevision, reviewedRevision: row.reviewedRevision,
      canEdit, canSubmit, canReconcile,
    } : null,
    reusableEvidence: { hasEin: Boolean(reusableEin), einLast4: reusableEin?.slice(-4) ?? null, document: reusable },
    nextAction,
  };
}

/** Read-only: merely visiting settings must not mutate an account or renew evidence. */
export async function getSellerActivation(db: Database, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });
  const [row] = await db.select().from(sellerActivationRequests).where(eq(sellerActivationRequests.userId, userId))
    .orderBy(desc(sellerActivationRequests.createdAt), desc(sellerActivationRequests.id)).limit(1);
  return dto(db, user, row);
}
export type SellerActivationView = Awaited<ReturnType<typeof getSellerActivation>>;

export async function saveSellerActivationDraft(db: Database, userId: string, value: SellerActivationDraftInput) {
  const input = sellerActivationDraftSchema.parse(value), receipt = fingerprint(input);
  return db.transaction(async tx => {
    const user = await lockUser(tx, userId), now = new Date();
    let rows = await tx.select().from(sellerActivationRequests).where(eq(sellerActivationRequests.userId, userId)).for("update");
    let row = rows.find(item => item.requestId === input.requestId);
    if (row && ((input.expectedRevision === null && row.createFingerprint === receipt) || row.lastSaveFingerprint === receipt)) return dto(tx, user, row);
    if (!user.active || user.role !== "buyer") throw new TRPCError({ code: "FORBIDDEN", message: "An active buyer account is required to start selling." });
    for (const previous of rows) {
      const reason = outstanding(previous) ? staleReason(user, previous, now) : null;
      if (reason) {
        const changed = await markStale(tx, previous, reason, now);
        rows = rows.map(item => item.id === previous.id ? changed : item);
        if (row?.id === previous.id) row = changed;
      }
    }
    if (row && (input.expectedRevision === null || row.revision !== input.expectedRevision || row.status !== "draft")) conflict();
    if (!row && (input.expectedRevision !== null || rows.some(outstanding))) conflict("Finish the existing selling application before starting another.");
    const id = row?.id ?? randomUUID();
    const documentId = input.documentId === undefined ? row?.documentId ?? null : input.documentId;
    const document = documentId ? await ownedDocument(tx, user, id, documentId, now) : null;
    const changes = {
      businessWebsite: input.businessWebsite === undefined ? row?.businessWebsite ?? null : input.businessWebsite || null,
      einTaxId: input.einTaxId === undefined ? row?.einTaxId ?? null : normalizeEin(input.einTaxId) || null,
      documentId, lastSaveFingerprint: receipt, updatedAt: now,
      purgeAfter: new Date(Math.min(row?.purgeAfter.getTime() ?? now.getTime() + 30 * DAY, document ? documentDeadline(user, document).getTime() : Infinity)),
    };
    const [saved] = row
      ? await tx.update(sellerActivationRequests).set({ ...changes, revision: row.revision + 1 }).where(eq(sellerActivationRequests.id, id)).returning()
      : await tx.insert(sellerActivationRequests).values({ ...changes, id, userId, requestId: input.requestId, createFingerprint: receipt, createdAt: now }).returning();
    return dto(tx, user, saved);
  });
}

async function receipt(tx: Transaction, row: SellerActivationRequest, phase: string, actorId: string, admin: boolean, message: string) {
  await appendAuditEvent(tx, {
    actorType: admin ? "admin" : "user", actorId, entityType: "seller_activation", entityId: row.id,
    action: `seller_activation.${phase}`, idempotencyKey: `seller-activation:${row.id}:${phase}`,
    summary: message, metadata: { revision: row.revision, policyVersion: row.policyVersion, decision: row.reviewDecision },
  });
  await tx.insert(notifications).values({ userId: row.userId, type: "system", title: "Selling application", message,
    data: { url: "/settings/selling", sellerActivationId: row.id, idempotencyKey: `seller-activation:${row.id}:${phase}` } });
}

export async function submitSellerActivation(db: Database, userId: string, value: SellerActivationSubmitInput) {
  const input = sellerActivationSubmitSchema.parse(value);
  return db.transaction(async tx => {
    const user = await lockUser(tx, userId), now = new Date();
    const [row] = await tx.select().from(sellerActivationRequests).where(and(eq(sellerActivationRequests.userId, userId), eq(sellerActivationRequests.requestId, input.requestId))).for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Save your selling application first." });
    if (row.submittedRevision === input.expectedRevision) return dto(tx, user, row);
    if (row.status !== "draft" || row.revision !== input.expectedRevision) conflict();
    if (!verified(user) || user.role !== "buyer") unavailable("Complete business verification before submitting your selling application.");
    if (staleReason(user, row, now)) unavailable("This application expired. Start a new application with current evidence.");
    if (!row.documentId) unavailable("Choose a supporting document before submitting.");
    const document = await ownedDocument(tx, user, row.id, row.documentId, now);
    const currentEin = retainedEin(user, now), suppliedEin = row.einTaxId ? normalizeEin(row.einTaxId) : null;
    if (suppliedEin && currentEin && suppliedEin !== currentEin) unavailable("This EIN differs from your approved business. Correct your business details before applying.");
    const parsed = getVerificationSubmissionSchema("seller").safeParse({
      ...identity(user), einTaxId: suppliedEin ?? currentEin ?? "", businessWebsite: row.businessWebsite ?? "",
      verificationDocUrl: verificationDocumentReference(document.id),
    });
    if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Complete your seller information." });
    const purgeAfter = new Date(Math.min(row.purgeAfter.getTime(), documentDeadline(user, document).getTime(),
      !suppliedEin && user.verificationDataPurgeAfter ? user.verificationDataPurgeAfter.getTime() : Infinity));
    if (purgeAfter <= now) unavailable("The saved business evidence expired. Supply current seller evidence.");
    const snapshot = identity(user);
    const [submitted] = await tx.update(sellerActivationRequests).set({ status: "pending", revision: row.revision + 1,
      businessWebsite: parsed.data.businessWebsite!, einTaxId: parsed.data.einTaxId, einLast4: parsed.data.einTaxId.slice(-4),
      submittedAt: now, submittedRevision: row.revision, identitySnapshot: snapshot, identityFingerprint: fingerprint(snapshot),
      submissionFingerprint: fingerprint({ snapshot, businessWebsite: parsed.data.businessWebsite, einTaxId: parsed.data.einTaxId, documentId: document.id, policyVersion: row.policyVersion }),
      sourceVerificationSubmissionId: user.verificationSubmissionId, purgeAfter, updatedAt: now,
    }).where(eq(sellerActivationRequests.id, row.id)).returning();
    await receipt(tx, submitted, "submitted", userId, false, "Your selling application is submitted. Your buying access is unchanged.");
    return dto(tx, user, submitted);
  });
}

export async function reviewSellerActivation(db: Database, reviewerId: string, value: SellerActivationReviewInput) {
  const input = sellerActivationReviewSchema.parse(value), reviewFingerprint = fingerprint({ ...input, reviewerId });
  return db.transaction(async tx => {
    const [target] = await tx.select({ userId: sellerActivationRequests.userId }).from(sellerActivationRequests).where(eq(sellerActivationRequests.id, input.id));
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Selling application not found" });
    if (target.userId === reviewerId) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot review your own selling application." });
    // Sorted user locks also keep concurrent reviewer suspension from committing a stale decision.
    const accounts = await tx.select().from(users).where(inArray(users.id, [reviewerId, target.userId])).orderBy(asc(users.id)).for("update");
    const reviewer = accounts.find(account => account.id === reviewerId), user = accounts.find(account => account.id === target.userId);
    if (!reviewer?.active || reviewer.role !== "admin" || !user) throw new TRPCError({ code: "FORBIDDEN", message: "An active administrator must review this application." });
    const row = await lockApplication(tx, user.id, input.id), now = new Date();
    if (row.reviewRequestId === input.reviewRequestId && row.reviewFingerprint === reviewFingerprint) return dto(tx, user, row);
    if (row.status !== "pending" || row.revision !== input.expectedRevision || row.reviewRequestId) conflict();
    if (staleReason(user, row, now)) unavailable("The approved business or evidence changed. Request a new application.");
    if (!row.documentId || !row.einTaxId || !EIN.test(row.einTaxId)) unavailable("Current seller evidence is required.");
    await ownedDocument(tx, user, row.id, row.documentId, now);
    const [reviewed] = await tx.update(sellerActivationRequests).set({ status: input.decision, revision: row.revision + 1,
      syncState: input.decision === "approved" ? "pending" : "none", activationOperationId: input.decision === "approved" ? randomUUID() : null,
      reviewedBy: reviewerId, reviewedAt: now, reviewRequestId: input.reviewRequestId, reviewFingerprint,
      reviewNote: input.note, reviewDecision: input.decision, reviewedRevision: row.revision, updatedAt: now,
    }).where(eq(sellerActivationRequests.id, row.id)).returning();
    await receipt(tx, reviewed, "reviewed", reviewerId, true, input.decision === "approved"
      ? "Your selling application is approved. Complete account activation in Selling settings."
      : "Your selling application needs changes. Review the decision in Selling settings.");
    return dto(tx, user, reviewed);
  });
}

/** State only. Raw fields remain until the retention sweep has resolved storage deletion. */
export async function expireSellerActivationEvidence(executor: Executor, now: Date): Promise<number> {
  const candidates = await executor.select({ id: sellerActivationRequests.id, userId: sellerActivationRequests.userId })
    .from(sellerActivationRequests).where(and(lte(sellerActivationRequests.purgeAfter, now), isNull(sellerActivationRequests.evidencePurgedAt),
      or(inArray(sellerActivationRequests.status, ["draft", "pending"]),
        and(eq(sellerActivationRequests.status, "approved"), ne(sellerActivationRequests.syncState, "complete")))))
    .orderBy(asc(sellerActivationRequests.userId), asc(sellerActivationRequests.id)).limit(100);
  let count = 0;
  for (const candidate of candidates) {
    await executor.transaction(async tx => {
      await lockUser(tx, candidate.userId);
      const row = await lockApplication(tx, candidate.userId, candidate.id);
      if (row.purgeAfter > now || row.evidencePurgedAt || !outstanding(row)) return;
      await markStale(tx, row, "evidence_expired", now);
      count++;
    });
  }
  return count;
}

type Claim = { token: string; authId: string; operationId: string; cleanup: boolean };
async function acquireClaim(db: Database, userId: string, applicationId: string): Promise<Claim | null> {
  return db.transaction(async tx => {
    const user = await lockUser(tx, userId), now = new Date();
    let row = await lockApplication(tx, userId, applicationId);
    if (["complete", "cancelled"].includes(row.syncState)) return null;
    if (!["approved", "stale"].includes(row.status) || !row.activationOperationId || row.reviewDecision !== "approved") {
      unavailable("This selling application has not been approved for activation.");
    }
    // Never steal a live claim, including when the owner's authority changed mid-call.
    if (row.claimToken && row.claimExpiresAt && row.claimExpiresAt > now) return null;
    const reason = staleReason(user, row, now);
    if (reason && row.status !== "stale") row = await markStale(tx, row, reason, now);
    if (row.status === "approved") {
      try {
        if (!row.documentId || !row.einTaxId || !EIN.test(row.einTaxId)) unavailable("Current evidence is required.");
        await ownedDocument(tx, user, row.id, row.documentId, now);
      } catch (error) {
        if (!(error instanceof TRPCError)) throw error;
        row = await markStale(tx, row, "evidence_unavailable", now);
      }
    }
    if (row.identitySnapshot?.authId !== user.authId) {
      await tx.update(sellerActivationRequests).set({ syncState: "blocked", lastErrorCode: "auth_identity_changed", updatedAt: now,
        claimToken: null, claimExpiresAt: null }).where(eq(sellerActivationRequests.id, row.id));
      return null;
    }
    const token = randomUUID();
    await tx.update(sellerActivationRequests).set({ syncState: "in_progress", claimToken: token,
      claimExpiresAt: new Date(now.getTime() + CLAIM_MS), attemptCount: row.attemptCount + 1, updatedAt: now,
    }).where(eq(sellerActivationRequests.id, row.id));
    return { token, authId: user.authId, operationId: row.activationOperationId!, cleanup: row.status === "stale" };
  });
}

async function inspectClaim(db: Database, userId: string, applicationId: string, claim: Claim) {
  return db.transaction(async tx => {
    const user = await lockUser(tx, userId), row = await lockApplication(tx, userId, applicationId), now = new Date();
    if (row.claimToken !== claim.token || !row.claimExpiresAt || row.claimExpiresAt <= now) return null;
    if (user.authId !== claim.authId || (!claim.cleanup && staleReason(user, row, now))) {
      await markStale(tx, row, "account_changed", now);
      return null;
    }
    return { role: user.role };
  });
}

async function failClaim(db: Database, userId: string, applicationId: string, claim: Claim, blocked: boolean, code: string) {
  await db.transaction(async tx => {
    await lockUser(tx, userId);
    const row = await lockApplication(tx, userId, applicationId);
    if (row.claimToken !== claim.token) return;
    await tx.update(sellerActivationRequests).set({ syncState: blocked ? "blocked" : "uncertain", claimToken: null,
      claimExpiresAt: null, lastErrorCode: code, updatedAt: new Date() }).where(eq(sellerActivationRequests.id, row.id));
  });
}

/** Durable provider receipts and current DB authority fence every activation phase. */
export async function reconcileSellerActivation(db: Database, userId: string, applicationId: string, injectedProvider?: SellerActivationRoleProvider, coordinator: RoleProviderCoordinator = withRoleProviderCoordinator) {
  return coordinator(userId, () => reconcileSellerActivationCoordinated(db, userId, applicationId, injectedProvider));
}

async function reconcileSellerActivationCoordinated(db: Database, userId: string, applicationId: string, injectedProvider?: SellerActivationRoleProvider) {
  const claim = await acquireClaim(db, userId, applicationId);
  if (!claim) return getSellerActivation(db, userId);
  try {
    const provider = injectedProvider ?? await sellerActivationRoleProvider();
    const roleSession = await openRoleProviderWriteSession(db, userId, provider);
    let external = await roleSession.read();
    if (external.id !== claim.authId) {
      await failClaim(db, userId, applicationId, claim, true, "provider_identity_mismatch");
      return getSellerActivation(db, userId);
    }
    const current = await inspectClaim(db, userId, applicationId, claim);
    if (!current) return getSellerActivation(db, userId);
    const marker = external.appMetadata.plankmarket_seller_activation;
    const ownsMarker = marker === claim.operationId;
    const hasOtherMarker = marker != null && !ownsMarker;
    const providerRole = external.appMetadata.role;
    let patch: Omit<Parameters<SellerActivationRoleProvider["patchRole"]>[1], "plankmarket_role_write"> | null = null;
    if (claim.cleanup) {
      // An unrelated provider administrator or foreign operation requires explicit review.
      if (hasOtherMarker || (providerRole !== current.role && !(ownsMarker && providerRole === "seller"))) {
        await failClaim(db, userId, applicationId, claim, true, "provider_authority_conflict");
        return getSellerActivation(db, userId);
      }
      if (ownsMarker) patch = { role: current.role, plankmarket_seller_activation: null };
    } else if (!(ownsMarker && providerRole === "seller")) {
      if (hasOtherMarker || providerRole !== "buyer") {
        await failClaim(db, userId, applicationId, claim, true, "provider_authority_conflict");
        return getSellerActivation(db, userId);
      }
      patch = { role: "seller", plankmarket_seller_activation: claim.operationId };
    }
    const expectedRole = claim.cleanup ? current.role : "seller";
    // Adopt legacy matching state with an exact receipt too. A no-marker read
    // can never bypass an older issued operation: opening the session settled it.
    external = await roleSession.ensure(patch ?? {
      role: expectedRole, plankmarket_seller_activation: claim.cleanup ? null : claim.operationId,
    }, claim.cleanup ? "seller_activation_cleanup" : "seller_activation", applicationId);
    const markerConfirmed = claim.cleanup ? external.appMetadata.plankmarket_seller_activation == null
      : external.appMetadata.plankmarket_seller_activation === claim.operationId;
    if (external.id !== claim.authId || external.appMetadata.role !== expectedRole || !markerConfirmed) {
      await failClaim(db, userId, applicationId, claim, false, "provider_confirmation_pending");
      return getSellerActivation(db, userId);
    }
    await db.transaction(async tx => {
      const user = await lockUser(tx, userId), row = await lockApplication(tx, userId, applicationId), now = new Date();
      await roleSession.assertCurrent(tx);
      if (row.claimToken !== claim.token || !row.claimExpiresAt || row.claimExpiresAt <= now) return;
      if (user.authId !== claim.authId || (claim.cleanup ? user.role !== expectedRole : staleReason(user, row, now))) {
        await markStale(tx, row, "account_changed", now);
        return;
      }
      if (claim.cleanup) {
        const [cancelled] = await tx.update(sellerActivationRequests).set({ syncState: "cancelled", claimToken: null,
          claimExpiresAt: null, lastErrorCode: null, updatedAt: now }).where(eq(sellerActivationRequests.id, row.id)).returning();
        await receipt(tx, cancelled, "cancelled", userId, false, "The previous selling application is closed. You can start a new application with your current business details.");
        return;
      }
      if (row.status !== "approved" || !row.documentId) return;
      await ownedDocument(tx, user, row.id, row.documentId, now);
      // Complete the reviewed receipt before updating the user in the SAME transaction.
      // The user authority trigger invalidates only applications that are still outstanding.
      const [activated] = await tx.update(sellerActivationRequests).set({ syncState: "complete", claimToken: null,
        claimExpiresAt: null, activatedAt: now, lastErrorCode: null, updatedAt: now }).where(eq(sellerActivationRequests.id, row.id)).returning();
      await tx.update(users).set({ role: "seller", businessWebsite: row.businessWebsite, updatedAt: now }).where(eq(users.id, userId));
      await receipt(tx, activated, "activated", userId, false, "Selling is active on your existing account. Your purchases and buying access remain available.");
    });
  } catch {
    // No exception payload or provider metadata is stored; retries always start with a read.
    await failClaim(db, userId, applicationId, claim, false, "activation_confirmation_pending");
  }
  return getSellerActivation(db, userId);
}

export async function getSellerActivationQueue(db: Database, input: { status: "pending" | "approved" | "all"; limit: number; offset: number }) {
  const rows = await db.select({ application: sellerActivationRequests, user: users }).from(sellerActivationRequests)
    .innerJoin(users, eq(users.id, sellerActivationRequests.userId))
    .where(input.status === "all" ? undefined : eq(sellerActivationRequests.status, input.status))
    .orderBy(asc(sellerActivationRequests.createdAt), asc(sellerActivationRequests.id)).limit(input.limit + 1).offset(input.offset);
  return { items: await Promise.all(rows.slice(0, input.limit).map(row => dto(db, row.user, row.application))), hasMore: rows.length > input.limit };
}

/** Only the assured administrator router exposes another account's application. */
export async function getSellerActivationForReview(db: Database, applicationId: string) {
  const [row] = await db.select({ application: sellerActivationRequests, user: users }).from(sellerActivationRequests)
    .innerJoin(users, eq(users.id, sellerActivationRequests.userId)).where(eq(sellerActivationRequests.id, applicationId));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Selling application not found" });
  return dto(db, row.user, row.application);
}
