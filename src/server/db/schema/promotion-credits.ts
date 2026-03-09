import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { money } from "../custom-types";
import { users } from "./users";

export const promotionCredits = pgTable(
  "promotion_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    amount: money("amount").notNull(), // Credit amount in dollars (e.g. 15.00)
    usedAmount: money("used_amount").notNull().default(0),
    source: varchar("source", { length: 30 })
      .notNull()
      .default("subscription"), // "subscription" | "admin_grant" | "refund"
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("promotion_credits_user_id_idx").on(table.userId),
    index("promotion_credits_expires_at_idx").on(table.expiresAt),
  ]
);

export type PromotionCredit = typeof promotionCredits.$inferSelect;
export type NewPromotionCredit = typeof promotionCredits.$inferInsert;
