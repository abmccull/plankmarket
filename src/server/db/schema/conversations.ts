import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { listings } from "./listings";

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .references(() => listings.id, { onDelete: "cascade" })
      .notNull(),
    buyerId: uuid("buyer_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),

    // Timestamps for message tracking
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    buyerLastReadAt: timestamp("buyer_last_read_at", { withTimezone: true }),
    sellerLastReadAt: timestamp("seller_last_read_at", { withTimezone: true }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("conversations_listing_buyer_unique").on(
      table.listingId,
      table.buyerId
    ),
    index("conversations_listing_id_idx").on(table.listingId),
    index("conversations_buyer_id_idx").on(table.buyerId),
    index("conversations_seller_id_idx").on(table.sellerId),
    index("conversations_last_message_at_idx").on(table.lastMessageAt),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    senderId: uuid("sender_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),

    // Message content
    body: text("body").notNull(),

    // Timestamp
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("messages_conversation_id_idx").on(table.conversationId),
    index("messages_sender_id_idx").on(table.senderId),
    index("messages_created_at_idx").on(table.createdAt),
  ]
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ConversationMessage = typeof messages.$inferSelect;
export type NewConversationMessage = typeof messages.$inferInsert;
