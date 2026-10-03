import { and, eq, gt, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import zipcodes from "zipcodes";
import { listings, users } from "@/server/db/schema";
import type { SearchFilters } from "@/types";
import {
  publicActiveListingWhere,
  type ListingVisibilityViewer,
} from "@/server/security/listing-visibility";
import { getDirectPurchaseUnitPriceSql } from "@/server/db/expressions/listing-pricing";
import { getMinimumAvailableStockSql, getNoKnownQuantityConflictSql } from "@/server/db/expressions/listing-quantity-fit";
import {
  getListingBoundingBoxConditions,
  getListingDistanceMilesSql,
} from "@/server/db/expressions/listing-geo";
import { MIN_PUBLIC_SEARCH_QUERY_LENGTH } from "@/lib/validators/listing";

type Viewer = NonNullable<ListingVisibilityViewer>;
export interface SavedSearchConditionInput {
  filters: SearchFilters;
  lastAlertAt: Date | null;
  userId: string;
  userRole: Viewer["role"];
  userVerificationStatus: Viewer["verificationStatus"];
  userBusinessState: Viewer["businessState"];
}
function searchViewer(search: SavedSearchConditionInput): Viewer {
  return {
    id: search.userId,
    role: search.userRole,
    verificationStatus: search.userVerificationStatus,
    businessState: search.userBusinessState,
  };
}

export function buildDigestListingConditions(
  search: SavedSearchConditionInput,
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
    conditions.push(getMinimumAvailableStockSql(filters.minLotSize));
  }
  if (filters.hideQuantityConflicts && filters.minLotSize !== undefined && filters.minLotSize > 0) {
    conditions.push(getNoKnownQuantityConflictSql(filters.minLotSize));
  }
  if (filters.maxLotSize !== undefined) {
    conditions.push(lte(listings.totalSqFt, filters.maxLotSize));
  }

  if (filters.waterproofRequired === true) {
    conditions.push(
      sql`${listings.waterResistance} = 'waterproof' AND ${listings.specificationProvenance} = 'evidence_reviewed' AND ${listings.specificationReviewedAt} IS NOT NULL AND ${listings.specificationEvidenceId} IS NOT NULL`,
    );
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
