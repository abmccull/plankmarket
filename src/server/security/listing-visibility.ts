import { TRPCError } from "@trpc/server";
import { and, eq, gte, isNotNull, or, sql } from "drizzle-orm";
import { isListingVisibleToBuyers } from "@/lib/listing-freshness";
import {
  normalizeUsStateCode,
  resolveSellingTerritoryEligibility,
} from "@/lib/selling-territory";
import { listings } from "@/server/db/schema";
import type { User } from "@/server/db/schema";

export type ListingVisibilityViewer =
  | Pick<
      User,
      "id" | "role" | "verificationStatus" | "businessState"
    >
  | null
  | undefined;

type ListingTerritory = {
  sellerId?: string | null;
  territoryMode?: "unrestricted" | "allowed_states" | null;
  allowedDestinationStates?: readonly (string | null | undefined)[] | null;
};

type TerritoryViewerScope =
  | { kind: "all" }
  | { kind: "owner"; viewerId: string }
  | { kind: "buyer_state"; destinationState: string }
  | { kind: "unrestricted_only" };

const US_STATE_CODE_PATTERN =
  "^(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$";

/**
 * Resolve the only server-trusted territory identity currently available.
 *
 * A buyer's business state is trusted only while their business verification
 * remains approved. Changing a verified business state resets verification,
 * so a buyer cannot self-edit this field to enumerate another territory.
 */
export function resolveTerritoryViewerScope(
  viewer: ListingVisibilityViewer,
): TerritoryViewerScope {
  if (viewer?.role === "admin") {
    return { kind: "all" };
  }

  if (viewer?.role === "seller") {
    return { kind: "owner", viewerId: viewer.id };
  }

  if (viewer?.role === "buyer" && viewer.verificationStatus === "verified") {
    const destinationState = normalizeUsStateCode(viewer.businessState);
    if (destinationState) {
      return { kind: "buyer_state", destinationState };
    }
  }

  return { kind: "unrestricted_only" };
}

/**
 * Pure visibility decision used by detail endpoints and notification fan-out.
 * Invalid or empty restricted-territory policies fail closed.
 */
export function isListingTerritoryVisibleToViewer(
  listing: ListingTerritory,
  viewer: ListingVisibilityViewer,
): boolean {
  const scope = resolveTerritoryViewerScope(viewer);

  if (scope.kind === "all") {
    return true;
  }

  if (
    scope.kind === "owner" &&
    listing.sellerId != null &&
    listing.sellerId === scope.viewerId
  ) {
    return true;
  }

  if (listing.territoryMode === "unrestricted") {
    return true;
  }

  if (
    listing.territoryMode !== "allowed_states" ||
    scope.kind !== "buyer_state"
  ) {
    return false;
  }

  return resolveSellingTerritoryEligibility({
    destinationState: scope.destinationState,
    mode: listing.territoryMode,
    allowedStates: listing.allowedDestinationStates,
  }).eligible;
}

function validRestrictedTerritoryWhere(destinationState: string) {
  const safeAllowedStates = sql`
    CASE
      WHEN jsonb_typeof(COALESCE(${listings.allowedDestinationStates}, '[]'::jsonb)) = 'array'
        THEN COALESCE(${listings.allowedDestinationStates}, '[]'::jsonb)
      ELSE '[]'::jsonb
    END
  `;

  return and(
    eq(listings.territoryMode, "allowed_states"),
    sql`${safeAllowedStates} @> ${JSON.stringify([destinationState])}::jsonb`,
    sql`NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(${safeAllowedStates}) AS allowed_state(value)
      WHERE allowed_state.value IS NULL
         OR allowed_state.value !~ ${US_STATE_CODE_PATTERN}
    )`,
  );
}

/**
 * SQL counterpart to isListingTerritoryVisibleToViewer(). Keeping territory
 * visibility in the query prevents hidden rows from leaking through totals,
 * pagination, facets, recommendation sets, or promotion carousels.
 */
export function listingTerritoryVisibleWhere(
  viewer: ListingVisibilityViewer,
) {
  const scope = resolveTerritoryViewerScope(viewer);
  const unrestricted = eq(listings.territoryMode, "unrestricted");

  if (scope.kind === "all") {
    return sql<boolean>`true`;
  }

  if (scope.kind === "owner") {
    return or(unrestricted, eq(listings.sellerId, scope.viewerId))!;
  }

  if (scope.kind === "buyer_state") {
    return or(
      unrestricted,
      validRestrictedTerritoryWhere(scope.destinationState),
    )!;
  }

  return unrestricted;
}

export function publicActiveListingWhere(
  now = new Date(),
  viewer?: ListingVisibilityViewer,
) {
  return and(
    eq(listings.status, "active"),
    isNotNull(listings.lastConfirmedAt),
    isNotNull(listings.confirmationDueAt),
    gte(listings.confirmationDueAt, now),
    listingTerritoryVisibleWhere(viewer),
  );
}

type BuyerVisibleListing = {
  status?: string | null;
  lastConfirmedAt?: Date | string | null;
  confirmationDueAt?: Date | string | null;
};

export function assertListingVisibleToBuyer<T extends BuyerVisibleListing>(
  listing: T | null | undefined,
  message = "Listing not found",
): T {
  if (!listing || !isListingVisibleToBuyers(listing)) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message,
    });
  }

  return listing;
}

type PublicViewerListing = BuyerVisibleListing & ListingTerritory;

export function assertListingVisibleToViewer<T extends PublicViewerListing>(
  listing: T | null | undefined,
  viewer: ListingVisibilityViewer,
  message = "Listing not found",
): T {
  const canViewPrivateListing =
    !!listing &&
    (viewer?.role === "admin" ||
      (viewer?.role === "seller" &&
        viewer.id === listing.sellerId));

  if (
    !listing ||
    (!canViewPrivateListing &&
      (!isListingVisibleToBuyers(listing) ||
        !isListingTerritoryVisibleToViewer(listing, viewer)))
  ) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message,
    });
  }

  return listing;
}
