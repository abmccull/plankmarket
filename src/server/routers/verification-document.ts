import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, strictProtectedProcedure } from "../trpc";
import { verificationDocuments } from "../db/schema/verification-documents";
import { MAX_VERIFICATION_BYTES, VERIFICATION_MIME_TYPES, verificationDocumentReference } from "@/lib/verification-documents";
import { privateVerificationStorage, validateVerificationBytes, assertVerificationUploadAccount } from "@/server/services/verification-documents";
export const verificationDocumentRouter = createTRPCRouter({
  prepare: strictProtectedProcedure.input(z.object({fileName:z.string().min(1).max(255),fileSize:z.number().int().positive().max(MAX_VERIFICATION_BYTES),mimeType:z.enum(VERIFICATION_MIME_TYPES)})).mutation(async ({ctx,input}) => {
    assertVerificationUploadAccount(ctx.user);
    const storage = await privateVerificationStorage();
    // Cap abandoned uploads per account; strict rate limiting also applies.
    const [count] = await ctx.db.select({count:sql<number>`count(*)::int`}).from(verificationDocuments).where(and(eq(verificationDocuments.userId,ctx.user.id),isNull(verificationDocuments.deletedAt),sql`${verificationDocuments.createdAt} > now() - interval '1 day'`));
    if (count.count >= 20) throw new TRPCError({code:"TOO_MANY_REQUESTS",message:"Daily document upload limit reached"});
    const id = randomUUID();
    const path = `${ctx.user.id}/incoming/${id}`;
    await ctx.db.insert(verificationDocuments).values({id,userId:ctx.user.id,objectPath:path,...input});
    const {data,error} = await storage.createSignedUploadUrl(path,{upsert:false});
    if (error || !data) throw new TRPCError({code:"SERVICE_UNAVAILABLE",message:"Could not prepare a secure upload. Try again."});
    return {id,path,token:data.token};
  }),
  complete: strictProtectedProcedure.input(z.object({id:z.string().uuid()})).mutation(async ({ctx,input}) => {
    assertVerificationUploadAccount(ctx.user);
    const row = await ctx.db.query.verificationDocuments.findFirst({where:and(eq(verificationDocuments.id,input.id),eq(verificationDocuments.userId,ctx.user.id),isNull(verificationDocuments.deletedAt))});
    if (!row) throw new TRPCError({code:"NOT_FOUND",message:"Upload not found"});
    if (row.readyAt) return {reference:verificationDocumentReference(row.id),fileName:row.fileName};
    if (Date.now()-row.createdAt.getTime()>2*60*60*1000) throw new TRPCError({code:"BAD_REQUEST",message:"Upload expired. Choose your document again."});
    const storage = await privateVerificationStorage();
    const {data,error} = await storage.download(row.objectPath);
    if (error || !data) throw new TRPCError({code:"BAD_REQUEST",message:"Upload is incomplete. Try again."});
    try { validateVerificationBytes(new Uint8Array(await data.arrayBuffer()),row.fileSize,row.mimeType); }
    catch (error) { await storage.remove([row.objectPath]); throw new TRPCError({code:"BAD_REQUEST",message:error instanceof Error?error.message:"Invalid document"}); }
    // Freeze a validated copy outside the signed upload token path.
    const frozenPath = `${ctx.user.id}/ready/${row.id}`;
    const copied = await storage.copy(row.objectPath,frozenPath);
    if (copied.error) {
      const retry = await ctx.db.query.verificationDocuments.findFirst({where:eq(verificationDocuments.id,row.id)});
      if (retry?.readyAt) return {reference:verificationDocumentReference(row.id),fileName:row.fileName};
      // Crash recovery: compare the already-created destination before adoption.
      const existing = await storage.download(frozenPath);
      if (existing.error || !existing.data) throw new TRPCError({code:"SERVICE_UNAVAILABLE",message:"Could not finalize document. Try again."});
      const original = Buffer.from(await data.arrayBuffer());
      if (!original.equals(Buffer.from(await existing.data.arrayBuffer()))) throw new TRPCError({code:"CONFLICT",message:"Document changed; upload a new document"});
    }
    await ctx.db.update(verificationDocuments).set({objectPath:frozenPath,readyAt:new Date()}).where(and(eq(verificationDocuments.id,row.id),isNull(verificationDocuments.readyAt),isNull(verificationDocuments.deletedAt)));
    await storage.remove([row.objectPath]);
    return {reference:verificationDocumentReference(row.id),fileName:row.fileName};
  }),
});
