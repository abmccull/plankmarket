import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

type RouterOutputs = inferRouterOutputs<AppRouter>;

/** Full offer detail returned by `offer.getOfferById`, including listing, buyer, seller, and events. */
export type OfferDetail = RouterOutputs["offer"]["getOfferById"];

/** Single offer item from the `offer.getMyOffers` paginated list. */
export type OfferListItem = RouterOutputs["offer"]["getMyOffers"]["offers"][number];
