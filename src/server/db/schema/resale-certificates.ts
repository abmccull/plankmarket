import { pgTable, uuid, text, integer, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";
import { verificationDocuments } from "./verification-documents";
import type { ResaleCertificateData, ResaleCertificateRecord } from "@/lib/resale-exemption";
export const resaleRules = pgTable("resale_rules", {
  state: text("state").primaryKey(), enabled: boolean("enabled").default(false).notNull(),
  revision: integer("revision").default(1).notNull(), policyReference: text("policy_reference").notNull(),
  recipientName: text("recipient_name").notNull(), recipientAddress: text("recipient_address").notNull(),
  freightExempt: boolean("freight_exempt").default(false).notNull(), electronicTexas: boolean("electronic_texas").default(false).notNull(),
  updatedBy: uuid("updated_by").notNull().references(() => users.id), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export const resaleCertificates = pgTable("resale_certificates", {
  id: uuid("id").primaryKey().defaultRandom(), buyerId: uuid("buyer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestId: uuid("request_id").notNull(), inputFingerprint: text("input_fingerprint").notNull(),
  state: text("state").notNull().references(() => resaleRules.state), ruleRevision: integer("rule_revision").notNull(),
  status: text("status").$type<ResaleCertificateRecord["status"]>().default("pending").notNull(),
  format: text("format").$type<"upload" | "texas_electronic">().notNull(),
  documentId: uuid("document_id").references(() => verificationDocuments.id, { onDelete: "restrict" }),
  buyerIdentityFingerprint: text("buyer_identity_fingerprint").notNull(),
  data: jsonb("data").$type<ResaleCertificateData>().notNull(),
  reviewNote: text("review_note"), reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }), validFrom: timestamp("valid_from", { withTimezone: true }), expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex("resale_certificate_request_idx").on(t.buyerId, t.requestId), index("resale_certificate_buyer_state_idx").on(t.buyerId, t.state), index("resale_certificate_queue_idx").on(t.status, t.createdAt)]);
