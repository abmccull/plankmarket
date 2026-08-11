import { z } from "zod";
import {
  listingFilterSchema,
  MAX_PUBLIC_LISTING_RESULT_WINDOW,
  MAX_PUBLIC_DISTANCE_MILES,
  MAX_PUBLIC_FILTER_NUMBER,
  MAX_PUBLIC_FILTER_TEXT_LENGTH,
  MAX_PUBLIC_FILTER_VALUES,
  MIN_PUBLIC_SEARCH_QUERY_LENGTH,
} from "@/lib/validators/listing";
import type { ListingFilterInput } from "@/lib/validators/listing";

export type ListingSearchParamValue = string | string[] | undefined;
export type ListingSearchParams = Record<string, ListingSearchParamValue>;

const sortSchema = z.enum([
  "price_asc",
  "price_desc",
  "date_newest",
  "date_oldest",
  "lot_value_desc",
  "lot_value_asc",
  "popularity",
  "proximity",
]);

const materialTypeSchema = z.enum([
  "hardwood",
  "engineered",
  "laminate",
  "vinyl_lvp",
  "bamboo",
  "tile",
  "other",
]);

const conditionSchema = z.enum([
  "new_overstock",
  "discontinued",
  "slight_damage",
  "returns",
  "seconds",
  "remnants",
  "closeout",
  "other",
]);

const finishTypeSchema = z.enum([
  "matte",
  "semi_gloss",
  "gloss",
  "wire_brushed",
  "hand_scraped",
  "distressed",
  "smooth",
  "textured",
  "oiled",
  "unfinished",
  "other",
]);

function singleValue(value: ListingSearchParamValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parsePositiveInteger(
  value: ListingSearchParamValue,
  fallback: number,
  maximum: number,
): number {
  const parsed = z.coerce
    .number()
    .int()
    .positive()
    .max(maximum)
    .safeParse(singleValue(value));

  return parsed.success ? parsed.data : fallback;
}

function parseOptionalQuery(value: ListingSearchParamValue) {
  const parsed = z
    .string()
    .trim()
    .min(MIN_PUBLIC_SEARCH_QUERY_LENGTH)
    .max(200)
    .safeParse(singleValue(value));
  return parsed.success ? parsed.data : undefined;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function parseCsvValues(value: ListingSearchParamValue): string[] | undefined {
  const raw = singleValue(value);
  if (!raw) return undefined;

  const parsed = raw
    .split(",")
    .map((item) => item.trim())
    .filter(
      (item) => item.length > 0 && item.length <= MAX_PUBLIC_FILTER_TEXT_LENGTH,
    )
    .slice(0, MAX_PUBLIC_FILTER_VALUES);

  return parsed.length > 0 ? unique(parsed) : undefined;
}

function parseEnumArray<T extends string>(
  value: ListingSearchParamValue,
  schema: z.ZodType<T>,
): T[] | undefined {
  const parsed = parseCsvValues(value);
  if (!parsed) return undefined;

  const valid = parsed.flatMap((item) => {
    const result = schema.safeParse(item);
    return result.success ? [result.data] : [];
  });

  return valid.length > 0 ? unique(valid) : undefined;
}

function parseStringArray(value: ListingSearchParamValue): string[] | undefined {
  return parseCsvValues(value);
}

function parseNumberArray(value: ListingSearchParamValue): number[] | undefined {
  const parsed = parseCsvValues(value);
  if (!parsed) return undefined;

  const valid = parsed.flatMap((item) => {
    const number = Number(item);
    return Number.isFinite(number) && number >= 0 && number <= MAX_PUBLIC_FILTER_NUMBER
      ? [number]
      : [];
  });

  return valid.length > 0 ? unique(valid) : undefined;
}

function parseOptionalNumber(
  value: ListingSearchParamValue,
  minimum = 0,
  maximum = MAX_PUBLIC_FILTER_NUMBER,
): number | undefined {
  const raw = singleValue(value);
  if (!raw) return undefined;

  const normalized = raw.trim();
  if (!normalized) return undefined;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

function parseBuyerZip(value: ListingSearchParamValue): string | undefined {
  const parsed = z
    .string()
    .trim()
    .length(5)
    .regex(/^\d{5}$/)
    .safeParse(singleValue(value));

  return parsed.success ? parsed.data : undefined;
}

function parseOptionalBoolean(
  value: ListingSearchParamValue,
): boolean | undefined {
  const raw = singleValue(value)?.trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

function parsePositiveBoolean(
  value: ListingSearchParamValue,
): true | undefined {
  return singleValue(value)?.trim().toLowerCase() === "true"
    ? true
    : undefined;
}

export type ParsedListingSearchParams = ListingFilterInput;

/**
 * Normalize public URL parameters before they reach the validated tRPC
 * procedure. A malformed or repeated parameter falls back to a safe default
 * instead of turning the marketplace into a false zero-results state.
 */
export function parseListingSearchParams(
  params: ListingSearchParams,
): ParsedListingSearchParams {
  const parsedSort = sortSchema.safeParse(singleValue(params.sort));
  const limit = parsePositiveInteger(params.limit, 24, 250);
  const maxPage = Math.max(
    1,
    Math.floor(MAX_PUBLIC_LISTING_RESULT_WINDOW / limit),
  );

  return listingFilterSchema.parse({
    page: parsePositiveInteger(params.page, 1, maxPage),
    limit,
    sort: parsedSort.success ? parsedSort.data : undefined,
    query: parseOptionalQuery(params.query),
    materialType: parseEnumArray(params.materialType, materialTypeSchema),
    species: parseStringArray(params.species),
    colorFamily: parseStringArray(params.colorFamily),
    finishType: parseEnumArray(params.finishType, finishTypeSchema),
    width: parseNumberArray(params.width),
    thickness: parseNumberArray(params.thickness),
    wearLayer: parseNumberArray(params.wearLayer),
    priceMin: parseOptionalNumber(params.priceMin),
    priceMax: parseOptionalNumber(params.priceMax),
    condition: parseEnumArray(params.condition, conditionSchema),
    state: parseStringArray(params.state),
    certifications: parseStringArray(params.certifications),
    minLotSize: parseOptionalNumber(params.minLotSize),
    maxLotSize: parseOptionalNumber(params.maxLotSize),
    maxDistance: parseOptionalNumber(
      params.maxDistance,
      Number.EPSILON,
      MAX_PUBLIC_DISTANCE_MILES,
    ),
    buyerZip: parseBuyerZip(params.buyerZip),
    sellerVerified: parsePositiveBoolean(params.sellerVerified),
    freightReady: parsePositiveBoolean(params.freightReady),
    fullLotOnly: parseOptionalBoolean(params.fullLotOnly),
  });
}
