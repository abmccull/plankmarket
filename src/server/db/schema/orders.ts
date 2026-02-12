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
import { relations } from "drizzle-orm";
import { users } from "./users";
import { listings } from "./listings";

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

    // Quantity & pricing
    quantitySqFt: real("quantity_sq_ft").notNull(),
    pricePerSqFt: real("price_per_sq_ft").notNull(),
    subtotal: real("subtotal").notNull(), // quantitySqFt * pricePerSqFt
    buyerFee: real("buyer_fee").notNull(), // 3%
    sellerFee: real("seller_fee").notNull(), // 2%
    totalPrice: real("total_price").notNull(), // subtotal + buyerFee
    sellerPayout: real("seller_payout").notNull(), // subtotal - sellerFee

    // Payment
    stripePaymentIntentId: varchar("stripe_payment_intent_id", {
      length: 255,
    }),
    stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
    paymentStatus: varchar("payment_status", { length: 50 }).default("pending"),

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
    notes: text("notes"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
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

export const ordersRelations = relations(orders, ({ one }) => ({
  buyer: one(users, {
    fields: [orders.buyerId],
    references: [users.id],
    relationName: "buyerOrders",
  }),
  seller: one(users, {
    fields: [orders.sellerId],
    references: [users.id],
    relationName: "sellerOrders",
  }),
  listing: one(listings, {
    fields: [orders.listingId],
    references: [listings.id],
  }),
}));

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
