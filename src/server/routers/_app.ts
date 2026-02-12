import { createTRPCRouter } from "../trpc";
import { authRouter } from "./auth";
import { listingRouter } from "./listing";
import { orderRouter } from "./order";
import { watchlistRouter } from "./watchlist";
import { searchRouter } from "./search";
import { paymentRouter } from "./payment";
import { uploadRouter } from "./upload";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  listing: listingRouter,
  order: orderRouter,
  watchlist: watchlistRouter,
  search: searchRouter,
  payment: paymentRouter,
  upload: uploadRouter,
});

export type AppRouter = typeof appRouter;
