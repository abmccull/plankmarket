import { inngest } from "../client";
import { db } from "@/server/db";
import { savedSearches } from "@/server/db/schema/saved-searches";
import { listings } from "@/server/db/schema/listings";
import { notifications } from "@/server/db/schema/notifications";
import { users } from "@/server/db/schema/users";
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import zipcodes from "zipcodes";
import { sendEmailOrThrow } from "@/lib/email/delivery";
import { buildEmailIdempotencyKey } from "@/lib/email/delivery-policy";
import { env } from "@/env";
import { filtersToSearchParams } from "@/lib/utils/search-filters";
import { escapeHtml } from "@/lib/utils";
import type { SearchFilters } from "@/types";
import {
  isListingTerritoryVisibleToViewer,
  publicActiveListingWhere,
  type ListingVisibilityViewer,
} from "@/server/security/listing-visibility";
import { isListingVisibleToBuyers } from "@/lib/listing-freshness";
import { getDirectPurchaseUnitPrice } from "@/lib/listing-pricing";
import { listingMatchesSavedSearch } from "@/lib/saved-search-matching";
import { getDirectPurchaseUnitPriceSql } from "@/server/db/expressions/listing-pricing";

const DIGEST_FREQUENCY_INTERVALS = {
  daily: 24 * 60 * 60 * 1_000,
  weekly: 7 * 24 * 60 * 60 * 1_000,
} as const;

type DigestFrequency = keyof typeof DIGEST_FREQUENCY_INTERVALS;
type Viewer = NonNullable<ListingVisibilityViewer>;

interface AlertSearch {
  id: string;
  userId: string;
  name: string;
  filters: SearchFilters;
  lastAlertAt: Date | null;
  alertFrequency: "instant" | "daily" | "weekly";
  alertChannels: ("in_app" | "email")[];
  userEmail: string;
  userName: string | null;
  userRole: Viewer["role"];
  userVerificationStatus: Viewer["verificationStatus"];
  userBusinessState: Viewer["businessState"];
}

interface AlertListing {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  askPricePerSqFt: number;
  buyNowPrice: number | null;
  totalSqFt: number;
  materialType: string;
  species: string | null;
  colorFamily: string | null;
  finish: string | null;
  width: number | null;
  thickness: number | null;
  wearLayer: number | null;
  condition: string | null;
  certifications: string[] | null;
  brand: string | null;
  locationState: string | null;
  locationLat: number | null;
  locationLng: number | null;
}

function searchViewer(search: AlertSearch): Viewer {
  return {
    id: search.userId,
    role: search.userRole,
    verificationStatus: search.userVerificationStatus,
    businessState: search.userBusinessState,
  };
}

function normalizedSubjectName(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

async function createInAppAlertOnce(input: {
  search: AlertSearch;
  listings: AlertListing[];
  deliveryKey: string;
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    // The durable JSON delivery key is the replay marker. The transaction-level
    // advisory lock makes the check-and-insert atomic across concurrent Inngest
    // retries without requiring a schema migration or a global table lock.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`saved-search:${input.deliveryKey}`}))`,
    );

    const existing = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, input.search.userId),
          eq(notifications.type, "listing_match"),
          sql`${notifications.data}->>'emailDeliveryKey' = ${input.deliveryKey}`,
        ),
      )
      .limit(1);

    if (existing.length > 0) return false;

    const count = input.listings.length;
    await tx.insert(notifications).values({
      userId: input.search.userId,
      type: "listing_match",
      title: `${count} new match${count > 1 ? "es" : ""}`,
      message: `Your saved search "${input.search.name}" has ${count} new listing${count > 1 ? "s" : ""}.`,
      data: {
        savedSearchId: input.search.id,
        matchingListingIds: input.listings.map((listing) => listing.id),
        emailDeliveryKey: input.deliveryKey,
        alertFrequency: input.search.alertFrequency,
      },
    });

    return true;
  });
}

