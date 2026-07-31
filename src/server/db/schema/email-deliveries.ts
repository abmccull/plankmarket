import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const EMAIL_DELIVERY_STATUSES = [
  "sending",
  "acceptance_unknown",
  "accepted",
  "acceptance_unknown",
  "scheduled",
  "sent",
  "delivered",
  "delivery_delayed",
  "bounced",
  "complained",
  "failed",
  "suppressed",
] as const;

export type EmailDeliveryStatus = (typeof EMAIL_DELIVERY_STATUSES)[number];

export const emailDeliveries = pgTable(
  "email_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    idempotencyKey: varchar("idempotency_key", { length: 256 }).notNull(),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    category: varchar("category", { length: 100 }).notNull(),
    payloadFingerprint: varchar("payload_fingerprint", {
      length: 64,
    }).notNull(),
    fromAddress: text("from_address").notNull(),
    recipientEmails: text("recipient_emails").array().notNull(),
    subject: text("subject").notNull(),
    status: varchar("status", { length: 32 })
      .$type<EmailDeliveryStatus>()
      .default("sending")
      .notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    providerStatusAt: timestamp("provider_status_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("email_deliveries_idempotency_key_uidx").on(
      table.idempotencyKey,
    ),
    uniqueIndex("email_deliveries_provider_message_id_uidx")
      .on(table.providerMessageId)
      .where(sql`${table.providerMessageId} is not null`),
    index("email_deliveries_status_updated_idx").on(
      table.status,
      table.updatedAt,
    ),
    index("email_deliveries_recipient_emails_gin_idx").using(
      "gin",
      table.recipientEmails,
    ),
    check(
      "email_deliveries_status_check",
      sql`${table.status} in ('sending', 'accepted', 'acceptance_unknown', 'scheduled', 'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'failed', 'suppressed')`,
    ),
    check(
      "email_deliveries_attempt_count_check",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
);

export const resendWebhookEvents = pgTable(
  "resend_webhook_events",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    providerMessageId: varchar("provider_message_id", {
      length: 255,
    }).notNull(),
    eventCreatedAt: timestamp("event_created_at", {
      withTimezone: true,
    }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    index("resend_webhook_events_message_created_idx").on(
      table.providerMessageId,
      table.eventCreatedAt,
    ),
  ],
);

export const emailRecipientSuppressions = pgTable(
  "email_recipient_suppressions",
  {
    email: varchar("email", { length: 320 }).primaryKey(),
    reason: varchar("reason", { length: 32 })
      .$type<"bounced" | "complained" | "suppressed">()
      .notNull(),
    sourceDeliveryId: uuid("source_delivery_id").references(
      () => emailDeliveries.id,
      { onDelete: "set null" },
    ),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    suppressedAt: timestamp("suppressed_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("email_recipient_suppressions_reason_idx").on(table.reason),
    check(
      "email_recipient_suppressions_reason_check",
      sql`${table.reason} in ('bounced', 'complained', 'suppressed')`,
    ),
  ],
);

export type EmailDelivery = typeof emailDeliveries.$inferSelect;
export type NewEmailDelivery = typeof emailDeliveries.$inferInsert;
export type ResendWebhookEvent = typeof resendWebhookEvents.$inferSelect;
export type NewResendWebhookEvent = typeof resendWebhookEvents.$inferInsert;
export type EmailRecipientSuppression =
  typeof emailRecipientSuppressions.$inferSelect;
