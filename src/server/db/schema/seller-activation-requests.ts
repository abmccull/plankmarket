import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { verificationDocuments } from "./verification-documents";

export type SellerActivationStatus = "draft" | "pending" | "approved" | "rejected" | "stale";
export type SellerActivationSyncState = "none" | "pending" | "in_progress" | "uncertain" | "complete" | "blocked" | "cancelled";
export type SellerActivationIdentitySnapshot = {
  businessName: string; businessAddress: string; businessCity: string;
  businessState: string; businessZip: string; authId: string;
  sourceVerificationSubmissionId: string | null;
};

// Private server-only evidence. The canonical migration installs snapshot,
// revision, document-lock, decision and due-purge triggers as well as checks.
export const sellerActivationRequests = pgTable("seller_activation_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestId: uuid("request_id").notNull(),
  revision: integer("revision").default(1).notNull(),
  status: text("status").$type<SellerActivationStatus>().default("draft").notNull(),
  syncState: text("sync_state").$type<SellerActivationSyncState>().default("none").notNull(),
  policyVersion: text("policy_version").default("seller-activation-v1").notNull(),
  createFingerprint: text("create_fingerprint").notNull(),
  lastSaveFingerprint: text("last_save_fingerprint").notNull(),
  businessWebsite: text("business_website"),
  einTaxId: text("ein_tax_id"),
  documentId: uuid("document_id").references(() => verificationDocuments.id, { onDelete: "restrict" }),
  identitySnapshot: jsonb("identity_snapshot").$type<SellerActivationIdentitySnapshot>(),
  identityFingerprint: text("identity_fingerprint"),
  submissionFingerprint: text("submission_fingerprint"),
  sourceVerificationSubmissionId: uuid("source_verification_submission_id"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedRevision: integer("submitted_revision"),
  einLast4: varchar("ein_last_4", { length: 4 }),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "restrict" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewRequestId: uuid("review_request_id"),
  reviewFingerprint: text("review_fingerprint"),
  reviewNote: text("review_note"),
  reviewDecision: text("review_decision").$type<"approved" | "rejected">(),
  reviewedRevision: integer("reviewed_revision"),
  activationOperationId: uuid("activation_operation_id"),
  claimToken: uuid("claim_token"),
  claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
  attemptCount: integer("attempt_count").default(0).notNull(),
  lastErrorCode: varchar("last_error_code", { length: 100 }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  purgeAfter: timestamp("purge_after", { withTimezone: true }).default(sql`now()+interval '30 days'`).notNull(),
  evidencePurgedAt: timestamp("evidence_purged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  uniqueIndex("seller_activation_user_request_idx").on(table.userId, table.requestId),
  uniqueIndex("seller_activation_one_outstanding_idx").on(table.userId).where(sql`${table.status} IN ('draft','pending') OR ${table.status}='approved' AND ${table.syncState}<>'complete' OR ${table.status}='stale' AND ${table.syncState} IN ('pending','in_progress','uncertain','blocked')`),
  uniqueIndex("seller_activation_review_request_idx").on(table.reviewedBy, table.reviewRequestId).where(sql`${table.reviewRequestId} IS NOT NULL`),
  uniqueIndex("seller_activation_operation_idx").on(table.activationOperationId).where(sql`${table.activationOperationId} IS NOT NULL`),
  index("seller_activation_queue_idx").on(table.status, table.syncState, table.createdAt),
  index("seller_activation_user_created_idx").on(table.userId, table.createdAt),
  index("seller_activation_purge_idx").on(table.purgeAfter).where(sql`${table.evidencePurgedAt} IS NULL`),
  index("seller_activation_document_idx").on(table.documentId).where(sql`${table.documentId} IS NOT NULL`),
  check("seller_activation_revision_check", sql`revision>0 AND attempt_count>=0 AND (submitted_revision IS NULL OR submitted_revision>0 AND submitted_revision<revision) AND (reviewed_revision IS NULL OR reviewed_revision>submitted_revision AND reviewed_revision<revision)`),
  check("seller_activation_state_check", sql`status IN ('draft','pending','approved','rejected','stale') AND sync_state IN ('none','pending','in_progress','uncertain','complete','blocked','cancelled') AND (status NOT IN ('draft','pending','rejected') OR sync_state='none') AND (status<>'approved' OR sync_state<>'none')`),
  check("seller_activation_fingerprint_check", sql`create_fingerprint ~ '^[0-9a-f]{64}$' AND last_save_fingerprint ~ '^[0-9a-f]{64}$' AND (identity_fingerprint IS NULL OR identity_fingerprint ~ '^[0-9a-f]{64}$') AND (submission_fingerprint IS NULL OR submission_fingerprint ~ '^[0-9a-f]{64}$') AND (review_fingerprint IS NULL OR review_fingerprint ~ '^[0-9a-f]{64}$') AND length(trim(policy_version)) BETWEEN 1 AND 64`),
  check("seller_activation_draft_fields_check", sql`(business_website IS NULL OR length(business_website)<=2048) AND (ein_tax_id IS NULL OR length(ein_tax_id)<=11) AND (ein_last_4 IS NULL OR ein_last_4 ~ '^[0-9]{4}$') AND (last_error_code IS NULL OR last_error_code ~ '^[A-Za-z][A-Za-z0-9_.:-]{0,99}$')`),
  check("seller_activation_submission_check", sql`coalesce((num_nonnulls(submitted_at,submitted_revision,identity_snapshot,identity_fingerprint,submission_fingerprint)=0 AND status IN ('draft','stale') AND source_verification_submission_id IS NULL) OR (num_nonnulls(submitted_at,submitted_revision,identity_snapshot,identity_fingerprint,submission_fingerprint)=5 AND status<>'draft' AND length(trim(business_website))>0),false)`),
  check("seller_activation_identity_snapshot_check", sql`identity_snapshot IS NULL OR coalesce(jsonb_typeof(identity_snapshot)='object' AND identity_snapshot ?& ARRAY['businessName','businessAddress','businessCity','businessState','businessZip','authId','sourceVerificationSubmissionId'] AND identity_snapshot-ARRAY['businessName','businessAddress','businessCity','businessState','businessZip','authId','sourceVerificationSubmissionId']='{}'::jsonb AND jsonb_typeof(identity_snapshot->'businessName')='string' AND length(trim(identity_snapshot->>'businessName')) BETWEEN 2 AND 255 AND jsonb_typeof(identity_snapshot->'businessAddress')='string' AND length(trim(identity_snapshot->>'businessAddress')) BETWEEN 1 AND 500 AND jsonb_typeof(identity_snapshot->'businessCity')='string' AND length(trim(identity_snapshot->>'businessCity')) BETWEEN 1 AND 100 AND jsonb_typeof(identity_snapshot->'businessState')='string' AND length(identity_snapshot->>'businessState')=2 AND jsonb_typeof(identity_snapshot->'businessZip')='string' AND length(identity_snapshot->>'businessZip') BETWEEN 5 AND 10 AND jsonb_typeof(identity_snapshot->'authId')='string' AND (identity_snapshot->>'authId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND identity_snapshot->'sourceVerificationSubmissionId'=coalesce(to_jsonb(source_verification_submission_id),'null'::jsonb) AND octet_length(identity_snapshot::text)<=8192,false)`),
  check("seller_activation_review_check", sql`coalesce((num_nonnulls(reviewed_by,reviewed_at,review_request_id,review_fingerprint,review_note,review_decision,reviewed_revision)=0 AND status IN ('draft','pending','stale')) OR (num_nonnulls(reviewed_by,reviewed_at,review_request_id,review_fingerprint,review_note,review_decision,reviewed_revision)=7 AND submitted_at IS NOT NULL AND reviewed_by<>user_id AND length(trim(review_note))>0 AND ((review_decision='approved' AND status IN ('approved','stale')) OR (review_decision='rejected' AND status='rejected'))),false)`),
  check("seller_activation_sync_check", sql`coalesce(((activation_operation_id IS NULL AND sync_state='none') OR (activation_operation_id IS NOT NULL AND review_decision='approved' AND status IN ('approved','stale') AND sync_state<>'none')) AND ((sync_state='in_progress' AND claim_token IS NOT NULL AND claim_expires_at IS NOT NULL AND attempt_count>0) OR (sync_state<>'in_progress' AND claim_token IS NULL AND claim_expires_at IS NULL)) AND ((sync_state='complete' AND status='approved' AND activated_at IS NOT NULL) OR (sync_state<>'complete' AND activated_at IS NULL)) AND (sync_state<>'cancelled' OR status='stale' AND review_decision='approved' AND activation_operation_id IS NOT NULL AND claim_token IS NULL AND claim_expires_at IS NULL AND activated_at IS NULL),false)`),
  check("seller_activation_time_check", sql`updated_at>=created_at AND purge_after>=created_at AND purge_after<=created_at+interval '30 days' AND (submitted_at IS NULL OR submitted_at>=created_at) AND (reviewed_at IS NULL OR reviewed_at>=submitted_at) AND (activated_at IS NULL OR activated_at>=reviewed_at) AND (claim_expires_at IS NULL OR claim_expires_at>=reviewed_at) AND (evidence_purged_at IS NULL OR evidence_purged_at>=purge_after)`),
  check("seller_activation_purged_fields_check", sql`evidence_purged_at IS NULL OR (ein_tax_id IS NULL AND ein_last_4 IS NULL AND document_id IS NULL AND (status IN ('rejected','stale') OR status='approved' AND sync_state='complete'))`),
]);

export type SellerActivationRequest = typeof sellerActivationRequests.$inferSelect;
export type NewSellerActivationRequest = typeof sellerActivationRequests.$inferInsert;
