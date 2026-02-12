import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { orders } from "./orders";

export const disputeStatusEnum = pgEnum("dispute_status", [
  "open",
  "under_review",
  "resolved_buyer",
  "resolved_seller",
  "closed",
]);

export const disputes = pgTable(
  "disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "restrict" })
      .unique()
      .notNull(),
    initiatorId: uuid("initiator_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),

    // Dispute details
    reason: varchar("reason", { length: 255 }).notNull(),
    description: text("description").notNull(),

    // Status
    status: disputeStatusEnum("status").notNull().default("open"),

    // Resolution
    resolution: text("resolution"),
    resolvedBy: uuid("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("disputes_order_id_idx").on(table.orderId),
    index("disputes_initiator_id_idx").on(table.initiatorId),
    index("disputes_status_idx").on(table.status),
    index("disputes_created_at_idx").on(table.createdAt),
  ]
);

export const disputeMessages = pgTable(
  "dispute_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    disputeId: uuid("dispute_id")
      .references(() => disputes.id, { onDelete: "cascade" })
      .notNull(),
    senderId: uuid("sender_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),

    // Message content
    message: text("message").notNull(),

    // Timestamp
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("dispute_messages_dispute_id_idx").on(table.disputeId),
    index("dispute_messages_sender_id_idx").on(table.senderId),
    index("dispute_messages_created_at_idx").on(table.createdAt),
  ]
);

export type Dispute = typeof disputes.$inferSelect;
export type NewDispute = typeof disputes.$inferInsert;
export type DisputeMessage = typeof disputeMessages.$inferSelect;
export type NewDisputeMessage = typeof disputeMessages.$inferInsert;
