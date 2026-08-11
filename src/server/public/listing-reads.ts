import "server-only";

import { TRPCError } from "@trpc/server";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { listings } from "@/server/db/schema";
import {
  publicListingColumns,
  publicMediaColumns,
  publicSellerColumns,
  toPublicListing,
} from "@/server/security/public-data";
import { assertListingVisibleToViewer, publicActiveListingWhere } from "@/server/security/listing-visibility";
import { resolveRequestViewerFromHeaders } from "@/server/trpc";
import { redis } from "@/lib/redis/client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getPublicListingByRouteParam(
  idOrSlug: string,
  requestHeaders: Headers,
) {
  const viewer = await resolveRequestViewerFromHeaders(requestHeaders, {
    allowAnonymousShortcut: true,
  });
  const requestedById = UUID_PATTERN.test(idOrSlug);

  const listing = await db.query.listings.findFirst({
    where: requestedById ? eq(listings.id, idOrSlug) : eq(listings.slug, idOrSlug),
    columns: publicListingColumns,
    with: {
      seller: {
        columns: publicSellerColumns,
      },
      media: {
        columns: publicMediaColumns,
        orderBy: (media, { asc: orderAsc }) => [orderAsc(media.sortOrder)],
      },
    },
  });

  if (!listing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Listing not found",
    });
  }

  assertListingVisibleToViewer(listing, viewer.user);

  return {
    listing: toPublicListing(listing),
    requestedById,
    viewerIdentifier: viewer.authUser?.id ?? `ip:${viewer.clientIp}`,
  };
}

export async function recordPublicListingView(
  listingId: string,
  viewerIdentifier: string,
) {
  const viewKey = `listing-view:${listingId}:${viewerIdentifier}`;
  const reserved = await redis.set(viewKey, "1", {
    nx: true,
    ex: 3600,
  });

  if (!reserved) {
    return false;
  }

  await db
    .update(listings)
    .set({ viewsCount: sql`${listings.viewsCount} + 1` })
    .where(eq(listings.id, listingId));

  return true;
}

export async function listPublicListingSitemapEntries() {
  return db
    .select({
      id: listings.id,
      slug: listings.slug,
      updatedAt: listings.updatedAt,
      createdAt: listings.createdAt,
    })
    .from(listings)
    .where(publicActiveListingWhere(new Date(), null))
    .orderBy(asc(listings.id));
}
