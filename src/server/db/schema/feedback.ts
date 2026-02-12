import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const feedbackTypeEnum = pgEnum("feedback_type", [
  "bug",
  "feature",
  "general",
]);

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }), // Nullable for anonymous feedback

    // Feedback details
    page: varchar("page", { length: 255 }),
    type: feedbackTypeEnum("type").notNull(),
    message: text("message").notNull(),
    rating: integer("rating"), // Optional 1-5 rating

    // Timestamp
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("feedback_user_id_idx").on(table.userId),
    index("feedback_type_idx").on(table.type),
    index("feedback_created_at_idx").on(table.createdAt),
  ]
);

export type Feedback = typeof feedback.$inferSelect;
export type NewFeedback = typeof feedback.$inferInsert;
