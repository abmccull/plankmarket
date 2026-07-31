import type {
  Certification,
  ConditionType,
  FinishType,
  MaterialType,
  SearchFilters,
  Species,
} from "@/types";

const MATERIAL_TYPES = new Set<MaterialType>([
  "hardwood",
  "engineered",
  "laminate",
  "vinyl_lvp",
  "bamboo",
  "tile",
  "other",
]);

const CONDITIONS = new Set<ConditionType>([
  "new_overstock",
  "discontinued",
  "slight_damage",
  "returns",
  "seconds",
  "remnants",
  "closeout",
  "other",
]);

const SPECIES = new Set<Species>([
  "oak",
  "maple",
  "walnut",
  "hickory",
  "cherry",
  "ash",
  "birch",
  "pine",
  "teak",
  "mahogany",
  "acacia",
  "brazilian_cherry",
  "santos_mahogany",
  "tigerwood",
  "bamboo",
  "cork",
  "other",
]);

const FINISH_TYPES = new Set<FinishType>([
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

const CERTIFICATION_MAP: Record<
  Certification,
  BuyerRequestCertification | ""
> = {
  fsc: "FSC",
  floorscore: "FloorScore",
  greenguard: "GreenGuard",
  greenguard_gold: "GreenGuard Gold",
  carb2: "CARB2",
  leed: "LEED",
  nauf: "NAUF",
  none: "",
};

const CONTACT_LIKE_PATTERN =
  /(?:@|https?:\/\/|www\.|(?:\+?\d[\d().\s-]{6,}\d))/i;
const SAFE_SEARCH_TERM_PATTERN = /^[\p{L}\p{N}\s.,'&/#+-]+$/u;

export type BuyerRequestCertification =
  | "FSC"
  | "FloorScore"
  | "GreenGuard"
  | "GreenGuard Gold"
  | "CARB2"
  | "LEED"
  | "NAUF";

export type BuyerRequestPrefill = {
  materialTypes: MaterialType[];
  minTotalSqFt: string;
  maxTotalSqFt: string;
  priceMaxPerSqFt: string;
  priceMinPerSqFt: string;
  destinationZip: string;
  species: string;
  finishTypes: FinishType[];
  certifications: BuyerRequestCertification[];
  notes: string;
  source: "zero_results" | null;
};

export type SearchGapAnalyticsContext = {
  query_present: boolean;
  material_types: MaterialType[];
  conditions: ConditionType[];
  active_filter_count: number;
  has_price_filter: boolean;
  has_lot_size_filter: boolean;
  has_location_filter: boolean;
};

export type SellerListingDemandContext = {
  source: "zero_results" | null;
  query: string;
  materialTypes: MaterialType[];
  conditions: ConditionType[];
  species: Species[];
  finishTypes: FinishType[];
  priceMin: string;
  priceMax: string;
  minLotSize: string;
  maxLotSize: string;
  states: string[];
};

function allowedValues<T extends string>(
  values: readonly string[] | undefined,
  allowed: ReadonlySet<T>,
  maxItems: number,
): T[] {
  if (!values) return [];

  return Array.from(new Set(values))
    .filter((value): value is T => allowed.has(value as T))
    .slice(0, maxItems);
}

function safeNumber(
  value: number | undefined,
  { min, max, allowZero = false }: { min: number; max: number; allowZero?: boolean },
): string {
  if (
    value === undefined ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (!allowZero && value === 0)
  ) {
    return "";
  }

  return String(value);
}

/**
 * Free-text searches can become public buyer-request notes. Only carry over
 * short product-like text and reject anything resembling contact information.
 */
export function sanitizeSearchGapTerm(value: string | undefined): string {
  if (!value) return "";

  const normalized = value.trim().replace(/\s+/g, " ");
  if (
    normalized.length === 0 ||
    normalized.length > 120 ||
    CONTACT_LIKE_PATTERN.test(normalized) ||
    !SAFE_SEARCH_TERM_PATTERN.test(normalized)
  ) {
    return "";
  }

  return normalized;
}

export function buildBuyerRequestPrefillParams(
  filters: SearchFilters,
): URLSearchParams {
  const params = new URLSearchParams({ source: "zero_results" });
  const materials = allowedValues(filters.materialType, MATERIAL_TYPES, 7);
  const species = allowedValues(filters.species, SPECIES, 10);
  const finishes = allowedValues(filters.finishType, FINISH_TYPES, 11);
  const certifications = allowedValues(
    filters.certifications,
    new Set(Object.keys(CERTIFICATION_MAP) as Certification[]),
    7,
  )
    .map((value) => CERTIFICATION_MAP[value])
    .filter(Boolean);

  const values: Array<[string, string]> = [
    ["materialTypes", materials.join(",")],
    [
      "minTotalSqFt",
      safeNumber(filters.minLotSize, { min: 1, max: 10_000_000 }),
    ],
    [
      "maxTotalSqFt",
      safeNumber(filters.maxLotSize, { min: 1, max: 10_000_000 }),
    ],
    [
      "priceMinPerSqFt",
      safeNumber(filters.priceMin, { min: 0, max: 100, allowZero: true }),
    ],
    [
      "priceMaxPerSqFt",
      safeNumber(filters.priceMax, { min: 0.01, max: 100 }),
    ],
    [
      "destinationZip",
      /^\d{5}$/.test(filters.buyerZip ?? "") ? filters.buyerZip! : "",
    ],
    ["species", species.join(",")],
    ["finishTypes", finishes.join(",")],
    ["certifications", certifications.join(",")],
  ];

  const safeTerm = sanitizeSearchGapTerm(filters.query);
  if (safeTerm) {
    values.push(["notes", `Original marketplace search: ${safeTerm}`]);
  }

  for (const [key, value] of values) {
    if (value) params.set(key, value);
  }

  return params;
}

/** Build a public, non-identifying search URL for seller intent and referrals. */
export function buildShareableSearchParams(
  filters: SearchFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  const arrayValues: Array<[string, string[]]> = [
    ["materialType", allowedValues(filters.materialType, MATERIAL_TYPES, 7)],
    ["condition", allowedValues(filters.condition, CONDITIONS, 8)],
    ["species", allowedValues(filters.species, SPECIES, 10)],
    ["finishType", allowedValues(filters.finishType, FINISH_TYPES, 11)],
    [
      "certifications",
      allowedValues(
        filters.certifications,
        new Set(Object.keys(CERTIFICATION_MAP) as Certification[]),
        7,
      ).filter((value) => value !== "none"),
    ],
  ];

  for (const [key, values] of arrayValues) {
    if (values.length > 0) params.set(key, values.join(","));
  }

  const safeTerm = sanitizeSearchGapTerm(filters.query);
  if (safeTerm) params.set("query", safeTerm);

  const numericValues: Array<[string, string]> = [
    [
      "priceMin",
      safeNumber(filters.priceMin, { min: 0, max: 100, allowZero: true }),
    ],
    ["priceMax", safeNumber(filters.priceMax, { min: 0.01, max: 100 })],
    [
      "minLotSize",
      safeNumber(filters.minLotSize, { min: 1, max: 10_000_000 }),
    ],
    [
      "maxLotSize",
      safeNumber(filters.maxLotSize, { min: 1, max: 10_000_000 }),
    ],
  ];

  for (const [key, value] of numericValues) {
    if (value) params.set(key, value);
  }

  const states = Array.from(new Set(filters.state ?? []))
    .map((state) => state.trim().toUpperCase())
    .filter((state) => /^[A-Z]{2}$/.test(state))
    .slice(0, 10);
  if (states.length > 0) params.set("state", states.join(","));

  return params;
}

function parseCsv<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: ReadonlySet<T>,
  maxItems: number,
): T[] {
  return allowedValues(params.get(key)?.split(","), allowed, maxItems);
}

function parseNumericParam(
  params: URLSearchParams,
  key: string,
  options: { min: number; max: number; allowZero?: boolean },
): string {
  const raw = params.get(key);
  if (!raw || raw.length > 20) return "";
  return safeNumber(Number(raw), options);
}

export function parseBuyerRequestPrefill(
  params: URLSearchParams,
): BuyerRequestPrefill {
  const certificationValues = new Set<BuyerRequestCertification>(
    Object.values(CERTIFICATION_MAP).filter(
      (value): value is BuyerRequestCertification => Boolean(value),
    ),
  );
  const rawNotes = params.get("notes") ?? "";
  const expectedPrefix = "Original marketplace search: ";
  const noteTerm = rawNotes.startsWith(expectedPrefix)
    ? sanitizeSearchGapTerm(rawNotes.slice(expectedPrefix.length))
    : "";

  return {
    materialTypes: parseCsv(params, "materialTypes", MATERIAL_TYPES, 7),
    minTotalSqFt: parseNumericParam(params, "minTotalSqFt", {
      min: 1,
      max: 10_000_000,
    }),
    maxTotalSqFt: parseNumericParam(params, "maxTotalSqFt", {
      min: 1,
      max: 10_000_000,
    }),
    priceMinPerSqFt: parseNumericParam(params, "priceMinPerSqFt", {
      min: 0,
      max: 100,
      allowZero: true,
    }),
    priceMaxPerSqFt: parseNumericParam(params, "priceMaxPerSqFt", {
      min: 0.01,
      max: 100,
    }),
    destinationZip: /^\d{5}$/.test(params.get("destinationZip") ?? "")
      ? params.get("destinationZip")!
      : "",
    species: parseCsv(params, "species", SPECIES, 10).join(", "),
    finishTypes: parseCsv(params, "finishTypes", FINISH_TYPES, 11),
    certifications: Array.from(
      new Set((params.get("certifications") ?? "").split(",")),
    )
      .filter((value): value is BuyerRequestCertification =>
        certificationValues.has(value as BuyerRequestCertification),
      )
      .slice(0, 7),
    notes: noteTerm ? `${expectedPrefix}${noteTerm}` : "",
    source: params.get("source") === "zero_results" ? "zero_results" : null,
  };
}

export function parseSellerListingDemandContext(
  params: URLSearchParams,
): SellerListingDemandContext {
  return {
    source: params.get("source") === "zero_results" ? "zero_results" : null,
    query: sanitizeSearchGapTerm(params.get("query") ?? undefined),
    materialTypes: parseCsv(params, "materialType", MATERIAL_TYPES, 7),
    conditions: parseCsv(params, "condition", CONDITIONS, 8),
    species: parseCsv(params, "species", SPECIES, 10),
    finishTypes: parseCsv(params, "finishType", FINISH_TYPES, 11),
    priceMin: parseNumericParam(params, "priceMin", {
      min: 0,
      max: 100,
      allowZero: true,
    }),
    priceMax: parseNumericParam(params, "priceMax", {
      min: 0.01,
      max: 100,
    }),
    minLotSize: parseNumericParam(params, "minLotSize", {
      min: 1,
      max: 10_000_000,
    }),
    maxLotSize: parseNumericParam(params, "maxLotSize", {
      min: 1,
      max: 10_000_000,
    }),
    states: Array.from(new Set((params.get("state") ?? "").split(",")))
      .map((state) => state.trim().toUpperCase())
      .filter((state) => /^[A-Z]{2}$/.test(state))
      .slice(0, 10),
  };
}

export function buildSearchGapAnalyticsContext(
  filters: SearchFilters,
): SearchGapAnalyticsContext {
  const materialTypes = allowedValues(filters.materialType, MATERIAL_TYPES, 7);
  const conditions = allowedValues(filters.condition, CONDITIONS, 8);
  const arrayFilterCount = [
    materialTypes,
    conditions,
    filters.species,
    filters.colorFamily,
    filters.finishType,
    filters.certifications,
    filters.width,
    filters.thickness,
    filters.wearLayer,
    filters.state,
  ].reduce((count, values) => count + (values?.length ?? 0), 0);
  const scalarFilterCount = [
    filters.query,
    filters.priceMin,
    filters.priceMax,
    filters.minLotSize,
    filters.maxLotSize,
    filters.maxDistance,
    filters.buyerZip,
  ].filter((value) => value !== undefined && value !== "").length;

  return {
    query_present: Boolean(filters.query?.trim()),
    material_types: materialTypes,
    conditions,
    active_filter_count: arrayFilterCount + scalarFilterCount,
    has_price_filter:
      filters.priceMin !== undefined || filters.priceMax !== undefined,
    has_lot_size_filter:
      filters.minLotSize !== undefined || filters.maxLotSize !== undefined,
    has_location_filter: Boolean(
      filters.state?.length || filters.buyerZip || filters.maxDistance,
    ),
  };
}

export function buildAuthPath(
  destination: string,
  role: "buyer" | "seller",
  mode: "login" | "register" = "login",
): string {
  const params = new URLSearchParams({ redirect: destination, role });
  return `/${mode}?${params.toString()}`;
}
