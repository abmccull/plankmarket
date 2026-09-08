import { and, eq, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "@/server/db";
import { verificationDocuments } from "@/server/db/schema/verification-documents";
import { createServiceClient } from "@/lib/supabase/server";
import { VERIFICATION_BUCKET, MAX_VERIFICATION_BYTES, VERIFICATION_MIME_TYPES, verificationDocumentId } from "@/lib/verification-documents";
import { detectEvidenceMimeType } from "@/server/security/evidence-files";
export function assertVerificationUploadAccount(user:{role:string;verificationStatus:string}) {
  if (!["buyer","seller"].includes(user.role) || !["unverified","rejected"].includes(user.verificationStatus)) throw new TRPCError({code:"FORBIDDEN",message:"This verification cannot be edited"});
}
export function validateVerificationBytes(bytes: Uint8Array, expectedSize: number, expectedType: string) {
  if (!bytes.length || bytes.length !== expectedSize || bytes.length > MAX_VERIFICATION_BYTES) throw new Error("Document size does not match the upload request");
  const detected = detectEvidenceMimeType(bytes);
  if (!detected || !(VERIFICATION_MIME_TYPES as readonly string[]).includes(detected) || detected !== expectedType) throw new Error("Document must contain the selected PDF, JPEG or PNG format");
}
export async function privateVerificationStorage() {
  const client = await createServiceClient();
  const { data, error } = await client.storage.getBucket(VERIFICATION_BUCKET);
  if (error || !data || data.public || !data.file_size_limit || Number(data.file_size_limit) > MAX_VERIFICATION_BYTES) throw new TRPCError({code:"PRECONDITION_FAILED",message:"Private verification storage is not configured. Contact support."});
  return client.storage.from(VERIFICATION_BUCKET);
}
export function assertOwnedVerificationMetadata(row: {userId:string;readyAt:Date|null;deletedAt:Date|null}|null|undefined, userId:string) {
  if (!row || row.userId !== userId || !row.readyAt || row.deletedAt) throw new TRPCError({code:"FORBIDDEN",message:"Document is unavailable or does not belong to this account"});
}
export async function requireOwnedVerificationDocument(reference: string, userId: string) {
  const id = verificationDocumentId(reference);
  if (!id) throw new TRPCError({code:"BAD_REQUEST",message:"Upload your supporting document before submitting"});
  const row = await db.query.verificationDocuments.findFirst({where:and(eq(verificationDocuments.id,id),eq(verificationDocuments.userId,userId),isNull(verificationDocuments.deletedAt))});
  assertOwnedVerificationMetadata(row,userId);
  return row!;
}
// Internal consumer only. HTTP callers must authorize ownership/admin assurance first.
export async function readPrivateVerificationDocument(reference: string) {
  const id = verificationDocumentId(reference);
  if (!id) throw new Error("Invalid document reference");
  const row = await db.query.verificationDocuments.findFirst({where:and(eq(verificationDocuments.id,id),isNull(verificationDocuments.deletedAt))});
  if (!row?.readyAt) throw new Error("Document is unavailable");
  const storage = await privateVerificationStorage();
  const { data, error } = await storage.download(row.objectPath);
  if (error || !data) throw new Error("Document could not be loaded");
  return { row, data };
}
export async function deletePrivateVerificationDocument(reference: string) {
  const id=verificationDocumentId(reference);
  if (!id) throw new Error("Invalid document reference");
  await db.transaction(async tx=>{
    const [row]=await tx.select().from(verificationDocuments).where(eq(verificationDocuments.id,id)).for("update");
    if (!row || row.deletedAt) return;
    const storage=await privateVerificationStorage();
    const {error}=await storage.remove([row.objectPath]);
    if(error) throw new Error("Private document removal failed");
    await tx.update(verificationDocuments).set({deletedAt:new Date()}).where(eq(verificationDocuments.id,id));
  });
}
export function canPurgeAbandonedDocument(row:{createdAt:Date;readyAt:Date|null;referenced:boolean},now:Date) {
  return !row.referenced && now.getTime()-row.createdAt.getTime() >= (row.readyAt?7:1)*24*60*60*1000;
}
/** Bounded orphan sweep. Attachment triggers serialize against each document lock. */
export async function purgeAbandonedVerificationDocuments(now=new Date()) {
  const candidates=await db.select({id:verificationDocuments.id}).from(verificationDocuments).where(and(isNull(verificationDocuments.deletedAt),sql`${verificationDocuments.createdAt} < ${new Date(now.getTime()-86400000)}`,sql`(${verificationDocuments.readyAt} is null or ${verificationDocuments.createdAt} < ${new Date(now.getTime()-7*86400000)})`,sql`not exists(select 1 from public.users where verification_doc_url='verification-document:' || ${verificationDocuments.id}::text) and not exists(select 1 from public.verification_drafts where verification_doc_url='verification-document:' || ${verificationDocuments.id}::text)`)).limit(50);
  let deleted=0;
  for(const candidate of candidates) {
    await db.transaction(async tx=>{
      const [row]=await tx.select().from(verificationDocuments).where(eq(verificationDocuments.id,candidate.id)).for("update");
      if(!row || row.deletedAt) return;
      const reference=`verification-document:${row.id}`;
      const result=await tx.execute(sql`select exists(select 1 from public.users where verification_doc_url=${reference}) or exists(select 1 from public.verification_drafts where verification_doc_url=${reference}) as referenced`);
      const referenced=Boolean(result[0]?.referenced);
      if(!canPurgeAbandonedDocument({...row,referenced},now)) return;
      const storage=await privateVerificationStorage();
      const {error}=await storage.remove([row.objectPath,`${row.userId}/ready/${row.id}`,`${row.userId}/incoming/${row.id}`]);
      if(error) throw new Error("Abandoned verification document removal failed");
      await tx.update(verificationDocuments).set({deletedAt:now}).where(eq(verificationDocuments.id,row.id));
      deleted++;
    });
  }
  return deleted;
}