async function deliverSavedSearchAlert(
  search: AlertSearch,
  matchingListings: AlertListing[],
): Promise<{ emailAccepted: boolean; inAppCreated: boolean }> {
  const channels = search.alertChannels?.length
    ? search.alertChannels
    : ["email"];
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  const searchUrl = `${appUrl}/listings?${filtersToSearchParams(search.filters)}`;
  const deliveryKey = buildEmailIdempotencyKey(
    "saved_search_alert",
    search.id,
    ...matchingListings.map((listing) => listing.id).sort(),
  );
  let emailAccepted = false;
  let inAppCreated = false;

  if (channels.includes("email")) {
    const safeSearchName = normalizedSubjectName(search.name);
    await sendEmailOrThrow({
      category: "saved_search_alert",
      idempotencyKey: deliveryKey,
      message: {
        from: env.EMAIL_FROM,
        to: search.userEmail,
        subject: `${matchingListings.length} new listing${matchingListings.length > 1 ? "s" : ""} match "${safeSearchName}"`,
        html: `
          <p>Hi ${escapeHtml(search.userName ?? "")},</p>
          <p>We found ${matchingListings.length} new listing${matchingListings.length > 1 ? "s" : ""} that match your saved search "${escapeHtml(search.name)}":</p>
          <ul>
            ${matchingListings
              .map((listing) => {
                const listingHref = `${appUrl}/listings/${encodeURIComponent(listing.slug ?? listing.id)}`;
                return `
                  <li>
                    <strong>${escapeHtml(listing.title)}</strong><br/>
                    $${getDirectPurchaseUnitPrice(listing).toFixed(2)}/sq ft direct purchase &bull; ${listing.totalSqFt} sq ft<br/>
                    ${escapeHtml(listing.materialType)} &bull; ${escapeHtml(listing.condition ?? "")} &bull; ${escapeHtml(listing.locationState ?? "")}
                    <br/>
                    <a href="${listingHref}">View Listing</a>
                  </li>
                `;
              })
              .join("")}
          </ul>
          <p><a href="${searchUrl}">View all matches</a></p>
        `,
      },
    });
    emailAccepted = true;
  }

  if (channels.includes("in_app")) {
    inAppCreated = await createInAppAlertOnce({
      search,
      listings: matchingListings,
      deliveryKey,
    });
  }

  const deliveredAt = new Date();
  await db
    .update(savedSearches)
    .set({
      lastAlertAt: sql`greatest(
        coalesce(${savedSearches.lastAlertAt}, ${deliveredAt}),
        ${deliveredAt}
      )`,
    })
    .where(eq(savedSearches.id, search.id));

  return { emailAccepted, inAppCreated };
}

