import {
  pgEnum,
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { listings } from "./listings";
import { users } from "./users";

export const sampleRequestStatusEnum = pgEnum("sample_request_status", [
  "requested",
  "approved",
  "declined",
  "cancelled",
  "shipped",
  "delivered",
]);

export const sampleRequests = pgTable(
  "sample_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .references(() => listings.id, { onDelete: "cascade" })
      .notNull(),
    buyerId: uuid("buyer_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    status: sampleRequestStatusEnum("status").default("requested").notNull(),
    buyerMessage: text("buyer_message"),
    shippingName: varchar("shipping_name", { length: 255 }).notNull(),
    shippingAddress1: text("shipping_address_1").notNull(),
    shippingAddress2: text("shipping_address_2"),
    shippingCity: varchar("shipping_city", { length: 100 }).notNull(),
    shippingState: varchar("shipping_state", { length: 2 }).notNull(),
    shippingZip: varchar("shipping_zip", { length: 10 }).notNull(),
    shippingPhone: varchar("shipping_phone", { length: 20 }),
    buyerConsentedToShareAddressAt: timestamp(
      "buyer_consented_to_share_address_at",
      { withTimezone: true },
    ),
    carrier: varchar("carrier", { length: 100 }),
    trackingNumber: varchar("tracking_number", { length: 120 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastActionReason: text("last_action_reason"),
    auditLog: jsonb("audit_log")
      .$type<Array<Record<string, unknown>>>()
      .default([])
      .notNull(),
    retentionPurgeAfter: timestamp("retention_purge_after", {
      withTimezone: true,
    }),
    piiPurgedAt: timestamp("pii_purged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("sample_requests_listing_id_idx").on(table.listingId),
    index("sample_requests_buyer_id_idx").on(table.buyerId),
    index("sample_requests_seller_id_idx").on(table.sellerId),
    index("sample_requests_status_idx").on(table.status, table.createdAt),
    index("sample_requests_retention_purge_after_idx").on(
      table.retentionPurgeAfter,
    ),
  ],
);

export type SampleRequest = typeof sampleRequests.$inferSelect;
export type NewSampleRequest = typeof sampleRequests.$inferInsert;
