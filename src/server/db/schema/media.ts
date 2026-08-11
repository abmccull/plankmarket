import {
  foreignKey,
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { listings } from "./listings";
import { buyerRequests } from "./buyer-requests";
import { users } from "./users";

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .references(() => listings.id, { onDelete: "cascade" }),
    buyerRequestId: uuid("buyer_request_id")
      .references(() => buyerRequests.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    url: text("url").notNull(),
    key: varchar("key", { length: 500 }),
    fileName: varchar("file_name", { length: 255 }),
    fileSize: integer("file_size"),
    mimeType: varchar("mime_type", { length: 100 }),
    altText: varchar("alt_text", { length: 255 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    deletionClaimToken: varchar("deletion_claim_token", { length: 64 }),
    deletionClaimedAt: timestamp("deletion_claimed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("media_listing_id_idx").on(table.listingId),
    index("media_sort_order_idx").on(table.listingId, table.sortOrder),
    index("media_buyer_request_id_idx").on(table.buyerRequestId),
    index("media_uploader_id_idx").on(table.uploaderId),
    index("media_pending_deletion_claim_idx")
      .on(table.deletionClaimedAt)
      .where(sql`${table.deletionClaimToken} is not null`),
    uniqueIndex("media_uploadthing_key_unique_idx")
      .on(table.key)
      .where(sql`${table.key} is not null`),
    check(
      "media_uploader_required_check",
      sql`${table.uploaderId} is not null`,
    ),
    check(
      "media_one_parent_max_check",
      sql`num_nonnulls(${table.listingId}, ${table.buyerRequestId}) <= 1`,
    ),
    check(
      "media_deletion_claim_consistency_check",
      sql`(${table.deletionClaimToken} is null) = (${table.deletionClaimedAt} is null)`,
    ),
    foreignKey({
      columns: [table.listingId, table.uploaderId],
      foreignColumns: [listings.id, listings.sellerId],
      name: "media_listing_owner_lineage_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.buyerRequestId, table.uploaderId],
      foreignColumns: [buyerRequests.id, buyerRequests.buyerId],
      name: "media_buyer_request_owner_lineage_fk",
    }).onDelete("cascade"),
  ]
);

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
