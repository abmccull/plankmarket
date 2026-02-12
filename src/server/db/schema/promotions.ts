import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { money } from "../custom-types";
import { listings } from "./listings";
import { users } from "./users";

export const promotionTierEnum = pgEnum("promotion_tier", [
  "spotlight",
  "featured",
  "premium",
]);

export const promotionPaymentStatusEnum = pgEnum("promotion_payment_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
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
    paymentStatus: promotionPaymentStatusEnum("payment_status")
      .default("pending")
      .notNull(),
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
  ]
);

export type ListingPromotion = typeof listingPromotions.$inferSelect;
export type NewListingPromotion = typeof listingPromotions.$inferInsert;
