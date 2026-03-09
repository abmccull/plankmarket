import {
  pgTable,
  uuid,
  boolean,
  real,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { money } from "../custom-types";
import { users } from "./users";

export const agentConfigs = pgTable(
  "agent_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),

    // --- Offer handling rules (sellers) ---
    offerAutoEnabled: boolean("offer_auto_enabled").default(false).notNull(),
    offerAcceptAbove: real("offer_accept_above"), // Accept if offer >= X% of ask (e.g. 90)
    offerCounterAt: real("offer_counter_at"), // Counter if between reject and accept (e.g. 80)
    offerRejectBelow: real("offer_reject_below"), // Reject below this % (e.g. 70)
    offerCounterMessage: text("offer_counter_message"),
    offerRejectMessage: text("offer_reject_message"),

    // --- Monitoring rules (buyers) ---
    monitorEnabled: boolean("monitor_enabled").default(false).notNull(),
    monitorAutoOffer: boolean("monitor_auto_offer").default(false).notNull(),
    monitorMaxPrice: money("monitor_max_price"), // Max price per sqft for auto-offers
    monitorBudgetMonthly: money("monitor_budget_monthly"), // Monthly spend ceiling
    monitorBudgetUsed: money("monitor_budget_used").default(0).notNull(),

    // --- Repricing rules (sellers) ---
    repricingEnabled: boolean("repricing_enabled").default(false).notNull(),
    repricingDropPercent: real("repricing_drop_percent"), // % to drop after stale period (e.g. 5)
    repricingStaleAfterDays: integer("repricing_stale_after_days"), // Days before "stale" (e.g. 14)
    repricingFloorPercent: real("repricing_floor_percent"), // Never drop below X% of original ask (e.g. 70)

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("agent_configs_user_id_idx").on(table.userId),
  ]
);

export type AgentConfig = typeof agentConfigs.$inferSelect;
export type NewAgentConfig = typeof agentConfigs.$inferInsert;
