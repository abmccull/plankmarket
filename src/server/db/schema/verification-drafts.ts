import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

/**
 * Server-side verification work in progress.
 *
 * This table intentionally keeps EIN and document references out of browser
 * storage. It is not exposed through the Supabase Data API; authenticated
 * access is mediated by the application server and scoped to the current user.
 */
export const verificationDrafts = pgTable(
  "verification_drafts",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    currentStep: integer("current_step").default(1).notNull(),
    businessWebsite: text("business_website"),
    einTaxId: text("ein_tax_id"),
    verificationDocUrl: text("verification_doc_url"),
    businessAddress: text("business_address"),
    businessCity: varchar("business_city", { length: 100 }),
    businessState: varchar("business_state", { length: 2 }),
    businessZip: varchar("business_zip", { length: 10 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    purgeAfter: timestamp("purge_after", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("verification_drafts_purge_after_idx").on(table.purgeAfter),
    check(
      "verification_drafts_current_step_check",
      sql`${table.currentStep} between 1 and 3`,
    ),
  ],
);

export type VerificationDraft = typeof verificationDrafts.$inferSelect;
export type NewVerificationDraft = typeof verificationDrafts.$inferInsert;
