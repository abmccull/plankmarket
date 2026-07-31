import {
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("media_listing_id_idx").on(table.listingId),
    index("media_sort_order_idx").on(table.listingId, table.sortOrder),
    index("media_buyer_request_id_idx").on(table.buyerRequestId),
    index("media_uploader_id_idx").on(table.uploaderId),
    uniqueIndex("media_uploadthing_key_unique_idx")
      .on(table.key)
      .where(sql`${table.key} is not null`),
    check(
      "media_uploader_required_check",
      sql`${table.uploaderId} is not null`,
    ),
  ]
);

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
