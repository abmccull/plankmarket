import zipcodes from "zipcodes";
import { getDirectPurchaseUnitPrice } from "@/lib/listing-pricing";
import type { SearchFilters } from "@/types";

const WIDTH_TOLERANCE = 0.1;
const THICKNESS_TOLERANCE = 0.1;
const WEAR_LAYER_TOLERANCE = 0.02;
const EARTH_RADIUS_MILES = 3_959;

export interface SavedSearchMatchListing {
  title: string;
  description?: string | null;
  materialType: string;
  species?: string | null;
  colorFamily?: string | null;
  finish?: string | null;
  width?: number | null;
  thickness?: number | null;
  wearLayer?: number | null;
  askPricePerSqFt: number;
  buyNowPrice?: number | null;
  condition?: string | null;
  locationState?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  certifications?: readonly string[] | null;
  totalSqFt: number;
  brand?: string | null;
}

function includesSelected(
  selected: readonly (string | number)[] | undefined,
  value: string | number | null | undefined,
): boolean {
  return !selected?.length || (value != null && selected.includes(value));
}

function matchesNumericSelection(
  selected: readonly number[] | undefined,
  value: number | null | undefined,
  tolerance: number,
): boolean {
  return (
    !selected?.length ||
    (value != null &&
      selected.some((candidate) => Math.abs(candidate - value) <= tolerance))
  );
}

function distanceMiles(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latDelta = toRadians(to.latitude - from.latitude);
  const lngDelta = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(lngDelta / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_MILES *
    Math.asin(Math.min(1, Math.sqrt(haversine)))
  );
}

/**
 * In-process counterpart to the public catalog filters. It is used for the
 * event-driven one-listing/one-event saved-search path, where loading the new
 * listing once and matching all instant searches is cheaper than issuing one
 * listing query per saved search.
 */
export function listingMatchesSavedSearch(
  listing: SavedSearchMatchListing,
  filters: SearchFilters,
): boolean {
  if (filters.query?.trim()) {
    const query = filters.query.trim().toLocaleLowerCase();
    const searchable = [
      listing.title,
      listing.description,
      listing.brand,
      listing.species,
    ]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLocaleLowerCase();
    if (!searchable.includes(query)) return false;
  }

  if (!includesSelected(filters.materialType, listing.materialType)) {
    return false;
  }
  if (!includesSelected(filters.species, listing.species)) return false;
  if (!includesSelected(filters.colorFamily, listing.colorFamily)) return false;
  if (!includesSelected(filters.finishType, listing.finish)) return false;
  if (!includesSelected(filters.condition, listing.condition)) return false;
  if (!includesSelected(filters.state, listing.locationState)) return false;

  if (
    !matchesNumericSelection(filters.width, listing.width, WIDTH_TOLERANCE) ||
    !matchesNumericSelection(
      filters.thickness,
      listing.thickness,
      THICKNESS_TOLERANCE,
    ) ||
    !matchesNumericSelection(
      filters.wearLayer,
      listing.wearLayer,
      WEAR_LAYER_TOLERANCE,
    )
  ) {
    return false;
  }

  if (filters.certifications?.length) {
    const listingCertifications = new Set(listing.certifications ?? []);
    if (
      !filters.certifications.some((certification) =>
        listingCertifications.has(certification),
      )
    ) {
      return false;
    }
  }

  const directPurchaseUnitPrice = getDirectPurchaseUnitPrice(listing);
  if (
    filters.priceMin !== undefined &&
    directPurchaseUnitPrice < filters.priceMin
  ) {
    return false;
  }
  if (
    filters.priceMax !== undefined &&
    directPurchaseUnitPrice > filters.priceMax
  ) {
    return false;
  }

  if (
    filters.minLotSize !== undefined &&
    listing.totalSqFt < filters.minLotSize
  ) {
    return false;
  }
  if (
    filters.maxLotSize !== undefined &&
    listing.totalSqFt > filters.maxLotSize
  ) {
    return false;
  }

  if (
    filters.buyerZip &&
    filters.maxDistance !== undefined &&
    filters.maxDistance > 0
  ) {
    const origin = zipcodes.lookup(filters.buyerZip);
    if (
      origin &&
      (listing.locationLat == null ||
        listing.locationLng == null ||
        distanceMiles(origin, {
          latitude: listing.locationLat,
          longitude: listing.locationLng,
        }) > filters.maxDistance)
    ) {
      return false;
    }
  }

  return true;
}
