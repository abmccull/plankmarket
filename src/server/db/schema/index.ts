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

export { reviews } from "./reviews";
export type { Review, NewReview } from "./reviews";

export { offers, offerStatusEnum } from "./offers";
export type { Offer, NewOffer } from "./offers";

export {
  disputes,
  disputeMessages,
  disputeStatusEnum,
} from "./disputes";
export type {
  Dispute,
  NewDispute,
  DisputeMessage,
  NewDisputeMessage,
} from "./disputes";

export { feedback } from "./feedback";
export type { Feedback, NewFeedback } from "./feedback";

// Relations
import { relations } from "drizzle-orm";
import { users } from "./users";
import { listings } from "./listings";
import { media } from "./media";
import { orders } from "./orders";
import { watchlist } from "./watchlist";
import { savedSearches } from "./saved-searches";
import { notifications } from "./notifications";
import { reviews } from "./reviews";
import { offers } from "./offers";
import { disputes, disputeMessages } from "./disputes";
import { feedback } from "./feedback";

export const usersRelations = relations(users, ({ many }) => ({
  listings: many(listings),
  buyerOrders: many(orders, { relationName: "buyerOrders" }),
  sellerOrders: many(orders, { relationName: "sellerOrders" }),
  watchlistItems: many(watchlist),
  savedSearches: many(savedSearches),
  notifications: many(notifications),
  reviewsGiven: many(reviews, { relationName: "reviewerReviews" }),
  reviewsReceived: many(reviews, { relationName: "sellerReviews" }),
  buyerOffers: many(offers, { relationName: "buyerOffers" }),
  sellerOffers: many(offers, { relationName: "sellerOffers" }),
  initiatedDisputes: many(disputes),
  disputeMessages: many(disputeMessages),
  feedback: many(feedback),
}));

export const listingsRelations = relations(listings, ({ one, many }) => ({
  seller: one(users, {
    fields: [listings.sellerId],
    references: [users.id],
  }),
  media: many(media),
  orders: many(orders),
  watchlistItems: many(watchlist),
  offers: many(offers),
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
  review: one(reviews, {
    fields: [orders.id],
    references: [reviews.orderId],
  }),
  dispute: one(disputes, {
    fields: [orders.id],
    references: [disputes.orderId],
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

export const reviewsRelations = relations(reviews, ({ one }) => ({
  reviewer: one(users, {
    fields: [reviews.reviewerId],
    references: [users.id],
    relationName: "reviewerReviews",
  }),
  seller: one(users, {
    fields: [reviews.sellerId],
    references: [users.id],
    relationName: "sellerReviews",
  }),
  order: one(orders, {
    fields: [reviews.orderId],
    references: [orders.id],
  }),
}));

export const offersRelations = relations(offers, ({ one }) => ({
  listing: one(listings, {
    fields: [offers.listingId],
    references: [listings.id],
  }),
  buyer: one(users, {
    fields: [offers.buyerId],
    references: [users.id],
    relationName: "buyerOffers",
  }),
  seller: one(users, {
    fields: [offers.sellerId],
    references: [users.id],
    relationName: "sellerOffers",
  }),
}));

export const disputesRelations = relations(disputes, ({ one, many }) => ({
  order: one(orders, {
    fields: [disputes.orderId],
    references: [orders.id],
  }),
  initiator: one(users, {
    fields: [disputes.initiatorId],
    references: [users.id],
  }),
  resolver: one(users, {
    fields: [disputes.resolvedBy],
    references: [users.id],
  }),
  messages: many(disputeMessages),
}));

export const disputeMessagesRelations = relations(
  disputeMessages,
  ({ one }) => ({
    dispute: one(disputes, {
      fields: [disputeMessages.disputeId],
      references: [disputes.id],
    }),
    sender: one(users, {
      fields: [disputeMessages.senderId],
      references: [users.id],
    }),
  })
);

export const feedbackRelations = relations(feedback, ({ one }) => ({
  user: one(users, {
    fields: [feedback.userId],
    references: [users.id],
  }),
}));
