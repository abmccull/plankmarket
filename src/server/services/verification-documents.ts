import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db, type Database } from "@/server/db";
import { verificationDocuments } from "@/server/db/schema/verification-documents";
import { createServiceClient } from "@/lib/supabase/server";
import { VERIFICATION_BUCKET, MAX_VERIFICATION_BYTES, VERIFICATION_MIME_TYPES, verificationDocumentId, verificationDocumentReference } from "@/lib/verification-documents";
import { detectEvidenceMimeType } from "@/server/security/evidence-files";
import { sellerActivationUploadOrigin } from "./seller-activation-evidence";
export function assertVerificationUploadAccount(user:{role:string;verificationStatus:string;active?:boolean}, purpose = "business_verification") {
  if (purpose === "seller_activation") {
    if (user.role === "buyer" && user.active === true) return;
    throw new TRPCError({code:"FORBIDDEN",message:"Selling setup is unavailable for this account."});
  }
  if (purpose === "resale_certificate" && ["buyer", "seller"].includes(user.role)) return;
  if (!["buyer","seller"].includes(user.role) || !["unverified","rejected"].includes(user.verificationStatus)) throw new TRPCError({code:"FORBIDDEN",message:"This verification cannot be edited"});
}
export function validateVerificationBytes(bytes: Uint8Array, expectedSize: number, expectedType: string) {
  if (!bytes.length || bytes.length !== expectedSize || bytes.length > MAX_VERIFICATION_BYTES) throw new Error("Document size does not match the upload request");
  const detected = detectEvidenceMimeType(bytes);
  if (!detected || !(VERIFICATION_MIME_TYPES as readonly string[]).includes(detected) || detected !== expectedType) throw new Error("Document must contain the selected PDF, JPEG or PNG format");
}
const PRIVATE_STORAGE_TIMEOUT_MS = 8_000;
export async function privateVerificationStorage(options: { deadlineAt?: number } = {}) {
  if (options.deadlineAt !== undefined && !Number.isFinite(options.deadlineAt)) throw new Error("Invalid private storage deadline");
  const startedAt = Date.now();
  const timeoutMs = Math.max(0, Math.min(PRIVATE_STORAGE_TIMEOUT_MS, (options.deadlineAt ?? (startedAt + PRIVATE_STORAGE_TIMEOUT_MS)) - startedAt));
  const expiresAt = startedAt + timeoutMs;
  const timeoutError = new TRPCError({
    code: "TIMEOUT",
    message: "Private document storage did not respond in time. Try again.",
  });
  let expired = false;
  const deadline = new Promise<never>((_resolve, reject) => {
    const timer = setTimeout(() => {
      expired = true;
      reject(timeoutError);
    }, timeoutMs);
    timer.unref?.();
  });
  // The facade can become unused before its deadline; keep that rejection handled.
  void deadline.catch(() => {});
  const assertWithinDeadline = () => {
    if (expired || Date.now() >= expiresAt) throw timeoutError;
  };
  async function run<T>(operation: () => PromiseLike<T>): Promise<T> {
    assertWithinDeadline();
    const result = await Promise.race([
      Promise.resolve().then(() => {
        assertWithinDeadline();
        return operation();
      }),
      deadline,
    ]);
    assertWithinDeadline();
    return result;
  }
  const client = await run(() => createServiceClient({ requestTimeoutMs: Math.max(1, timeoutMs) }));
  const { data, error } = await run(() => client.storage.getBucket(VERIFICATION_BUCKET));
  if (error || !data || data.public || !data.file_size_limit || Number(data.file_size_limit) > MAX_VERIFICATION_BYTES) throw new TRPCError({code:"PRECONDITION_FAILED",message:"Private verification storage is not configured. Contact support."});
  const storage = client.storage.from(VERIFICATION_BUCKET);
  return {
    createSignedUploadUrl: (...args: Parameters<typeof storage.createSignedUploadUrl>) => run(() => storage.createSignedUploadUrl(...args)),
    copy: (...args: Parameters<typeof storage.copy>) => run(() => storage.copy(...args)),
    async download(...args: Parameters<typeof storage.download>) {
      const result = await run(() => storage.download(...args));
      if (result.error || !result.data) return result;
      const body = result.data;
      if (body.size > MAX_VERIFICATION_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "Document exceeds the upload size limit." });
      const bytes = await run(() => body.arrayBuffer());
      if (bytes.byteLength > MAX_VERIFICATION_BYTES) throw new TRPCError({ code: "BAD_REQUEST", message: "Document exceeds the upload size limit." });
      return { ...result, data: new Blob([bytes], { type: body.type }) };
    },
    async remove(...args: Parameters<typeof storage.remove>) {
      try {
        return await run(() => storage.remove(...args));
      } catch (error) {
        if (error !== timeoutError) throw error;
        // Timeout is an unknown remote outcome. Retention keeps its retry record;
        // best-effort incoming cleanup must not roll back a confirmed ready copy.
        return { data: null, error: timeoutError };
      }
    },
  };
}
/** Delete every deterministic path before declaring private evidence removed. */
export function verificationDocumentObjectPaths(row: { id: string; userId: string; objectPath: string; purpose: string }): string[] {
  const origin = row.purpose === "seller_activation" ? `${sellerActivationUploadOrigin(row)}/` : "";
  return [...new Set([row.objectPath, `${row.userId}/ready/${origin}${row.id}`, `${row.userId}/incoming/${origin}${row.id}`])];
}
export function assertOwnedVerificationMetadata(row: {userId:string;readyAt:Date|null;deletedAt:Date|null;deletionRequestedAt?:Date|null}|null|undefined, userId:string) {
  if (!row || row.userId !== userId || !row.readyAt || row.deletedAt || row.deletionRequestedAt) throw new TRPCError({code:"FORBIDDEN",message:"Document is unavailable or does not belong to this account"});
}
export async function requireOwnedVerificationDocument(reference: string, userId: string, executor: Pick<Database, "query"> = db) {
  const id = verificationDocumentId(reference);
  if (!id) throw new TRPCError({code:"BAD_REQUEST",message:"Upload your supporting document before submitting"});
  const row = await executor.query.verificationDocuments.findFirst({where:and(eq(verificationDocuments.id,id),eq(verificationDocuments.userId,userId),isNull(verificationDocuments.deletedAt),isNull(verificationDocuments.deletionRequestedAt))});
  assertOwnedVerificationMetadata(row,userId);
  return row!;
}
// Internal consumer only. HTTP callers must authorize ownership/admin assurance first.
export async function readPrivateVerificationDocument(reference: string) {
  const id = verificationDocumentId(reference);
  if (!id) throw new Error("Invalid document reference");
  const row = await db.query.verificationDocuments.findFirst({where:and(eq(verificationDocuments.id,id),isNull(verificationDocuments.deletedAt),isNull(verificationDocuments.deletionRequestedAt))});
  if (!row?.readyAt) throw new Error("Document is unavailable");
  const storage = await privateVerificationStorage();
  const { data, error } = await storage.download(row.objectPath);
  if (error || !data) throw new Error("Document could not be loaded");
  return { row, data };
}
export type PrivateDocumentDeletion = "deleted" | "retained";
type PrivateDocument = typeof verificationDocuments.$inferSelect;
/** Intent is committed before this boundary; a late provider response cannot reopen attachment. */
async function removeRequestedVerificationDocument(row: PrivateDocument) {
  if (!row.deletionRequestedAt) throw new Error("Private document deletion was not requested");
  const storage = await privateVerificationStorage();
  const { error } = await storage.remove(verificationDocumentObjectPaths(row));
  if (error) throw new Error("Private document removal failed");
  await db.update(verificationDocuments).set({ deletedAt: sql`clock_timestamp()` }).where(and(
    eq(verificationDocuments.id, row.id),
    sql`${verificationDocuments.deletionRequestedAt} is not null`,
    isNull(verificationDocuments.deletedAt),
  ));
}
/** Only the retention sweep may allow references already due and explicitly expired. */
export async function deletePrivateVerificationDocument(reference: string, due?: { now: Date }): Promise<PrivateDocumentDeletion> {
  const id = verificationDocumentId(reference);
  if (!id) throw new Error("Invalid document reference");
  const deadline = (due?.now ?? new Date()).toISOString();
  const canonicalReference = verificationDocumentReference(id);
  const intent = await db.transaction(async tx => {
    const [row] = await tx.select().from(verificationDocuments).where(eq(verificationDocuments.id, id)).for("update");
    if (!row || row.deletedAt) return { outcome: "deleted" as const };
    // Attachment and refresh guards share this lock. No reverse user/application
    // lock is taken, and no provider request is made until this transaction commits.
    const retained = await tx.execute(sql`select
      exists(select 1 from public.resale_certificates where document_id=${id}::uuid)
      or exists(select 1 from public.users where lower(verification_doc_url)=${canonicalReference}
        and (${!due} or verification_data_purge_after is null or verification_data_purge_after > ${deadline}::timestamptz or verification_data_purge_after > now()))
      or exists(select 1 from public.verification_drafts where lower(verification_doc_url)=${canonicalReference}
        and (${!due} or purge_after is null or purge_after > ${deadline}::timestamptz or purge_after > now()))
      or exists(select 1 from public.seller_activation_requests where document_id=${id}::uuid
        and (${!due} or purge_after > ${deadline}::timestamptz or purge_after > now()
          or not (status in ('stale','rejected') or (status='approved' and sync_state='complete')))) as referenced`);
    if (Boolean(retained[0]?.referenced)) return { outcome: "retained" as const };
    if (row.deletionRequestedAt) return { outcome: "requested" as const, document: row };
    const [requested] = await tx.update(verificationDocuments).set({ deletionRequestedAt: sql`clock_timestamp()` })
      .where(eq(verificationDocuments.id, row.id)).returning();
    if (!requested) throw new Error("Private document deletion request was not saved");
    return { outcome: "requested" as const, document: requested };
  });
  if (intent.outcome !== "requested") return intent.outcome;
  await removeRequestedVerificationDocument(intent.document);
  return "deleted";
}
export function canPurgeAbandonedDocument(row:{createdAt:Date;readyAt:Date|null;referenced:boolean},now:Date) {
  return !row.referenced && now.getTime()-row.createdAt.getTime() >= (row.readyAt?7:1)*24*60*60*1000;
}
/** Bounded orphan sweep. Each durable intent commits before external storage I/O. */
export async function purgeAbandonedVerificationDocuments(now=new Date()) {
  const candidates=await db.select({id:verificationDocuments.id}).from(verificationDocuments).where(and(isNull(verificationDocuments.deletedAt),or(sql`${verificationDocuments.deletionRequestedAt} is not null`,and(lt(verificationDocuments.createdAt,new Date(now.getTime()-86400000)),or(isNull(verificationDocuments.readyAt),lt(verificationDocuments.createdAt,new Date(now.getTime()-7*86400000))))),sql`not exists(select 1 from public.users where lower(verification_doc_url)='verification-document:' || ${verificationDocuments.id}::text) and not exists(select 1 from public.verification_drafts where lower(verification_doc_url)='verification-document:' || ${verificationDocuments.id}::text) and not exists(select 1 from public.resale_certificates where document_id=${verificationDocuments.id}) and not exists(select 1 from public.seller_activation_requests where document_id=${verificationDocuments.id})`)).limit(50);
  let deleted=0;
  for(const candidate of candidates) {
    const requested = await db.transaction(async tx=>{
      const [row]=await tx.select().from(verificationDocuments).where(eq(verificationDocuments.id,candidate.id)).for("update");
      if(!row || row.deletedAt) return null;
      const reference=verificationDocumentReference(row.id);
      const result=await tx.execute(sql`select exists(select 1 from public.users where lower(verification_doc_url)=${reference}) or exists(select 1 from public.verification_drafts where lower(verification_doc_url)=${reference}) or exists(select 1 from public.resale_certificates where document_id=${row.id}::uuid) or exists(select 1 from public.seller_activation_requests where document_id=${row.id}::uuid) as referenced`);
      const referenced=Boolean(result[0]?.referenced);
      if(referenced || (!row.deletionRequestedAt && !canPurgeAbandonedDocument({...row,referenced},now))) return null;
      if (row.deletionRequestedAt) return row;
      const [intent] = await tx.update(verificationDocuments).set({ deletionRequestedAt: sql`clock_timestamp()` })
        .where(eq(verificationDocuments.id, row.id)).returning();
      if (!intent) throw new Error("Private document deletion request was not saved");
      return intent;
    });
    if (!requested) continue;
    await removeRequestedVerificationDocument(requested);
    deleted++;
  }
  return deleted;
}
