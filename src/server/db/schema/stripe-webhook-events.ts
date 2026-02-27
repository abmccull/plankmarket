import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: varchar("id", { length: 255 }).primaryKey(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;
