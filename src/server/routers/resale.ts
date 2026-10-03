import { createHash } from "node:crypto";
import { z } from "zod";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, strictProtectedProcedure, adminProcedure, strictAdminProcedure } from "../trpc";
import { auditEvents, resaleCertificates, resaleRules, users, verificationDocuments } from "../db/schema";
import { resaleSubmissionSchema, resaleReviewSchema, resaleRuleSchema, resaleStateSchema } from "@/lib/validators/resale";
import { RESALE_ATTESTATION, TEXAS_RESALE_STATEMENT } from "@/lib/resale-exemption";
import { buyerIdentityFingerprint, resolveCheckoutResale } from "../services/resale-exemption";

export const resaleRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => ({
    certificates: await ctx.db.select().from(resaleCertificates).where(eq(resaleCertificates.buyerId, ctx.user.id)).orderBy(desc(resaleCertificates.createdAt)),
    rules: await ctx.db.select({ state: resaleRules.state, revision: resaleRules.revision, recipientName: resaleRules.recipientName, recipientAddress: resaleRules.recipientAddress, electronicTexas: resaleRules.electronicTexas }).from(resaleRules).where(eq(resaleRules.enabled, true)).orderBy(asc(resaleRules.state)),
  })),
  eligibility: protectedProcedure.input(z.object({ state: resaleStateSchema })).query(async ({ ctx, input }) => {
    const decision = await ctx.db.transaction(tx => resolveCheckoutResale(tx, { buyerId: ctx.user.id, state: input.state, purpose: "resale" }));
    return { applied: decision.applied, reason: decision.reason, certificateId: decision.certificateId };
  }),
  submit: strictProtectedProcedure.input(resaleSubmissionSchema).mutation(async ({ ctx, input }) => ctx.db.transaction(async tx => {
    if (!["buyer", "seller"].includes(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN" });
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`resale:${ctx.user.id}`}, 0))`);
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const [existing] = await tx.select().from(resaleCertificates).where(and(eq(resaleCertificates.buyerId, ctx.user.id), eq(resaleCertificates.requestId, input.requestId)));
    if (existing) {
      if (existing.inputFingerprint !== fingerprint) throw new TRPCError({ code: "CONFLICT", message: "This submission was already saved with different details. Refresh to start another certificate." });
      return existing;
    }
    const [buyer] = await tx.select().from(users).where(eq(users.id, ctx.user.id)).for("share");
    const [rule] = await tx.select().from(resaleRules).where(eq(resaleRules.state, input.state)).for("share");
    if (!rule?.enabled || rule.revision !== input.ruleRevision) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Resale setup changed for this state. Refresh before submitting." });
    if (input.format === "texas_electronic" && !rule.electronicTexas) throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a completed certificate for this state." });
    const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(resaleCertificates).where(and(eq(resaleCertificates.buyerId, ctx.user.id), sql`${resaleCertificates.createdAt} > now() - interval '1 day'`));
    if (count.count >= 10) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Daily certificate limit reached. Contact support if you need help." });
    if (input.documentId) {
      const [document] = await tx.select().from(verificationDocuments).where(eq(verificationDocuments.id, input.documentId)).for("share");
      if (!document || document.userId !== ctx.user.id || document.purpose !== "resale_certificate" || !document.readyAt || document.deletedAt || document.deletionRequestedAt) throw new TRPCError({ code: "FORBIDDEN", message: "Upload a completed certificate using this account." });
    }
    const now = new Date();
    const [certificate] = await tx.insert(resaleCertificates).values({ buyerId: ctx.user.id, requestId: input.requestId, inputFingerprint: fingerprint, state: input.state, ruleRevision: rule.revision, format: input.format, documentId: input.documentId, buyerIdentityFingerprint: buyerIdentityFingerprint(buyer), data: {
      legalName: input.legalName, address: input.address, city: input.city, state: input.businessState, zip: input.zip, phone: input.phone, permitNumber: input.permitNumber, permitState: input.permitState,
      businessDescription: input.businessDescription, itemsDescription: input.itemsDescription, signerName: input.signerName, signerTitle: input.signerTitle,
      signedAt: now.toISOString(), attestation: RESALE_ATTESTATION, ...(input.format === "texas_electronic" ? { texasStatement: TEXAS_RESALE_STATEMENT } : {}), recipientName: rule.recipientName, recipientAddress: rule.recipientAddress,
    } }).returning();
    await tx.insert(auditEvents).values({ actorType: "user", actorId: ctx.user.id, action: "resale.submitted", entityType: "resale_certificate", entityId: certificate.id, summary: "Buyer submitted a signed resale declaration", metadata: { state: input.state, ruleRevision: rule.revision, format: input.format, inputFingerprint: fingerprint } });
    return certificate;
  })),
  queue: adminProcedure.input(z.object({ view: z.enum(["exceptions", "all"]).default("exceptions"), page: z.number().int().nonnegative().default(0) })).query(async ({ ctx, input }) => {
    const rows = await ctx.db.select({ certificate: resaleCertificates, businessName: users.businessName, currentIdentity: { businessName: users.businessName, businessAddress: users.businessAddress, businessCity: users.businessCity, businessState: users.businessState, businessZip: users.businessZip } }).from(resaleCertificates).innerJoin(users, eq(users.id, resaleCertificates.buyerId)).leftJoin(resaleRules, eq(resaleRules.state, resaleCertificates.state)).where(input.view === "exceptions" ? sql`${resaleCertificates.status} = 'pending' or (${resaleCertificates.status} = 'approved' and (${resaleCertificates.expiresAt} <= now() + interval '30 days' or ${resaleCertificates.ruleRevision} <> ${resaleRules.revision} or not ${resaleRules.enabled}))` : undefined).orderBy(asc(resaleCertificates.createdAt)).limit(51).offset(input.page * 50);
    return { items: rows.slice(0, 50).map(({ currentIdentity, ...row }) => ({ ...row, identityChanged: buyerIdentityFingerprint(currentIdentity) !== row.certificate.buyerIdentityFingerprint })), hasMore: rows.length > 50 };
  }),
  rules: adminProcedure.query(({ ctx }) => ctx.db.select().from(resaleRules).orderBy(asc(resaleRules.state))),
  saveRule: strictAdminProcedure.input(resaleRuleSchema).mutation(async ({ ctx, input }) => ctx.db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`resale-rule:${input.state}`}, 0))`);
    const [before] = await tx.select().from(resaleRules).where(eq(resaleRules.state, input.state)).for("update");
    if ((before?.revision ?? 0) !== input.expectedRevision) throw new TRPCError({ code: "CONFLICT", message: "Another reviewer changed this rule. Refresh first." });
    const { expectedRevision, ...values } = input;
    const data = { ...values, revision: expectedRevision + 1, updatedBy: ctx.user.id, updatedAt: new Date() };
    const [after] = before ? await tx.update(resaleRules).set(data).where(eq(resaleRules.state, input.state)).returning() : await tx.insert(resaleRules).values(data).returning();
    await tx.insert(auditEvents).values({ actorType: "admin", actorId: ctx.user.id, action: "resale.rule_changed", entityType: "resale_rule", entityId: input.state, summary: "Resale jurisdiction rule updated; existing certificates require review under this revision", metadata: { before: before ?? null, after } });
    return after;
  })),
  review: strictAdminProcedure.input(resaleReviewSchema).mutation(async ({ ctx, input }) => ctx.db.transaction(async tx => {
    const [initial] = await tx.select().from(resaleCertificates).where(eq(resaleCertificates.id, input.id));
    if (!initial) throw new TRPCError({ code: "NOT_FOUND" });
    if (initial.buyerId === ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot review your own certificate." });
    const [buyer] = await tx.select().from(users).where(eq(users.id, initial.buyerId)).for("share");
    const [rule] = await tx.select().from(resaleRules).where(eq(resaleRules.state, initial.state)).for("share");
    const [before] = await tx.select().from(resaleCertificates).where(eq(resaleCertificates.id, input.id)).for("update");
    if (before.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new TRPCError({ code: "CONFLICT", message: "This certificate changed. Refresh before reviewing." });
    if (input.status === "approved" && (!rule?.enabled || before.status === "revoked" || before.buyerIdentityFingerprint !== buyerIdentityFingerprint(buyer) || !buyer.active || !buyer.verified || (input.expiresAt && input.expiresAt <= new Date()))) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Approval requires an active verified business, unchanged identity, enabled state rule and unexpired certificate. Revoked certificates must be replaced." });
    if (input.status === "approved" && (before.data.recipientName !== rule.recipientName || before.data.recipientAddress !== rule.recipientAddress)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "The recipient changed. Request a new signed certificate." });
    const now = new Date();
    const [after] = await tx.update(resaleCertificates).set({ status: input.status, ruleRevision: input.status === "approved" ? rule.revision : before.ruleRevision, reviewNote: input.note, reviewedBy: ctx.user.id, reviewedAt: now, validFrom: input.status === "approved" ? input.validFrom : before.validFrom, expiresAt: input.status === "approved" ? input.expiresAt : before.expiresAt, updatedAt: now }).where(eq(resaleCertificates.id, input.id)).returning();
    await tx.insert(auditEvents).values({ actorType: "admin", actorId: ctx.user.id, action: `resale.${input.status}`, entityType: "resale_certificate", entityId: input.id, summary: input.note, metadata: { beforeStatus: before.status, afterStatus: after.status, beforeRuleRevision: before.ruleRevision, ruleRevision: after.ruleRevision, validFrom: after.validFrom, expiresAt: after.expiresAt } });
    return after;
  })),
});
