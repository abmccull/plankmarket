import { sql } from "drizzle-orm";
import { pgTable, uuid, text, varchar, integer, timestamp, index, uniqueIndex, check, foreignKey } from "drizzle-orm/pg-core";
import { users } from "./users";
import { listingFormDrafts } from "./listing-form-drafts";
import { media } from "./media";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

// Canonical 0047 owns deferred reciprocal FKs/triggers that Drizzle cannot express.
export const listingPhotoUploads = pgTable("listing_photo_uploads", {
  id: uuid("id").primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  draftId: uuid("draft_id").notNull(),
  draftGeneration: integer("draft_generation").notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  incomingPath: text("incoming_path").notNull(),
  frozenPath: text("frozen_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  readyMediaId: uuid("ready_media_id"),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  contentSha256: text("content_sha256"),
  completedRevision: integer("completed_revision"),
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  residueLastAttemptAt: timestamp("residue_last_attempt_at", { withTimezone: true }),
  residueLastSuccessAt: timestamp("residue_last_success_at", { withTimezone: true }),
}, (table): PgTableExtraConfigValue[] => [
  foreignKey({ name: "listing_photo_uploads_draft_owner_fk", columns: [table.draftId, table.ownerId, table.draftGeneration], foreignColumns: [listingFormDrafts.id, listingFormDrafts.sellerId, listingFormDrafts.generation] }).onDelete("restrict"),
  foreignKey({ name: "listing_photo_uploads_ready_media_fk", columns: [table.readyMediaId], foreignColumns: [media.id] }).onDelete("restrict"),
  uniqueIndex("listing_photo_uploads_ready_media_unique").on(table.readyMediaId).where(sql`${table.readyMediaId} is not null`),
  index("listing_photo_uploads_owner_created_idx").on(table.ownerId, table.createdAt),
  index("listing_photo_uploads_draft_outstanding_idx").on(table.draftId).where(sql`${table.deletedAt} is null`),
  index("listing_photo_uploads_cleanup_idx").on(table.createdAt, table.id).where(sql`${table.deletedAt} is null`),
  index("listing_photo_uploads_residue_idx").on(table.residueLastAttemptAt.asc().nullsFirst(), table.deletedAt, table.id).where(sql`${table.deletedAt} is not null`),
  check("listing_photo_uploads_metadata_check", sql`length(${table.fileName})>0 and ${table.fileSize} between 1 and 4194304 and ${table.mimeType} in ('image/jpeg','image/png','image/webp')`),
  check("listing_photo_uploads_paths_check", sql`${table.incomingPath}=${table.ownerId}::text||'/incoming/'||${table.draftId}::text||'/'||${table.draftGeneration}::text||'/'||${table.id}::text and ${table.frozenPath}=${table.ownerId}::text||'/frozen/'||${table.draftId}::text||'/'||${table.draftGeneration}::text||'/'||${table.id}::text`),
  check("listing_photo_uploads_expiry_check", sql`${table.expiresAt}=${table.createdAt}+interval '2 hours'`),
  check("listing_photo_uploads_ready_check", sql`num_nonnulls(${table.readyMediaId},${table.readyAt},${table.contentSha256},${table.completedRevision})=0 or (num_nonnulls(${table.readyMediaId},${table.readyAt},${table.contentSha256},${table.completedRevision})=4 and ${table.contentSha256} ~ '^[0-9a-f]{64}$' and ${table.completedRevision}>1 and ${table.readyAt}>=${table.createdAt} and ${table.readyAt}<=${table.expiresAt})`),
  check("listing_photo_uploads_deletion_check", sql`(${table.deletionRequestedAt} is null and ${table.deletedAt} is null) or (${table.deletionRequestedAt}>=${table.createdAt} and (${table.deletedAt} is null or ${table.deletedAt}>=${table.deletionRequestedAt}))`),
  check("listing_photo_uploads_residue_check", sql`(${table.residueLastAttemptAt} is null and ${table.residueLastSuccessAt} is null) or (${table.deletedAt} is not null and ${table.residueLastAttemptAt}>=${table.deletedAt} and (${table.residueLastSuccessAt} is null or ${table.residueLastSuccessAt}>=${table.deletedAt}))`),
]);
export type ListingPhotoUpload = typeof listingPhotoUploads.$inferSelect;
export type NewListingPhotoUpload = typeof listingPhotoUploads.$inferInsert;
