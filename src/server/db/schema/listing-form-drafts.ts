import { sql } from "drizzle-orm";
import { pgTable, uuid, integer, text, jsonb, timestamp, uniqueIndex, unique, index, check, foreignKey } from "drizzle-orm/pg-core";
import type { ListingDraftSnapshot } from "@/lib/validators/listing-draft";
import { users } from "./users";
import { listings } from "./listings";

export const listingFormDrafts = pgTable("listing_form_drafts", {
  id: uuid("id").primaryKey(),
  sellerId: uuid("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  generation: integer("generation").notNull(),
  revision: integer("revision").notNull().default(1),
  state: text("state").$type<"editing" | "published" | "discarded">().notNull().default("editing"),
  snapshot: jsonb("snapshot").$type<ListingDraftSnapshot>().notNull(),
  lastSaveOperationId: uuid("last_save_operation_id").notNull(),
  lastSaveFingerprint: text("last_save_fingerprint").notNull(),
  publishedListingId: uuid("published_listing_id"),
  publishedRevision: integer("published_revision"),
  publicationFingerprint: text("publication_fingerprint"),
  nextDraftId: uuid("next_draft_id"),
  advanceOperationId: uuid("advance_operation_id"),
  advanceFingerprint: text("advance_fingerprint"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("listing_form_drafts_photo_lineage_unique").on(table.id, table.sellerId, table.generation),
  uniqueIndex("listing_form_drafts_seller_generation_idx").on(table.sellerId, table.generation),
  uniqueIndex("listing_form_drafts_one_editing_idx").on(table.sellerId).where(sql`${table.state} = 'editing'`),
  index("listing_form_drafts_seller_updated_idx").on(table.sellerId, table.updatedAt),
  check("listing_form_drafts_revision_check", sql`${table.revision} > 0 and ${table.generation} > 0`),
  check("listing_form_drafts_state_check", sql`${table.state} in ('editing', 'published', 'discarded')`),
  check("listing_form_drafts_snapshot_check", sql`coalesce(jsonb_typeof(${table.snapshot}) = 'object' and ${table.snapshot}->>'schemaVersion' = '2' and (${table.snapshot}->>'currentStep')::integer between 1 and 3 and jsonb_typeof(${table.snapshot}->'formData') = 'object' and jsonb_typeof(${table.snapshot}->'uploadedMediaIds') = 'array' and jsonb_array_length(${table.snapshot}->'uploadedMediaIds') <= 20 and jsonb_typeof(${table.snapshot}->'defaultsApplied') = 'boolean' and octet_length(${table.snapshot}::text) <= 110000, false)`),
  check("listing_form_drafts_receipt_check", sql`coalesce((${table.state} = 'published' and ${table.publishedListingId} is not null and ${table.publishedRevision} > 0 and ${table.publishedRevision} < ${table.revision} and ${table.publicationFingerprint} ~ '^[0-9a-f]{64}$') or (${table.state} <> 'published' and ${table.publishedListingId} is null and ${table.publishedRevision} is null and ${table.publicationFingerprint} is null), false)`),
  check("listing_form_drafts_operation_check", sql`${table.lastSaveFingerprint} ~ '^[0-9a-f]{64}$' and (num_nonnulls(${table.nextDraftId}, ${table.advanceOperationId}, ${table.advanceFingerprint}) = 0 or (num_nonnulls(${table.nextDraftId}, ${table.advanceOperationId}, ${table.advanceFingerprint}) = 3 and ${table.advanceFingerprint} ~ '^[0-9a-f]{64}$' and ${table.state} <> 'editing'))`),
  foreignKey({ name: "listing_form_drafts_listing_owner_fk", columns: [table.publishedListingId, table.sellerId], foreignColumns: [listings.id, listings.sellerId] }),
]);
export type ListingFormDraft = typeof listingFormDrafts.$inferSelect;
