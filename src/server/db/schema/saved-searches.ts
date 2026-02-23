import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import type { SearchFilters } from "@/types";

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    filters: jsonb("filters").$type<SearchFilters>().notNull(),
    alertEnabled: boolean("alert_enabled").default(true).notNull(),
    alertFrequency: varchar("alert_frequency", { length: 20 })
      .default("instant")
      .notNull()
      .$type<"instant" | "daily" | "weekly">(),
    alertChannels: jsonb("alert_channels")
      .$type<("in_app" | "email")[]>()
      .default(["email"])
      .notNull(),
    lastAlertAt: timestamp("last_alert_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("saved_searches_user_id_idx").on(table.userId),
    index("saved_searches_alert_enabled_idx").on(table.alertEnabled),
  ]
);

export type SavedSearch = typeof savedSearches.$inferSelect;
export type NewSavedSearch = typeof savedSearches.$inferInsert;
