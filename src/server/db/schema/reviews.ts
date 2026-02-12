import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { orders } from "./orders";

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .unique()
      .notNull(),
    reviewerId: uuid("reviewer_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    sellerId: uuid("seller_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),

    // Overall rating
    rating: integer("rating").notNull(), // 1-5, validated in application

    // Review content
    title: varchar("title", { length: 200 }),
    comment: text("comment"),

    // Detailed ratings
    communicationRating: integer("communication_rating"), // 1-5
    accuracyRating: integer("accuracy_rating"), // 1-5
    shippingRating: integer("shipping_rating"), // 1-5

    // Seller response
    sellerResponse: text("seller_response"),
    sellerRespondedAt: timestamp("seller_responded_at", {
      withTimezone: true,
    }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("reviews_reviewer_id_idx").on(table.reviewerId),
    index("reviews_seller_id_idx").on(table.sellerId),
    index("reviews_order_id_idx").on(table.orderId),
    index("reviews_rating_idx").on(table.rating),
    index("reviews_created_at_idx").on(table.createdAt),
  ]
);

export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
