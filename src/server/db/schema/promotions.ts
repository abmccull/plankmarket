import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  index,
  uniqueIndex,
  pgEnum,
  text,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { money } from "../custom-types";
import { listings } from "./listings";
import { users } from "./users";

export const promotionTierEnum = pgEnum("promotion_tier", [
  "spotlight",
  "featured",
  "premium",
]);

export const listingPromotions = pgTable(
  "listing_promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .references(() => listings.id, { onDelete: "cascade" })
      .notNull(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tier: promotionTierEnum("tier").notNull(),
    durationDays: integer("duration_days").notNull(),
    pricePaid: money("price_paid").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    stripePaymentIntentId: varchar("stripe_payment_intent_id", {
      length: 255,
    }),
    paymentStatus: varchar("payment_status", { length: 50 })
      .default("pending")
      .notNull(),
    refundAmountCents: integer("refund_amount_cents"),
    refundIdempotencyKey: varchar("refund_idempotency_key", { length: 255 }),
    stripeRefundId: varchar("stripe_refund_id", { length: 255 }),
    refundAttemptCount: integer("refund_attempt_count").default(0).notNull(),
    refundRequestedAt: timestamp("refund_requested_at", {
      withTimezone: true,
    }),
    refundLastAttemptAt: timestamp("refund_last_attempt_at", {
      withTimezone: true,
    }),
    refundNextAttemptAt: timestamp("refund_next_attempt_at", {
      withTimezone: true,
    }),
    refundLastError: text("refund_last_error"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    index("promotions_listing_id_idx").on(table.listingId),
    index("promotions_seller_id_idx").on(table.sellerId),
    index("promotions_active_expires_idx").on(table.isActive, table.expiresAt),
    index("promotions_tier_active_idx").on(table.tier, table.isActive),
    index("listing_promotions_refund_retry_idx")
      .on(table.refundNextAttemptAt)
      .where(sql`${table.paymentStatus} = 'refund_pending'`),
    uniqueIndex("listing_promotions_stripe_refund_id_unique_idx")
      .on(table.stripeRefundId)
      .where(sql`${table.stripeRefundId} is not null`),
    uniqueIndex("listing_promotions_refund_idempotency_key_unique_idx")
      .on(table.refundIdempotencyKey)
      .where(sql`${table.refundIdempotencyKey} is not null`),
    check(
      "listing_promotions_refund_amount_nonnegative",
      sql`${table.refundAmountCents} is null or ${table.refundAmountCents} >= 0`,
    ),
    check(
      "listing_promotions_refund_attempt_count_nonnegative",
      sql`${table.refundAttemptCount} >= 0`,
    ),
  ]
);

export type ListingPromotion = typeof listingPromotions.$inferSelect;
export type NewListingPromotion = typeof listingPromotions.$inferInsert;
