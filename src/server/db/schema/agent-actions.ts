import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const agentActions = pgTable(
  "agent_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    actionType: varchar("action_type", { length: 50 }).notNull(),
    // "offer_accepted" | "offer_countered" | "offer_rejected"
    // | "listing_repriced" | "match_found" | "auto_offer_made"
    relatedId: uuid("related_id"), // listing, offer, or order ID
    details: jsonb("details"), // action-specific data (old price, new price, rule triggered, etc.)
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("agent_actions_user_id_idx").on(table.userId),
    index("agent_actions_action_type_idx").on(table.actionType),
    index("agent_actions_created_at_idx").on(table.createdAt),
  ]
);

export type AgentAction = typeof agentActions.$inferSelect;
export type NewAgentAction = typeof agentActions.$inferInsert;
