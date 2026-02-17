import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { conversations } from "./conversations";

export const followupStatusEnum = pgEnum("followup_status", [
  "pending",
  "completed",
  "cancelled",
]);

export const sellerBuyerTags = pgTable(
  "seller_buyer_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    buyerId: uuid("buyer_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tag: varchar("tag", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("seller_buyer_tags_unique_idx").on(
      table.sellerId,
      table.buyerId,
      table.tag
    ),
    index("seller_buyer_tags_seller_id_idx").on(table.sellerId),
    index("seller_buyer_tags_buyer_id_idx").on(table.buyerId),
  ]
);

export const sellerBuyerNotes = pgTable(
  "seller_buyer_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    buyerId: uuid("buyer_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("seller_buyer_notes_seller_buyer_idx").on(
      table.sellerId,
      table.buyerId
    ),
    index("seller_buyer_notes_created_at_idx").on(table.createdAt),
  ]
);

export const followups = pgTable(
  "followups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    buyerId: uuid("buyer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 255 }).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: followupStatusEnum("status").notNull().default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("followups_seller_id_idx").on(table.sellerId),
    index("followups_due_at_idx").on(table.dueAt),
    index("followups_status_idx").on(table.status),
  ]
);

export type SellerBuyerTag = typeof sellerBuyerTags.$inferSelect;
export type NewSellerBuyerTag = typeof sellerBuyerTags.$inferInsert;
export type SellerBuyerNote = typeof sellerBuyerNotes.$inferSelect;
export type NewSellerBuyerNote = typeof sellerBuyerNotes.$inferInsert;
export type Followup = typeof followups.$inferSelect;
export type NewFollowup = typeof followups.$inferInsert;