function buildDigestListingConditions(
  search: AlertSearch,
  lastChecked: Date,
  now: Date,
) {
  const filters = search.filters;
  const directPurchaseUnitPrice = getDirectPurchaseUnitPriceSql();
  const conditions = [
    publicActiveListingWhere(now, searchViewer(search)),
    gte(listings.createdAt, lastChecked),
  ];

  if (filters.query?.trim()) {
    const escapedQuery = filters.query
      .trim()
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    conditions.push(
      or(
        ilike(listings.title, `%${escapedQuery}%`),
        ilike(listings.description, `%${escapedQuery}%`),
        ilike(listings.brand, `%${escapedQuery}%`),
        ilike(listings.species, `%${escapedQuery}%`),
      )!,
    );
  }
  if (filters.materialType?.length) {
    conditions.push(inArray(listings.materialType, filters.materialType));
  }
  if (filters.species?.length) {
    conditions.push(inArray(listings.species, filters.species));
  }
  if (filters.colorFamily?.length) {
    conditions.push(inArray(listings.colorFamily, filters.colorFamily));
  }
  if (filters.finishType?.length) {
    conditions.push(inArray(listings.finish, filters.finishType));
  }
  if (filters.width?.length) {
    conditions.push(
      or(
        ...filters.width.map((width) =>
          and(
            gte(listings.width, width - 0.1),
            lte(listings.width, width + 0.1),
          ),
        ),
      )!,
    );
  }
  if (filters.thickness?.length) {
    conditions.push(
      or(
        ...filters.thickness.map((thickness) =>
          and(
            gte(listings.thickness, thickness - 0.1),
            lte(listings.thickness, thickness + 0.1),
          ),
        ),
      )!,
    );
  }
  if (filters.wearLayer?.length) {
    conditions.push(
      or(
        ...filters.wearLayer.map((wearLayer) =>
          and(
            gte(listings.wearLayer, wearLayer - 0.02),
            lte(listings.wearLayer, wearLayer + 0.02),
          ),
        ),
      )!,
    );
  }
  if (filters.priceMin !== undefined) {
    conditions.push(gte(directPurchaseUnitPrice, filters.priceMin));
  }
  if (filters.priceMax !== undefined) {
    conditions.push(lte(directPurchaseUnitPrice, filters.priceMax));
  }
  if (filters.condition?.length) {
    conditions.push(inArray(listings.condition, filters.condition));
  }
  if (filters.state?.length) {
    conditions.push(inArray(listings.locationState, filters.state));
  }
  if (filters.certifications?.length) {
    conditions.push(
      sql`coalesce(${listings.certifications}, '[]'::jsonb) ?| ${filters.certifications}`,
    );
  }
  if (filters.minLotSize !== undefined) {
    conditions.push(gte(listings.totalSqFt, filters.minLotSize));
  }
  if (filters.maxLotSize !== undefined) {
    conditions.push(lte(listings.totalSqFt, filters.maxLotSize));
  }

  if (filters.buyerZip && filters.maxDistance && filters.maxDistance > 0) {
    const origin = zipcodes.lookup(filters.buyerZip);
    if (origin) {
      conditions.push(
        sql`(
          3959 * acos(
            cos(radians(${origin.latitude})) *
            cos(radians(${listings.locationLat})) *
            cos(radians(${listings.locationLng}) - radians(${origin.longitude}))
            + sin(radians(${origin.latitude})) *
            sin(radians(${listings.locationLat}))
          )
        ) <= ${filters.maxDistance}`,
      );
    }
  }

  return conditions;
}

const alertListingSelection = {
  id: listings.id,
  slug: listings.slug,
  title: listings.title,
  description: listings.description,
  askPricePerSqFt: listings.askPricePerSqFt,
  buyNowPrice: listings.buyNowPrice,
  totalSqFt: listings.totalSqFt,
  materialType: listings.materialType,
  species: listings.species,
  colorFamily: listings.colorFamily,
  finish: listings.finish,
  width: listings.width,
  thickness: listings.thickness,
  wearLayer: listings.wearLayer,
  condition: listings.condition,
  certifications: listings.certifications,
  brand: listings.brand,
  locationState: listings.locationState,
  locationLat: listings.locationLat,
  locationLng: listings.locationLng,
};

const alertSearchSelection = {
  id: savedSearches.id,
  userId: savedSearches.userId,
  name: savedSearches.name,
  filters: savedSearches.filters,
  lastAlertAt: savedSearches.lastAlertAt,
  alertFrequency: savedSearches.alertFrequency,
  alertChannels: savedSearches.alertChannels,
  userEmail: users.email,
  userName: users.name,
  userRole: users.role,
  userVerificationStatus: users.verificationStatus,
  userBusinessState: users.businessState,
};

/**
 * True instant alerts: listing publication emits listing/created and this
 * function fans that one listing out to matching instant searches.
 */
