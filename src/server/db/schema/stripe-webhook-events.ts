import {
  pgTable,
  timestamp,
  varchar,
  integer,
  text,
  index,
  jsonb,
} from "drizzle-orm/pg-core";

export const stripeWebhookEvents = pgTable(
  "stripe_webhook_events",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    // Historical receive timestamp retained for compatibility.
    processedAt: timestamp("processed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    eventCreatedAt: timestamp("event_created_at", { withTimezone: true }),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    status: varchar("status", { length: 20 })
      .default("pending")
      .notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    processingStartedAt: timestamp("processing_started_at", {
      withTimezone: true,
    }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (table) => [
    index("stripe_webhook_events_status_started_idx").on(
      table.status,
      table.processingStartedAt,
    ),
    index("stripe_webhook_events_pending_received_idx").on(
      table.status,
      table.receivedAt,
      table.id,
    ),
  ],
);

export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;
