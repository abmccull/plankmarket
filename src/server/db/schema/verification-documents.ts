import { pgTable, uuid, text, integer, timestamp, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
export const verificationDocuments = pgTable("verification_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  objectPath: text("object_path").notNull().unique(),
  fileName: text("file_name").notNull(),
  purpose: text("purpose").$type<"business_verification" | "resale_certificate" | "seller_activation">().default("business_verification").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  residueLastAttemptAt: timestamp("residue_last_attempt_at", { withTimezone: true }),
  residueLastSuccessAt: timestamp("residue_last_success_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [
  index("verification_documents_user_idx").on(t.userId),
  index("verification_documents_pending_deletion_idx").on(t.deletionRequestedAt).where(sql`${t.deletionRequestedAt} is not null and ${t.deletedAt} is null`),
  index("verification_documents_residue_queue_idx").on(t.residueLastAttemptAt.asc().nullsFirst(), t.deletedAt, t.id).where(sql`${t.deletedAt} is not null`),
  check("verification_documents_size_check", sql`${t.fileSize} > 0 and ${t.fileSize} <= 10485760`),
  check("verification_documents_deletion_time_check", sql`${t.deletionRequestedAt} is null or (${t.deletionRequestedAt} >= ${t.createdAt} and (${t.deletedAt} is null or ${t.deletedAt} >= ${t.deletionRequestedAt}))`),
  check("verification_documents_residue_state_check", sql`(${t.residueLastAttemptAt} is null and ${t.residueLastSuccessAt} is null) or (${t.deletedAt} is not null and ${t.residueLastAttemptAt} is not null and ${t.residueLastAttemptAt} >= ${t.deletedAt} and (${t.residueLastSuccessAt} is null or ${t.residueLastSuccessAt} >= ${t.deletedAt}))`),
]);