export const instantSavedSearchAlerts = inngest.createFunction(
  {
    id: "instant-saved-search-alerts",
    name: "Send Instant Saved Search Alerts",
  },
  { event: "listing/created" },
  async ({ event, step }) => {
    const listing = await step.run("fetch-published-listing", async () => {
      return db.query.listings.findFirst({
        where: eq(listings.id, event.data.listingId),
      });
    });

    if (!listing || !isListingVisibleToBuyers(listing)) {
      return {
        listingId: event.data.listingId,
        searchesMatched: 0,
        skipped: "listing_not_public",
      };
    }

    const searches = (await step.run("find-matching-instant-searches", async () => {
      const candidates = await db
        .select(alertSearchSelection)
        .from(savedSearches)
        .innerJoin(users, eq(savedSearches.userId, users.id))
        .where(
          and(
            eq(savedSearches.alertEnabled, true),
            eq(savedSearches.alertFrequency, "instant"),
          ),
        );

      return candidates.filter(
        (search) =>
          search.userId !== listing.sellerId &&
          isListingTerritoryVisibleToViewer(listing, searchViewer(search)) &&
          listingMatchesSavedSearch(listing, search.filters),
      );
    })) as AlertSearch[];

    const deliveryResults = await step.run("fan-out-instant-alerts", async () => {
      const results = [];
      const failures: unknown[] = [];

      for (const search of searches) {
        try {
          results.push(
            await deliverSavedSearchAlert(search, [listing as AlertListing]),
          );
        } catch (error) {
          failures.push(error);
          console.error("Failed to deliver instant saved-search alert", {
            listingId: listing.id,
            savedSearchId: search.id,
            error:
              error instanceof Error
                ? `${error.name}: ${error.message}`.slice(0, 1_000)
                : "UnknownError",
          });
        }
      }

      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          "One or more instant saved-search alerts failed",
        );
      }

      return results;
    });

    return {
      listingId: listing.id,
      searchesMatched: searches.length,
      deliveriesCompleted: deliveryResults.length,
    };
  },
);

/**
 * Daily and weekly digest tiers remain scheduled. Instant searches are
 * deliberately excluded so an event alert can never be resent by the digest.
 */
export const savedSearchAlerts = inngest.createFunction(
  { id: "saved-search-digests", name: "Send Saved Search Digests" },
  { cron: "0 */4 * * *" },
  async ({ step }) => {
    const searches = (await step.run("fetch-digest-searches", async () => {
      return db
        .select(alertSearchSelection)
        .from(savedSearches)
        .innerJoin(users, eq(savedSearches.userId, users.id))
        .where(
          and(
            eq(savedSearches.alertEnabled, true),
            inArray(savedSearches.alertFrequency, ["daily", "weekly"]),
          ),
        );
    })) as AlertSearch[];

    const alertsSent = await step.run("process-digest-alerts", async () => {
      let sentCount = 0;
      const failures: unknown[] = [];

      for (const search of searches) {
        try {
          const frequency = search.alertFrequency as DigestFrequency;
          const intervalMs = DIGEST_FREQUENCY_INTERVALS[frequency];
          if (!intervalMs) continue;

          const now = new Date();
          if (
            search.lastAlertAt &&
            now.getTime() - search.lastAlertAt.getTime() < intervalMs
          ) {
            continue;
          }

          const lastChecked =
            search.lastAlertAt ?? new Date(now.getTime() - intervalMs);
          const conditions = buildDigestListingConditions(
            search,
            lastChecked,
            now,
          );
          const matchingListings = (await db
            .select(alertListingSelection)
            .from(listings)
            .where(and(...conditions))
            .orderBy(desc(listings.createdAt))
            .limit(10)) as AlertListing[];

          if (matchingListings.length === 0) continue;

          await deliverSavedSearchAlert(search, matchingListings);
          sentCount += 1;
        } catch (error) {
          failures.push(error);
          console.error("Failed to process saved-search digest", {
            savedSearchId: search.id,
            error:
              error instanceof Error
                ? `${error.name}: ${error.message}`.slice(0, 1_000)
                : "UnknownError",
          });
        }
      }

      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          "One or more saved-search digests failed",
        );
      }

      return sentCount;
    });

    return { totalSearches: searches.length, alertsSent };
  },
);
