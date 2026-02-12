import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { listings } from "./listings";

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .references(() => listings.id, { onDelete: "cascade" })
      .notNull(),
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
  ]
);

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
