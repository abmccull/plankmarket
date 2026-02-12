import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { money } from "../custom-types";
import { users } from "./users";
import { offers } from "./offers";

export const offerEventTypeEnum = pgEnum("offer_event_type", [
  "initial_offer",
  "counter",
  "accept",
  "reject",
  "withdraw",
  "expire",
]);

export const offerEvents = pgTable(
  "offer_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    offerId: uuid("offer_id")
      .references(() => offers.id, { onDelete: "cascade" })
      .notNull(),
    actorId: uuid("actor_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),

    // Event details
    eventType: offerEventTypeEnum("event_type").notNull(),
    pricePerSqFt: money("price_per_sq_ft"),
    quantitySqFt: money("quantity_sq_ft"),
    totalPrice: money("total_price"),
    message: text("message"),

    // Timestamp
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("offer_events_offer_id_idx").on(table.offerId),
    index("offer_events_actor_id_idx").on(table.actorId),
    index("offer_events_created_at_idx").on(table.createdAt),
  ]
);

export type OfferEvent = typeof offerEvents.$inferSelect;
export type NewOfferEvent = typeof offerEvents.$inferInsert;
