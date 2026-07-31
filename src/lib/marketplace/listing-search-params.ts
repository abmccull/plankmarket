import { z } from "zod";
import type { ConditionType, MaterialType, SortOption } from "@/types";

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
  const parsed = z.string().trim().min(1).max(200).safeParse(singleValue(value));
  return parsed.success ? parsed.data : undefined;
}

export interface ParsedListingSearchParams {
  page: number;
  limit: number;
  sort: SortOption;
  query?: string;
  materialType?: MaterialType;
  condition?: ConditionType;
}

/**
 * Normalize public URL parameters before they reach the validated tRPC
 * procedure. A malformed or repeated parameter falls back to a safe default
 * instead of turning the marketplace into a false zero-results state.
 */
export function parseListingSearchParams(
  params: ListingSearchParams,
): ParsedListingSearchParams {
  const parsedSort = sortSchema.safeParse(singleValue(params.sort));
  const parsedMaterial = materialTypeSchema.safeParse(
    singleValue(params.materialType),
  );
  const parsedCondition = conditionSchema.safeParse(
    singleValue(params.condition),
  );

  return {
    page: parsePositiveInteger(params.page, 1, 1_000),
    limit: parsePositiveInteger(params.limit, 24, 250),
    sort: parsedSort.success ? parsedSort.data : "date_newest",
    query: parseOptionalQuery(params.query),
    materialType: parsedMaterial.success ? parsedMaterial.data : undefined,
    condition: parsedCondition.success ? parsedCondition.data : undefined,
  };
}
