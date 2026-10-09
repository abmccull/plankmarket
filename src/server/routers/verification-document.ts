import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, strictProtectedProcedure } from "../trpc";
import type { Database } from "../db";
import { verificationDocuments } from "../db/schema/verification-documents";
import { MAX_VERIFICATION_BYTES, VERIFICATION_MIME_TYPES, verificationDocumentReference } from "@/lib/verification-documents";
import { privateVerificationStorage, validateVerificationBytes, assertVerificationUploadAccount } from "@/server/services/verification-documents";
import { lockEditableSellerActivationUpload, sellerActivationUploadOrigin } from "@/server/services/seller-activation-evidence";

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
type Document = typeof verificationDocuments.$inferSelect;

async function completeDocument(executor: Executor, row: Document, frozenPath: string) {
  if (row.deletionRequestedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });
  if (row.readyAt) {
    if (row.objectPath !== frozenPath) throw new TRPCError({ code: "CONFLICT", message: "Document changed; upload a new document" });
    return { reference: verificationDocumentReference(row.id), fileName: row.fileName };
  }
  if (Date.now() - row.createdAt.getTime() > 2 * 60 * 60 * 1000) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Upload expired. Choose your document again." });
  }
  const storage = await privateVerificationStorage();
  const { data, error } = await storage.download(row.objectPath);
  if (error || !data) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload is incomplete. Try again." });
  try { validateVerificationBytes(new Uint8Array(await data.arrayBuffer()), row.fileSize, row.mimeType); }
  catch (error) {
    await storage.remove([row.objectPath]);
    throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid document" });
  }
  // Freeze a validated copy outside the signed upload token path.
  const copied = await storage.copy(row.objectPath, frozenPath);
  if (copied.error) {
    const retry = await executor.query.verificationDocuments.findFirst({ where: and(eq(verificationDocuments.id, row.id), eq(verificationDocuments.userId, row.userId), isNull(verificationDocuments.deletedAt), isNull(verificationDocuments.deletionRequestedAt)) });
    if (retry?.readyAt && retry.objectPath === frozenPath) return { reference: verificationDocumentReference(row.id), fileName: row.fileName };
    const existing = await storage.download(frozenPath);
    if (existing.error || !existing.data) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Could not finalize document. Try again." });
    const original = Buffer.from(await data.arrayBuffer());
    if (!original.equals(Buffer.from(await existing.data.arrayBuffer()))) throw new TRPCError({ code: "CONFLICT", message: "Document changed; upload a new document" });
  }
  const [completed] = await executor.update(verificationDocuments).set({ objectPath: frozenPath, readyAt: new Date() })
    .where(and(eq(verificationDocuments.id, row.id), eq(verificationDocuments.userId, row.userId), eq(verificationDocuments.objectPath, row.objectPath), isNull(verificationDocuments.readyAt), isNull(verificationDocuments.deletedAt), isNull(verificationDocuments.deletionRequestedAt)))
    .returning({ id: verificationDocuments.id });
  if (!completed) {
    const retry = await executor.query.verificationDocuments.findFirst({ where: and(eq(verificationDocuments.id, row.id), eq(verificationDocuments.userId, row.userId), eq(verificationDocuments.objectPath, frozenPath), isNull(verificationDocuments.deletedAt), isNull(verificationDocuments.deletionRequestedAt)) });
    if (!retry?.readyAt) throw new TRPCError({ code: "CONFLICT", message: "Document changed; upload a new document" });
  }
  await storage.remove([row.objectPath]);
  return { reference: verificationDocumentReference(row.id), fileName: row.fileName };
}

export const verificationDocumentRouter = createTRPCRouter({
  prepare: strictProtectedProcedure.input(z.object({ purpose: z.enum(["business_verification", "resale_certificate", "seller_activation"]).default("business_verification"), fileName: z.string().min(1).max(255), fileSize: z.number().int().positive().max(MAX_VERIFICATION_BYTES), mimeType: z.enum(VERIFICATION_MIME_TYPES) })).mutation(async ({ ctx, input }) => {
    assertVerificationUploadAccount(ctx.user, input.purpose);
    const id = randomUUID();
    async function insert(executor: Executor, path: string) {
      const [count] = await executor.select({ count: sql<number>`count(*)::int` }).from(verificationDocuments).where(and(eq(verificationDocuments.userId, ctx.user.id), isNull(verificationDocuments.deletedAt), sql`${verificationDocuments.createdAt} > now() - interval '1 day'`));
      if (count.count >= 20) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Daily document upload limit reached" });
      await executor.insert(verificationDocuments).values({ id, userId: ctx.user.id, objectPath: path, ...input });
      return path;
    }
    // Do not issue a signed URL before the current owned draft has passed the database guard.
    const path = input.purpose === "seller_activation"
      ? await ctx.db.transaction(async tx => {
          const applicationId = await lockEditableSellerActivationUpload(tx, ctx.user.id);
          return insert(tx, `${ctx.user.id}/incoming/${applicationId}/${id}`);
        })
      : await insert(ctx.db, `${ctx.user.id}/incoming/${id}`);
    const storage = await privateVerificationStorage();
    const { data, error } = await storage.createSignedUploadUrl(path, { upsert: false });
    if (error || !data) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Could not prepare a secure upload. Try again." });
    return { id, path, token: data.token };
  }),
  complete: strictProtectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const row = await ctx.db.query.verificationDocuments.findFirst({ where: and(eq(verificationDocuments.id, input.id), eq(verificationDocuments.userId, ctx.user.id), isNull(verificationDocuments.deletedAt), isNull(verificationDocuments.deletionRequestedAt)) });
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });
    assertVerificationUploadAccount(ctx.user, row.purpose);
    if (row.purpose !== "seller_activation") return completeDocument(ctx.db, row, `${ctx.user.id}/ready/${row.id}`);
    const applicationId = sellerActivationUploadOrigin(row);
    return ctx.db.transaction(async tx => {
      // Recheck the original application even for a previously-ready completion receipt.
      await lockEditableSellerActivationUpload(tx, ctx.user.id, applicationId);
      const [locked] = await tx.select().from(verificationDocuments)
        .where(and(eq(verificationDocuments.id, row.id), eq(verificationDocuments.userId, ctx.user.id), eq(verificationDocuments.purpose, "seller_activation"), isNull(verificationDocuments.deletedAt), isNull(verificationDocuments.deletionRequestedAt)))
        .for("update");
      if (!locked || sellerActivationUploadOrigin(locked) !== applicationId) throw new TRPCError({ code: "CONFLICT", message: "Document changed; upload a new document" });
      return completeDocument(tx, locked, `${ctx.user.id}/ready/${applicationId}/${row.id}`);
    });
  }),
});
