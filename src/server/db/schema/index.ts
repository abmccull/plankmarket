// Schema barrel exports
export { users, userRoleEnum } from "./users";
export type { User, NewUser } from "./users";

export {
  listings,
  listingStatusEnum,
  materialTypeEnum,
  finishTypeEnum,
  gradeTypeEnum,
  conditionTypeEnum,
  reasonCodeEnum,
} from "./listings";
export type { Listing, NewListing } from "./listings";

export { media } from "./media";
export type { Media, NewMedia } from "./media";

export { orders, orderStatusEnum } from "./orders";
export type { Order, NewOrder } from "./orders";

export { watchlist } from "./watchlist";
export type { Watchlist, NewWatchlist } from "./watchlist";

export { savedSearches } from "./saved-searches";
export type { SavedSearch, NewSavedSearch } from "./saved-searches";

export { notifications, notificationTypeEnum } from "./notifications";
export type { Notification, NewNotification } from "./notifications";

// Relations
import { relations } from "drizzle-orm";
import { users } from "./users";
import { listings } from "./listings";
import { media } from "./media";
import { orders } from "./orders";
import { watchlist } from "./watchlist";
import { savedSearches } from "./saved-searches";
import { notifications } from "./notifications";

export const usersRelations = relations(users, ({ many }) => ({
  listings: many(listings),
  buyerOrders: many(orders, { relationName: "buyerOrders" }),
  sellerOrders: many(orders, { relationName: "sellerOrders" }),
  watchlistItems: many(watchlist),
  savedSearches: many(savedSearches),
  notifications: many(notifications),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  seller: one(users, {
    fields: [listings.sellerId],
    references: [users.id],
  }),
  media: many(media),
  orders: many(orders),
  watchlistItems: many(watchlist),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  listing: one(listings, {
    fields: [media.listingId],
    references: [listings.id],
  }),
}));

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

export const watchlistRelations = relations(watchlist, ({ one }) => ({
  user: one(users, {
    fields: [watchlist.userId],
    references: [users.id],
  }),
  listing: one(listings, {
    fields: [watchlist.listingId],
    references: [listings.id],
  }),
}));

export const savedSearchesRelations = relations(savedSearches, ({ one }) => ({
  user: one(users, {
    fields: [savedSearches.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));
