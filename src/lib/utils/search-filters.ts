import type { SearchFilters } from "@/types";
import {
  WIDTH_OPTIONS,
  THICKNESS_OPTIONS,
  WEAR_LAYER_VINYL,
  WEAR_LAYER_ENGINEERED,
  WEAR_LAYER_LAMINATE,
} from "@/lib/constants/flooring";

const MATERIAL_LABELS: Record<string, string> = {
  hardwood: "Hardwood",
  engineered: "Engineered",
  laminate: "Laminate",
  vinyl_lvp: "Vinyl / LVP",
  bamboo: "Bamboo",
  tile: "Tile",
  other: "Other",
};

const CONDITION_LABELS: Record<string, string> = {
  new_overstock: "New Overstock",
  discontinued: "Discontinued",
  closeout: "Closeout",
  slight_damage: "Slight Damage",
  returns: "Returns",
  seconds: "Seconds",
  remnants: "Remnants",
  other: "Other",
};

const SPECIES_LABELS: Record<string, string> = {
  oak: "Oak",
  maple: "Maple",
  walnut: "Walnut",
  hickory: "Hickory",
  cherry: "Cherry",
  ash: "Ash",
  birch: "Birch",
  pine: "Pine",
  teak: "Teak",
  mahogany: "Mahogany",
  acacia: "Acacia",
  brazilian_cherry: "Brazilian Cherry",
  santos_mahogany: "Santos Mahogany",
  tigerwood: "Tigerwood",
  bamboo: "Bamboo",
  cork: "Cork",
  other: "Other",
};

const COLOR_FAMILY_LABELS: Record<string, string> = {
  light: "Light",
  medium: "Medium",
  dark: "Dark",
  gray: "Gray",
  white: "White",
  blonde: "Blonde",
  brown: "Brown",
  red: "Red",
  ebony: "Ebony",
  natural: "Natural",
  multi: "Multi",
};

const FINISH_LABELS: Record<string, string> = {
  matte: "Matte",
  semi_gloss: "Semi-Gloss",
  gloss: "Gloss",
  wire_brushed: "Wire Brushed",
  hand_scraped: "Hand Scraped",
  distressed: "Distressed",
  smooth: "Smooth",
  textured: "Textured",
  oiled: "Oiled",
  unfinished: "Unfinished",
  other: "Other",
};

const CERTIFICATION_LABELS: Record<string, string> = {
  fsc: "FSC",
  floorscore: "FloorScore",
  greenguard: "Greenguard",
  greenguard_gold: "Greenguard Gold",
  carb2: "CARB2",
  leed: "LEED",
  nauf: "NAUF",
  none: "None",
};

const ALL_WEAR_LAYERS = [
  ...WEAR_LAYER_VINYL,
  ...WEAR_LAYER_ENGINEERED,
  ...WEAR_LAYER_LAMINATE,
];

function numericLabel(
  value: number,
  options: ReadonlyArray<{ label: string; value: number }>,
): string {
  const match = options.find((o) => o.value === value);
  return match ? match.label : String(value);
}

/**
 * Convert a filter key+value into a human-readable label.
 */
export function formatFilterLabel(key: string, value: string | number): string {
  switch (key) {
    case "materialType":
      return MATERIAL_LABELS[value as string] ?? String(value);
    case "condition":
      return CONDITION_LABELS[value as string] ?? String(value);
    case "species":
      return SPECIES_LABELS[value as string] ?? String(value);
    case "colorFamily":
      return COLOR_FAMILY_LABELS[value as string] ?? String(value);
    case "finishType":
      return FINISH_LABELS[value as string] ?? String(value);
    case "certifications":
      return CERTIFICATION_LABELS[value as string] ?? String(value);
    case "width":
      return `${numericLabel(value as number, WIDTH_OPTIONS)} wide`;
    case "thickness":
      return `${numericLabel(value as number, THICKNESS_OPTIONS)} thick`;
    case "wearLayer":
      return `${numericLabel(value as number, ALL_WEAR_LAYERS)} wear`;
    case "state":
      return String(value);
    default:
      return String(value);
  }
}

/**
 * Extract all active filters as an array of { key, label } badges.
 */
export function getFilterBadges(
  filters: SearchFilters,
): { key: string; label: string }[] {
  const badges: { key: string; label: string }[] = [];

  if (filters.query) {
    badges.push({ key: "query", label: `"${filters.query}"` });
  }

  const arrayFields = [
    "materialType",
    "condition",
    "species",
    "colorFamily",
    "finishType",
    "certifications",
    "width",
    "thickness",
    "wearLayer",
    "state",
  ] as const;

  for (const field of arrayFields) {
    const values = filters[field];
    if (values && Array.isArray(values) && values.length > 0) {
      for (const v of values) {
        badges.push({ key: field, label: formatFilterLabel(field, v) });
      }
    }
  }

  if (filters.priceMin !== undefined && filters.priceMax !== undefined) {
    badges.push({
      key: "price",
      label: `$${filters.priceMin}–$${filters.priceMax}/ft`,
    });
  } else if (filters.priceMin !== undefined) {
    badges.push({ key: "price", label: `$${filters.priceMin}+/ft` });
  } else if (filters.priceMax !== undefined) {
    badges.push({ key: "price", label: `Up to $${filters.priceMax}/ft` });
  }

  if (filters.minLotSize !== undefined && filters.maxLotSize !== undefined) {
    badges.push({
      key: "lotSize",
      label: `${filters.minLotSize}–${filters.maxLotSize} sq ft`,
    });
  } else if (filters.minLotSize !== undefined) {
    badges.push({ key: "lotSize", label: `${filters.minLotSize}+ sq ft` });
  } else if (filters.maxLotSize !== undefined) {
    badges.push({
      key: "lotSize",
      label: `Up to ${filters.maxLotSize} sq ft`,
    });
  }

  if (filters.maxDistance !== undefined && filters.maxDistance > 0) {
    badges.push({
      key: "distance",
      label: `Within ${filters.maxDistance} mi`,
    });
  }

  return badges;
}

/**
 * Serialize a SearchFilters object to URL search params string.
 * Matches the format the /listings page already parses.
 */
export function filtersToSearchParams(filters: SearchFilters): string {
  const params = new URLSearchParams();

  if (filters.query) params.set("query", filters.query);

  const arrayFields = [
    "materialType",
    "condition",
    "species",
    "colorFamily",
    "finishType",
    "certifications",
    "state",
  ] as const;

  for (const field of arrayFields) {
    const values = filters[field];
    if (values && Array.isArray(values) && values.length > 0) {
      params.set(field, values.join(","));
    }
  }

  // Numeric array fields
  const numericArrayFields = ["width", "thickness", "wearLayer"] as const;
  for (const field of numericArrayFields) {
    const values = filters[field];
    if (values && Array.isArray(values) && values.length > 0) {
      params.set(field, values.join(","));
    }
  }

  if (filters.priceMin !== undefined)
    params.set("priceMin", String(filters.priceMin));
  if (filters.priceMax !== undefined)
    params.set("priceMax", String(filters.priceMax));
  if (filters.minLotSize !== undefined)
    params.set("minLotSize", String(filters.minLotSize));
  if (filters.maxLotSize !== undefined)
    params.set("maxLotSize", String(filters.maxLotSize));
  if (filters.maxDistance !== undefined)
    params.set("maxDistance", String(filters.maxDistance));
  if (filters.buyerZip) params.set("buyerZip", filters.buyerZip);
  if (filters.sort && filters.sort !== "date_newest")
    params.set("sort", filters.sort);

  return params.toString();
}
