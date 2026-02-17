import { createTRPCRouter } from "../trpc";
import { authRouter } from "./auth";
import { listingRouter } from "./listing";
import { orderRouter } from "./order";
import { watchlistRouter } from "./watchlist";
import { searchRouter } from "./search";
import { paymentRouter } from "./payment";
import { uploadRouter } from "./upload";
import { promotionRouter } from "./promotion";
import { reviewRouter } from "./review";
import { offerRouter } from "./offer";
import { disputeRouter } from "./dispute";
import { feedbackRouter } from "./feedback";
import { adminRouter } from "./admin";
import { messageRouter } from "./message";
import { notificationRouter } from "./notification";
import { shippingRouter } from "./shipping";
import { preferencesRouter } from "./preferences";
import { buyerRequestRouter } from "./buyer-request";
import { matchingRouter } from "./matching";
import { listingAssistantRouter } from "./listing-assistant";
import { crmRouter } from "./crm";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  listing: listingRouter,
  order: orderRouter,
  watchlist: watchlistRouter,
  search: searchRouter,
  payment: paymentRouter,
  upload: uploadRouter,
  promotion: promotionRouter,
  review: reviewRouter,
  offer: offerRouter,
  dispute: disputeRouter,
  feedback: feedbackRouter,
  admin: adminRouter,
  message: messageRouter,
  notification: notificationRouter,
  shipping: shippingRouter,
  preferences: preferencesRouter,
  buyerRequest: buyerRequestRouter,
  matching: matchingRouter,
  listingAssistant: listingAssistantRouter,
  crm: crmRouter,
});

export type AppRouter = typeof appRouter;
