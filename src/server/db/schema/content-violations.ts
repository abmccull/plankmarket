import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const contentViolations = pgTable(
  "content_violations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id),
    contentType: varchar("content_type", { length: 50 }).notNull(), // "message", "listing", "offer", "review"
    contentBody: text("content_body").notNull(),
    detections: jsonb("detections").notNull(), // Array of Detection objects
    reviewed: boolean("reviewed").default(false).notNull(),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    falsePositive: boolean("false_positive").default(false).notNull(),
    adminNotes: text("admin_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("content_violations_user_id_idx").on(table.userId),
    index("content_violations_reviewed_idx").on(table.reviewed),
    index("content_violations_content_type_idx").on(table.contentType),
    index("content_violations_reviewed_content_type_idx").on(table.reviewed, table.contentType),
  ]
);

export type ContentViolation = typeof contentViolations.$inferSelect;
export type NewContentViolation = typeof contentViolations.$inferInsert;
