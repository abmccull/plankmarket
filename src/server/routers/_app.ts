import { createTRPCRouter } from "../trpc";
import { authRouter } from "./auth";
import { listingRouter } from "./listing";
import { orderRouter } from "./order";
import { watchlistRouter } from "./watchlist";
import { searchRouter } from "./search";
import { paymentRouter } from "./payment";
import { uploadRouter } from "./upload";
import { reviewRouter } from "./review";
import { offerRouter } from "./offer";
import { disputeRouter } from "./dispute";
import { feedbackRouter } from "./feedback";
import { adminRouter } from "./admin";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  listing: listingRouter,
  order: orderRouter,
  watchlist: watchlistRouter,
  search: searchRouter,
  payment: paymentRouter,
  upload: uploadRouter,
  review: reviewRouter,
  offer: offerRouter,
  dispute: disputeRouter,
  feedback: feedbackRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
