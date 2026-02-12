import {
  pgTable,
  uuid,
  text,
  varchar,
  real,
  timestamp,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { money } from "../custom-types";
import { users } from "./users";
import { listings } from "./listings";

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
]);

export const escrowStatusEnum = pgEnum("escrow_status", [
  "none",
  "held",
  "released",
  "refunded",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: varchar("order_number", { length: 20 }).unique().notNull(),
    buyerId: uuid("buyer_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    listingId: uuid("listing_id")
      .references(() => listings.id, { onDelete: "restrict" })
      .notNull(),

    // Quantity & pricing (using exact numeric type to avoid floating-point errors)
    quantitySqFt: real("quantity_sq_ft").notNull(),
    pricePerSqFt: money("price_per_sq_ft").notNull(),
    subtotal: money("subtotal").notNull(), // quantitySqFt * pricePerSqFt
    buyerFee: money("buyer_fee").notNull(), // 3%
    sellerFee: money("seller_fee").notNull(), // 2%
    totalPrice: money("total_price").notNull(), // subtotal + buyerFee
    sellerPayout: money("seller_payout").notNull(), // subtotal - sellerFee

    // Payment
    stripePaymentIntentId: varchar("stripe_payment_intent_id", {
      length: 255,
    }),
    stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
    paymentStatus: paymentStatusEnum("payment_status").default("pending"),

    // Shipping
    shippingName: varchar("shipping_name", { length: 255 }),
    shippingAddress: text("shipping_address"),
    shippingCity: varchar("shipping_city", { length: 100 }),
    shippingState: varchar("shipping_state", { length: 2 }),
    shippingZip: varchar("shipping_zip", { length: 10 }),
    shippingPhone: varchar("shipping_phone", { length: 20 }),
    trackingNumber: varchar("tracking_number", { length: 255 }),
    carrier: varchar("carrier", { length: 100 }),

    // Status
    status: orderStatusEnum("status").notNull().default("pending"),
    escrowStatus: escrowStatusEnum("escrow_status")
      .default("none")
      .notNull(),
    notes: text("notes"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (table) => [
    index("orders_buyer_id_idx").on(table.buyerId),
    index("orders_seller_id_idx").on(table.sellerId),
    index("orders_listing_id_idx").on(table.listingId),
    index("orders_status_idx").on(table.status),
    index("orders_created_at_idx").on(table.createdAt),
    index("orders_order_number_idx").on(table.orderNumber),
  ]
);

// Note: ordersRelations is defined in schema/index.ts to avoid duplicate definitions
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
