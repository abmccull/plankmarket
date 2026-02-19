import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  pgEnum,
  integer,
} from "drizzle-orm/pg-core";
import { money } from "../custom-types";
import { users } from "./users";
import { listings } from "./listings";

export const offerStatusEnum = pgEnum("offer_status", [
  "pending",
  "accepted",
  "rejected",
  "countered",
  "withdrawn",
  "expired",
]);

export const offers = pgTable(
  "offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .references(() => listings.id, { onDelete: "cascade" })
      .notNull(),
    buyerId: uuid("buyer_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),

    // Offer details (using exact numeric type to avoid floating-point errors)
    offerPricePerSqFt: money("offer_price_per_sq_ft").notNull(),
    quantitySqFt: money("quantity_sq_ft").notNull(),
    totalPrice: money("total_price").notNull(),

    // Counter offer
    counterPricePerSqFt: money("counter_price_per_sq_ft"),

    // Negotiation tracking
    currentRound: integer("current_round").default(1).notNull(),
    lastActorId: uuid("last_actor_id").references(() => users.id, {
      onDelete: "set null",
    }),

    // Status
    status: offerStatusEnum("status").notNull().default("pending"),

    // Messages
    message: text("message"),
    counterMessage: text("counter_message"),

    // Expiration — null means no expiration (offers don't expire unless a counter sets a deadline)
    expiresAt: timestamp("expires_at", { withTimezone: true }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("offers_listing_id_idx").on(table.listingId),
    index("offers_buyer_id_idx").on(table.buyerId),
    index("offers_seller_id_idx").on(table.sellerId),
    index("offers_status_idx").on(table.status),
    index("offers_created_at_idx").on(table.createdAt),
    index("offers_expires_at_idx").on(table.expiresAt),
  ]
);

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
