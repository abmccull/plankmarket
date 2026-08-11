import { inngest } from "../client";
import { db } from "@/server/db";
import { savedSearches } from "@/server/db/schema/saved-searches";
import { listings } from "@/server/db/schema/listings";
import { notifications } from "@/server/db/schema/notifications";
import { users } from "@/server/db/schema/users";
import {
  and,
  asc,
  desc,
  eq,
  gt,
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
import {
  getListingBoundingBoxConditions,
  getListingDistanceMilesSql,
} from "@/server/db/expressions/listing-geo";
import { MIN_PUBLIC_SEARCH_QUERY_LENGTH } from "@/lib/validators/listing";

const DIGEST_FREQUENCY_INTERVALS = {
  daily: 24 * 60 * 60 * 1_000,
  weekly: 7 * 24 * 60 * 60 * 1_000,
} as const;

export const DIGEST_BATCH_SIZE = 25;
const INSTANT_SEARCH_PAGE_SIZE = 200;

type DigestFrequency = keyof typeof DIGEST_FREQUENCY_INTERVALS;
type Viewer = NonNullable<ListingVisibilityViewer>;
type DigestDateValue = Date | string;

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
  createdAt: Date;
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

export interface DigestSearchCandidate {
  id: string;
  alertFrequency: "instant" | "daily" | "weekly";
  createdAt: DigestDateValue;
  lastAlertAt: DigestDateValue | null;
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

function parseDigestDate(value: DigestDateValue): Date {
  return value instanceof Date ? value : new Date(value);
}

function parseOptionalDigestDate(value: DigestDateValue | null): Date | null {
  return value == null ? null : parseDigestDate(value);
}

function hydrateAlertSearch(search: DigestSearchCandidate & Omit<AlertSearch, keyof DigestSearchCandidate>): AlertSearch {
  return {
    ...search,
    createdAt: parseDigestDate(search.createdAt),
    lastAlertAt: parseOptionalDigestDate(search.lastAlertAt),
  };
}

export function getDigestIntervalMs(
  frequency: DigestSearchCandidate["alertFrequency"],
): number | null {
  if (frequency === "instant") return null;
  return DIGEST_FREQUENCY_INTERVALS[frequency];
}

export function getDigestDueAt(search: DigestSearchCandidate): Date | null {
  const intervalMs = getDigestIntervalMs(search.alertFrequency);
  if (!intervalMs) return null;

  return new Date(
    parseDigestDate(search.lastAlertAt ?? search.createdAt).getTime() +
      intervalMs,
  );
}

export function isDigestSearchDue(
  search: DigestSearchCandidate,
  now: Date,
): boolean {
  const dueAt = getDigestDueAt(search);
  return dueAt !== null && dueAt.getTime() <= now.getTime();
}

export function getDigestWindowStart(search: DigestSearchCandidate): Date {
  return parseDigestDate(search.lastAlertAt ?? search.createdAt);
}

function compareDigestPriority(
  left: DigestSearchCandidate,
  right: DigestSearchCandidate,
): number {
  const leftDueAt = getDigestDueAt(left);
  const rightDueAt = getDigestDueAt(right);

  if (leftDueAt && rightDueAt) {
    const dueDelta = leftDueAt.getTime() - rightDueAt.getTime();
    if (dueDelta !== 0) return dueDelta;
  }

  const createdDelta =
    parseDigestDate(left.createdAt).getTime() -
    parseDigestDate(right.createdAt).getTime();
  if (createdDelta !== 0) return createdDelta;

  return left.id.localeCompare(right.id);
}

export function selectDueDigestBatch<T extends DigestSearchCandidate>(
  searches: readonly T[],
  now: Date,
  limit: number,
): T[] {
  return searches
    .filter((search) => isDigestSearchDue(search, now))
    .slice()
    .sort(compareDigestPriority)
    .slice(0, limit);
}

export function hasMoreDigestCandidates(
  dailyCandidateCount: number,
  weeklyCandidateCount: number,
  limit = DIGEST_BATCH_SIZE,
): boolean {
  return (
    dailyCandidateCount === limit ||
    weeklyCandidateCount === limit ||
    dailyCandidateCount + weeklyCandidateCount > limit
  );
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
  evaluatedThrough = new Date(),
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

  await db
    .update(savedSearches)
    .set({
      lastAlertAt: sql`greatest(
        coalesce(${savedSearches.lastAlertAt}, ${evaluatedThrough}),
        ${evaluatedThrough}
      )`,
    })
    .where(eq(savedSearches.id, search.id));

  return { emailAccepted, inAppCreated };
}

export function buildDigestListingConditions(
  search: AlertSearch,
  lastChecked: Date,
  now: Date,
) {
  const filters = search.filters;
  const directPurchaseUnitPrice = getDirectPurchaseUnitPriceSql();
  const conditions = [
    publicActiveListingWhere(now, searchViewer(search)),
    search.lastAlertAt
      ? gt(listings.publishedAt, lastChecked)
      : gte(listings.publishedAt, lastChecked),
    lte(listings.publishedAt, now),
  ];

  const normalizedQuery = filters.query?.trim();
  if (
    normalizedQuery &&
    normalizedQuery.length < MIN_PUBLIC_SEARCH_QUERY_LENGTH
  ) {
    // Legacy saved searches may predate the public minimum. Fail closed instead
    // of turning an unindexed short query into a broad digest scan.
    conditions.push(sql<boolean>`false`);
  } else if (normalizedQuery) {
    const escapedQuery = normalizedQuery
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
    conditions.push(ilike(listings.searchDocument, `%${escapedQuery}%`));
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

  if (filters.sellerVerified === true) {
    conditions.push(sql<boolean>`exists (
      select 1
      from ${users}
      where ${users.id} = ${listings.sellerId}
        and ${users.verificationStatus} = 'verified'
    )`);
  }

  if (filters.freightReady === true) {
    conditions.push(sql<boolean>`
      ${listings.palletWeight} is not null
      and ${listings.palletLength} is not null
      and ${listings.palletWidth} is not null
      and ${listings.palletHeight} is not null
      and nullif(btrim(${listings.locationZip}), '') is not null
      and nullif(btrim(${listings.locationCity}), '') is not null
      and ${listings.locationState} is not null
      and nullif(btrim(${listings.freightClass}), '') is not null
      and ${listings.totalPallets} is not null
      and ${listings.sqFtPerBox} is not null
      and ${listings.boxesPerPallet} is not null
      and exists (
        select 1
        from ${users}
        where ${users.id} = ${listings.sellerId}
          and nullif(btrim(${users.businessAddress}), '') is not null
          and nullif(btrim(${users.phone}), '') is not null
      )
    `);
  }

  if (filters.fullLotOnly !== undefined) {
    conditions.push(eq(listings.fullLotOnly, filters.fullLotOnly));
  }

  if (filters.buyerZip && filters.maxDistance && filters.maxDistance > 0) {
    const origin = zipcodes.lookup(filters.buyerZip);
    if (origin) {
      conditions.push(
        ...getListingBoundingBoxConditions(origin, filters.maxDistance),
        lte(
          getListingDistanceMilesSql(origin.latitude, origin.longitude),
          filters.maxDistance,
        ),
      );
    }
  }

  return conditions;
}

const alertListingSelection = {
  id: listings.id,
  sellerId: listings.sellerId,
  slug: listings.slug,
  title: listings.title,
  description: listings.description,
  status: listings.status,
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
  territoryMode: listings.territoryMode,
  allowedDestinationStates: listings.allowedDestinationStates,
  lastConfirmedAt: listings.lastConfirmedAt,
  confirmationDueAt: listings.confirmationDueAt,
  sellerVerificationStatus: users.verificationStatus,
  businessAddress: users.businessAddress,
  phone: users.phone,
  locationCity: listings.locationCity,
  locationZip: listings.locationZip,
  freightClass: listings.freightClass,
  totalPallets: listings.totalPallets,
  sqFtPerBox: listings.sqFtPerBox,
  boxesPerPallet: listings.boxesPerPallet,
  palletWeight: listings.palletWeight,
  palletLength: listings.palletLength,
  palletWidth: listings.palletWidth,
  palletHeight: listings.palletHeight,
  fullLotOnly: listings.fullLotOnly,
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
  createdAt: savedSearches.createdAt,
};

/** Queue a stable snapshot scan. Each worker invocation handles one bounded
 * page so a large saved-search population cannot create an unbounded run. */
export const instantSavedSearchAlerts = inngest.createFunction(
  {
    id: "instant-saved-search-alerts",
    name: "Send Instant Saved Search Alerts",
  },
  { event: "listing/created" },
  async ({ event, step }) => {
    const scanStartedAt = new Date().toISOString();
    await step.sendEvent("queue-instant-saved-search-page", {
      id: `saved-search-instant:${event.data.listingId}:start`,
      name: "saved-search/instant-page",
      data: {
        listingId: event.data.listingId,
        scanStartedAt,
      },
    });

    return {
      listingId: event.data.listingId,
      queued: true,
      scanStartedAt,
    };
  },
);

export const instantSavedSearchAlertPage = inngest.createFunction(
  {
    id: "instant-saved-search-alert-page",
    name: "Process Instant Saved Search Alert Page",
  },
  { event: "saved-search/instant-page" },
  async ({ event, step }) => {
    const listing = await step.run("fetch-published-listing", async () => {
      const [match] = await db
        .select(alertListingSelection)
        .from(listings)
        .innerJoin(users, eq(users.id, listings.sellerId))
        .where(eq(listings.id, event.data.listingId))
        .limit(1);
      return match;
    });

    if (!listing || !isListingVisibleToBuyers(listing)) {
      return {
        listingId: event.data.listingId,
        searchesMatched: 0,
        skipped: "listing_not_public",
      };
    }

    const scanStartedAt = new Date(event.data.scanStartedAt);
    if (Number.isNaN(scanStartedAt.getTime())) {
      throw new Error("Invalid instant saved-search scan timestamp");
    }

    const page = await step.run("fetch-instant-search-page", async () => {
      return db
        .select(alertSearchSelection)
        .from(savedSearches)
        .innerJoin(users, eq(savedSearches.userId, users.id))
        .where(
          and(
            eq(savedSearches.alertEnabled, true),
            eq(savedSearches.alertFrequency, "instant"),
            lte(savedSearches.createdAt, scanStartedAt),
            event.data.afterSearchId
              ? gt(savedSearches.id, event.data.afterSearchId)
              : undefined,
          ),
        )
        .orderBy(asc(savedSearches.id))
        .limit(INSTANT_SEARCH_PAGE_SIZE);
    });

    const deliveryResult = await step.run("deliver-instant-search-page", async () => {
        let searchesMatched = 0;
        let deliveriesCompleted = 0;
        const failures: unknown[] = [];

        for (const candidate of page) {
          const search = hydrateAlertSearch(candidate);
          if (
            search.userId === listing.sellerId ||
            !isListingTerritoryVisibleToViewer(listing, searchViewer(search)) ||
            !listingMatchesSavedSearch(listing, search.filters)
          ) {
            continue;
          }

          searchesMatched += 1;
          try {
            await deliverSavedSearchAlert(search, [listing as AlertListing]);
            deliveriesCompleted += 1;
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

        return {
          searchesMatched,
          deliveriesCompleted,
        };
    });

    const lastSearchId = page.at(-1)?.id;
    const hasNextPage =
      page.length === INSTANT_SEARCH_PAGE_SIZE && lastSearchId !== undefined;
    if (hasNextPage) {
      await step.sendEvent("queue-next-instant-saved-search-page", {
        id: `saved-search-instant:${listing.id}:${lastSearchId}`,
        name: "saved-search/instant-page",
        data: {
          listingId: listing.id,
          scanStartedAt: event.data.scanStartedAt,
          afterSearchId: lastSearchId,
        },
      });
    }

    return {
      listingId: listing.id,
      candidateRowsScanned: page.length,
      searchesMatched: deliveryResult.searchesMatched,
      deliveriesCompleted: deliveryResult.deliveriesCompleted,
      hasNextPage,
    };
  },
);

/**
 * Daily and weekly digest tiers remain scheduled. Instant searches are
 * deliberately excluded so an event alert can never be resent by the digest.
 */
export const savedSearchDigestScheduler = inngest.createFunction(
  {
    id: "saved-search-digest-scheduler",
    name: "Queue Saved Search Digests",
  },
  { cron: "0 */4 * * *" },
  async ({ step }) => {
    const scanStartedAt = await step.run("capture-digest-scan-start", () =>
      new Date().toISOString(),
    );
    await step.sendEvent("queue-first-digest-page", {
      id: `saved-search-digest:${scanStartedAt}:0`,
      name: "saved-search/digest-page",
      data: { scanStartedAt, page: 0 },
    });

    return { queued: true, scanStartedAt };
  },
);

export const savedSearchAlerts = inngest.createFunction(
  { id: "saved-search-digests", name: "Send Saved Search Digests" },
  { event: "saved-search/digest-page" },
  async ({ event, step }) => {
    const now = new Date(event.data.scanStartedAt);
    if (Number.isNaN(now.getTime())) {
      throw new Error("Invalid saved-search digest scan timestamp");
    }
    if (!Number.isInteger(event.data.page) || event.data.page < 0) {
      throw new Error("Invalid saved-search digest page");
    }
    const digestBatchResult = await step.run("select-digest-search-batch", async () => {
      const dailyDueCutoff = new Date(
        now.getTime() - DIGEST_FREQUENCY_INTERVALS.daily,
      );
      const weeklyDueCutoff = new Date(
        now.getTime() - DIGEST_FREQUENCY_INTERVALS.weekly,
      );

      const lastEvaluatedAt = sql<Date>`coalesce(
        ${savedSearches.lastAlertAt},
        ${savedSearches.createdAt}
      )`;
      const dueOrder = [asc(lastEvaluatedAt), asc(savedSearches.id)] as const;

      const [dailyDue, weeklyDue] = await Promise.all([
        db
          .select(alertSearchSelection)
          .from(savedSearches)
          .innerJoin(users, eq(savedSearches.userId, users.id))
          .where(
            and(
              eq(savedSearches.alertEnabled, true),
              eq(savedSearches.alertFrequency, "daily"),
              lte(lastEvaluatedAt, dailyDueCutoff),
            ),
          )
          .orderBy(...dueOrder)
          .limit(DIGEST_BATCH_SIZE),
        db
          .select(alertSearchSelection)
          .from(savedSearches)
          .innerJoin(users, eq(savedSearches.userId, users.id))
          .where(
            and(
              eq(savedSearches.alertEnabled, true),
              eq(savedSearches.alertFrequency, "weekly"),
              lte(lastEvaluatedAt, weeklyDueCutoff),
            ),
          )
          .orderBy(...dueOrder)
          .limit(DIGEST_BATCH_SIZE),
      ]);

      const dueCandidates = [...dailyDue, ...weeklyDue];
      const moreCandidatesLikely = hasMoreDigestCandidates(
        dailyDue.length,
        weeklyDue.length,
      );

      return {
        searches: selectDueDigestBatch(dueCandidates, now, DIGEST_BATCH_SIZE),
        candidatePagesScanned: 2,
        candidateRowsScanned: dueCandidates.length,
        dueSearchesFound: dueCandidates.length,
        moreCandidatesLikely,
      };
    });
    const digestBatch = {
      ...digestBatchResult,
      searches: digestBatchResult.searches.map(hydrateAlertSearch),
    };

    const alertsSent = await step.run("process-digest-alerts", async () => {
      let sentCount = 0;
      const failures: unknown[] = [];

      for (const search of digestBatch.searches) {
        try {
          const frequency = search.alertFrequency as DigestFrequency;
          if (!DIGEST_FREQUENCY_INTERVALS[frequency]) continue;

          if (!isDigestSearchDue(search, now)) {
            continue;
          }

          const lastChecked = getDigestWindowStart(search);
          const conditions = buildDigestListingConditions(
            search,
            lastChecked,
            now,
          );
          const matchingListings = (await db
            .select(alertListingSelection)
            .from(listings)
            .innerJoin(users, eq(users.id, listings.sellerId))
            .where(and(...conditions))
            .orderBy(desc(listings.publishedAt))
            .limit(10)) as AlertListing[];

          if (matchingListings.length === 0) {
            // lastAlertAt is also the digest evaluation cursor. Advancing it on
            // an empty result keeps due searches from being re-scanned every
            // four hours while retaining the exact next window boundary.
            await db
              .update(savedSearches)
              .set({
                lastAlertAt: sql`greatest(
                  coalesce(${savedSearches.lastAlertAt}, ${now}),
                  ${now}
                )`,
              })
              .where(eq(savedSearches.id, search.id));
            continue;
          }

          // Advance only through the query's upper bound. Using the later email
          // completion time here could skip a listing created during delivery.
          await deliverSavedSearchAlert(search, matchingListings, now);
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

    if (digestBatch.moreCandidatesLikely) {
      const nextPage = event.data.page + 1;
      await step.sendEvent("queue-next-digest-page", {
        id: `saved-search-digest:${event.data.scanStartedAt}:${nextPage}`,
        name: "saved-search/digest-page",
        data: {
          scanStartedAt: event.data.scanStartedAt,
          page: nextPage,
        },
      });
    }

    return {
      page: event.data.page,
      candidatePagesScanned: digestBatch.candidatePagesScanned,
      candidateRowsScanned: digestBatch.candidateRowsScanned,
      dueSearchesFound: digestBatch.dueSearchesFound,
      batchSize: digestBatch.searches.length,
      moreCandidatesLikely: digestBatch.moreCandidatesLikely,
      alertsSent,
    };
  },
);
