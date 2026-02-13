import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  index,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { orders } from "./orders";

// Tracking event interface for jsonb column
export interface TrackingEvent {
  timestamp: string;
  status: string;
  location: string;
  description: string;
}

// Shipment status enum
export const shipmentStatusEnum = pgEnum("shipment_status", [
  "pending",
  "dispatched",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
  "cancelled",
]);

// Shipments table for Priority1 LTL freight shipments
export const shipments = pgTable(
  "shipments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id, { onDelete: "restrict" }),
    quoteId: varchar("quote_id", { length: 255 }),

    // Priority1 IDs
    priority1ShipmentId: varchar("priority1_shipment_id", { length: 255 }),
    proNumber: varchar("pro_number", { length: 255 }),

    // Carrier info
    carrierName: varchar("carrier_name", { length: 255 }),
    carrierScac: varchar("carrier_scac", { length: 10 }),

    // Status
    status: shipmentStatusEnum("status").notNull().default("pending"),

    // Document URLs
    bolUrl: text("bol_url"),
    labelUrl: text("label_url"),
    deliveryReceiptUrl: text("delivery_receipt_url"),

    // Tracking events
    trackingEvents: jsonb("tracking_events")
      .$type<TrackingEvent[]>()
      .default([]),

    // Error tracking
    lastError: text("last_error"),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    pickupDate: timestamp("pickup_date", { withTimezone: true }),
  },
  (table) => [
    index("shipments_order_id_idx").on(table.orderId),
    index("shipments_status_idx").on(table.status),
    index("shipments_priority1_shipment_id_idx").on(table.priority1ShipmentId),
    index("shipments_pro_number_idx").on(table.proNumber),
  ]
);

// Export types
export type Shipment = typeof shipments.$inferSelect;
export type NewShipment = typeof shipments.$inferInsert;
