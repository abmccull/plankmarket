import { z } from "zod";
import { noContactInfo } from "@/lib/content-filter/zod";
import {
  normalizeUsStateCode,
  normalizeUsStateCodeList,
} from "@/lib/selling-territory";
import {
  AUTOMATIC_MARKDOWN_STEP_COUNT,
  PRICING_RULES_VERSION,
} from "@/lib/selling-rules";

export const sellingTerritoryModeSchema = z.enum([
  "unrestricted",
  "allowed_states",
]);

export const freightPaymentModeSchema = z.enum([
  "buyer_pays",
  "seller_pays",
]);

function optionalNormalizedUsStateSchema(label: string) {
  return z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (value == null || value.length === 0) {
        return undefined;
      }

      const normalized = normalizeUsStateCode(value);
      if (!normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} must be a valid US state code`,
        });
        return undefined;
      }

      return normalized as string;
    });
}

function normalizedUsStateListSchema(label: string) {
  return z.array(z.string()).default([]).transform((values, ctx) => {
    const normalized = normalizeUsStateCodeList(values);

    if (normalized.invalidCodes.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} contains invalid US state code${
          normalized.invalidCodes.length === 1 ? "" : "s"
        }: ${normalized.invalidCodes.join(", ")}`,
      });
    }

    return normalized.codes as string[];
  });
}

function csvBooleanSchema() {
  return z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return value;

    const normalized = value.trim().toLowerCase();
    if (normalized === "") return undefined;
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;

    return value;
  }, z.boolean().optional());
}

function csvNumberSchema() {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value === "string" && value.trim().length === 0) {
      return undefined;
    }
    return value;
  }, z.coerce.number().optional());
}

function csvStateListSchema(label: string) {
  return z.preprocess((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return [];

    return value
      .split(/[;,]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }, normalizedUsStateListSchema(label));
}

const sellingRuleFieldValidators = {
  fullLotOnly: z.boolean().default(false),
  partialQuantityMarkupPercent: z
    .number()
    .min(0, "Partial-quantity markup cannot be negative")
    .max(500, "Partial-quantity markup is too high")
    .nullish()
    .transform((value) => value ?? null),
  automaticMarkdownEnabled: z.boolean().default(false),
  automaticMarkdownFloorPercent: z
    .number()
    .positive("Automatic markdown floor percent must be greater than 0")
    .max(100, "Automatic markdown floor percent cannot exceed 100")
    .nullish()
    .transform((value) => value ?? null),
  automaticMarkdownIntervalDays: z
    .number()
    .int("Automatic markdown interval must be a whole number of days")
    .positive("Automatic markdown interval must be at least 1 day")
    .max(365, "Automatic markdown interval is too long")
    .nullish()
    .transform((value) => value ?? null),
  automaticMarkdownStartedAt: z.coerce.date().optional().nullable(),
  automaticMarkdownCurrentStep: z
    .number()
    .int()
    .min(0)
    .max(AUTOMATIC_MARKDOWN_STEP_COUNT)
    .default(0),
  automaticMarkdownLastAppliedAt: z.coerce.date().optional().nullable(),
  pricingRulesVersion: z
    .number()
    .int()
    .positive()
    .default(PRICING_RULES_VERSION),
  allowSampleRequests: z.boolean().default(false),
  territoryMode: sellingTerritoryModeSchema.default("unrestricted"),
  allowedDestinationStates: normalizedUsStateListSchema(
    "Allowed destination states",
  ),
  freightPaymentMode: freightPaymentModeSchema.default("buyer_pays"),
  sellerFreightStates: normalizedUsStateListSchema("Seller freight states"),
  freightDropCharge: z
    .number()
    .min(0, "Freight drop charge cannot be negative")
    .max(100000, "Freight drop charge is too high")
    .nullish()
    .transform((value) => value ?? null),
} as const;

function applySellingRuleCrossFieldValidation(
  data: {
    fullLotOnly?: boolean;
    partialQuantityMarkupPercent?: number | null;
    automaticMarkdownEnabled?: boolean;
    automaticMarkdownFloorPercent?: number | null;
    automaticMarkdownIntervalDays?: number | null;
    automaticMarkdownStartedAt?: Date | null;
    automaticMarkdownCurrentStep?: number;
    automaticMarkdownLastAppliedAt?: Date | null;
    territoryMode?: "unrestricted" | "allowed_states";
    allowedDestinationStates?: string[];
    freightPaymentMode?: "buyer_pays" | "seller_pays";
    sellerFreightStates?: string[];
    freightDropCharge?: number | null;
  },
  ctx: z.RefinementCtx,
) {
  if (data.fullLotOnly && data.partialQuantityMarkupPercent != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["partialQuantityMarkupPercent"],
      message:
        "Partial-quantity markup cannot be set when the listing is full-lot only",
    });
  }

  if (data.automaticMarkdownEnabled) {
    if (data.automaticMarkdownFloorPercent == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["automaticMarkdownFloorPercent"],
        message:
          "Automatic markdown floor percent is required when automatic markdown is enabled",
      });
    }

    if (data.automaticMarkdownIntervalDays == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["automaticMarkdownIntervalDays"],
        message:
          "Automatic markdown interval is required when automatic markdown is enabled",
      });
    }
  } else {
    if (data.automaticMarkdownStartedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["automaticMarkdownStartedAt"],
        message:
          "Automatic markdown start time must be empty when automatic markdown is disabled",
      });
    }

    if ((data.automaticMarkdownCurrentStep ?? 0) !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["automaticMarkdownCurrentStep"],
        message:
          "Automatic markdown step must be 0 when automatic markdown is disabled",
      });
    }

    if (data.automaticMarkdownLastAppliedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["automaticMarkdownLastAppliedAt"],
        message:
          "Automatic markdown last-applied time must be empty when automatic markdown is disabled",
      });
    }
  }

  if (
    data.territoryMode === "allowed_states" &&
    (data.allowedDestinationStates?.length ?? 0) === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["allowedDestinationStates"],
      message:
        "At least one allowed destination state is required when territory restrictions are enabled",
    });
  }

  if (
    data.territoryMode === "unrestricted" &&
    (data.allowedDestinationStates?.length ?? 0) > 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["allowedDestinationStates"],
      message:
        "Allowed destination states must be empty when territory mode is unrestricted",
    });
  }

  if (data.freightPaymentMode === "buyer_pays") {
    if ((data.sellerFreightStates?.length ?? 0) > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sellerFreightStates"],
        message:
          "Seller freight states must be empty unless seller-paid freight is enabled",
      });
    }

    if (data.freightDropCharge != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["freightDropCharge"],
        message:
          "Freight drop charge must be empty unless seller-paid freight is enabled",
      });
    }
  }
}

const listingFormSchemaBase = z.object({
    // Step 1: Product Details
    title: z
      .string()
      .min(10, "Title must be at least 10 characters")
      .max(255, "Title must be at most 255 characters")
      .superRefine(noContactInfo("title")),
    description: z
      .string()
      .max(5000, "Description must be at most 5000 characters")
      .superRefine(noContactInfo("description"))
      .optional(),
    materialType: z.enum(
      [
        "hardwood",
        "engineered",
        "laminate",
        "vinyl_lvp",
        "bamboo",
        "tile",
        "other",
      ],
      {
        message: "Please select a material type",
      },
    ),
    species: z.string().max(100).optional(),
    finish: z
      .enum(
        [
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
        ],
        {
          message: "Please select a finish type",
        },
      )
      .optional(),
    grade: z
      .enum(
        [
          "select",
          "1_common",
          "2_common",
          "3_common",
          "cabin",
          "character",
          "rustic",
          "premium",
          "standard",
          "economy",
          "other",
        ],
        {
          message: "Please select a grade",
        },
      )
      .optional(),
    color: z.string().max(100).optional(),
    colorFamily: z.string().max(50).optional(),
    thickness: z.number().positive("Thickness must be positive").optional(),
    width: z.number().positive("Width must be positive").optional(),
    length: z.number().positive("Length must be positive").optional(),
    wearLayer: z.number().positive("Wear layer must be positive").optional(),
    brand: z.string().max(255).optional(),
    modelNumber: z.string().max(255).optional(),

    // Step 2: Lot Details
    sqFtPerBox: z
      .number()
      .positive("Sq ft per box must be positive")
      .optional(),
    boxesPerPallet: z
      .number()
      .int()
      .positive("Boxes per pallet must be positive")
      .optional(),
    totalSqFt: z.number().positive("Total sq ft must be positive"),
    totalPallets: z.number().int().positive("Total pallets is required"),
    moq: z.number().positive("Minimum order quantity is required"),
    moqUnit: z.enum(["pallets", "sqft"]),

    // Freight / shipping dimensions
    palletWeight: z
      .number()
      .positive("Pallet weight is required")
      .max(5000, "Maximum 5000 lbs per pallet"),
    palletLength: z
      .number()
      .positive("Pallet length is required")
      .max(120, "Maximum 120 inches"),
    palletWidth: z
      .number()
      .positive("Pallet width is required")
      .max(120, "Maximum 120 inches"),
    palletHeight: z
      .number()
      .positive("Pallet height is required")
      .max(120, "Maximum 120 inches"),
    nmfcCode: z.string().max(20).optional(),
    freightClass: z.string().max(10).optional(),

    locationCity: z.string().max(100).optional(),
    locationState: optionalNormalizedUsStateSchema("State"),
    locationZip: z.string().min(5, "ZIP code is required").max(10),

    // Step 3: Pricing
    askPricePerSqFt: z
      .number()
      .positive("Price per sq ft must be positive")
      .max(1000, "Price seems too high"),
    buyNowPrice: z.number().positive("Buy now price must be positive").optional(),
    allowOffers: z.boolean().default(true),
    floorPrice: z.number().positive("Floor price must be positive").optional(),
    ...sellingRuleFieldValidators,

    // Step 4: Condition
    condition: z.enum(
      [
        "new_overstock",
        "discontinued",
        "slight_damage",
        "returns",
        "seconds",
        "remnants",
        "closeout",
        "other",
      ],
      {
        message: "Please select a condition",
      },
    ),
    reasonCode: z
      .enum(
        [
          "overproduction",
          "color_change",
          "line_discontinuation",
          "warehouse_clearance",
          "customer_return",
          "slight_defect",
          "packaging_damage",
          "end_of_season",
          "other",
        ],
        {
          message: "Please select a reason",
        },
      )
      .optional(),
    certifications: z.array(z.string()).default([]),

    // Step 5: Media (handled separately via upload)
    mediaIds: z
      .array(z.string().uuid())
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Duplicate media IDs are not allowed",
      })
      .optional(),
});

export const listingSellingRulesSchema = z
  .object(sellingRuleFieldValidators)
  .superRefine(applySellingRuleCrossFieldValidation);

export const listingFormSchema = listingFormSchemaBase.superRefine(
  applySellingRuleCrossFieldValidation,
);

export const listingFormUpdateSchema = listingFormSchemaBase
  .partial()
  .superRefine(applySellingRuleCrossFieldValidation);

export const MAX_PUBLIC_FILTER_VALUES = 25;
export const MAX_PUBLIC_FILTER_TEXT_LENGTH = 100;
export const MAX_PUBLIC_FILTER_NUMBER = 1_000_000_000;
export const MAX_PUBLIC_DISTANCE_MILES = 5_000;
export const MIN_PUBLIC_SEARCH_QUERY_LENGTH = 3;
export const MAX_PUBLIC_LISTING_RESULT_WINDOW = 5_000;

const publicFilterTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_PUBLIC_FILTER_TEXT_LENGTH);
const publicFilterNumberSchema = z
  .number()
  .finite()
  .nonnegative()
  .max(MAX_PUBLIC_FILTER_NUMBER);

export const listingFilterSchema = z.object({
  query: z
    .string()
    .trim()
    .min(MIN_PUBLIC_SEARCH_QUERY_LENGTH)
    .max(200)
    .optional(),
  materialType: z
    .array(
      z.enum([
        "hardwood",
        "engineered",
        "laminate",
        "vinyl_lvp",
        "bamboo",
        "tile",
        "other",
      ]),
    )
    .max(MAX_PUBLIC_FILTER_VALUES)
    .optional(),
  species: z
    .array(publicFilterTextSchema)
    .max(MAX_PUBLIC_FILTER_VALUES)
    .optional(),
  colorFamily: z
    .array(publicFilterTextSchema)
    .max(MAX_PUBLIC_FILTER_VALUES)
    .optional(),
  finishType: z
    .array(
      z.enum([
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
      ]),
    )
    .max(MAX_PUBLIC_FILTER_VALUES)
    .optional(),
  width: z
    .array(publicFilterNumberSchema)
    .max(MAX_PUBLIC_FILTER_VALUES)
    .optional(),
  thickness: z
    .array(publicFilterNumberSchema)
    .max(MAX_PUBLIC_FILTER_VALUES)
    .optional(),
  wearLayer: z
    .array(publicFilterNumberSchema)
    .max(MAX_PUBLIC_FILTER_VALUES)
    .optional(),
  priceMin: publicFilterNumberSchema.optional(),
  priceMax: publicFilterNumberSchema.optional(),
  condition: z
    .array(
      z.enum([
        "new_overstock",
        "discontinued",
        "slight_damage",
        "returns",
        "seconds",
        "remnants",
        "closeout",
        "other",
      ]),
    )
    .max(MAX_PUBLIC_FILTER_VALUES)
    .optional(),
  state: z
    .array(publicFilterTextSchema)
    .max(MAX_PUBLIC_FILTER_VALUES)
    .optional(),
  certifications: z
    .array(publicFilterTextSchema)
    .max(MAX_PUBLIC_FILTER_VALUES)
    .optional(),
  minLotSize: publicFilterNumberSchema.optional(),
  maxLotSize: publicFilterNumberSchema.optional(),
  maxDistance: z
    .number()
    .finite()
    .positive()
    .max(MAX_PUBLIC_DISTANCE_MILES)
    .optional(),
  buyerZip: z.string().length(5).regex(/^\d{5}$/).optional(),
  // These are familiar opt-in confidence filters, not a request to surface
  // sellers or listings that lack evidence. Treat false as invalid at the API
  // boundary so a hidden negative constraint cannot be saved accidentally.
  sellerVerified: z.literal(true).optional(),
  freightReady: z.literal(true).optional(),
  fullLotOnly: z.boolean().optional(),
  sort: z
    .enum([
      "price_asc",
      "price_desc",
      "date_newest",
      "date_oldest",
      "lot_value_desc",
      "lot_value_asc",
      "popularity",
      "proximity",
    ])
    .default("date_newest"),
  page: z.number().int().positive().max(1_000).default(1),
  limit: z.number().int().positive().max(250).default(24),
}).superRefine((input, ctx) => {
  const resultWindowEnd = input.page * input.limit;
  if (resultWindowEnd > MAX_PUBLIC_LISTING_RESULT_WINDOW) {
    ctx.addIssue({
      code: "custom",
      path: ["page"],
      message: `Catalog browsing is limited to the first ${MAX_PUBLIC_LISTING_RESULT_WINDOW.toLocaleString()} matching listings. Refine the filters to continue.`,
    });
  }
});

const csvListingRowSchemaBase = z.object({
    title: z.string().min(1),
    materialType: z.enum([
      "hardwood",
      "engineered",
      "laminate",
      "vinyl_lvp",
      "bamboo",
      "tile",
      "other",
    ]),
    totalSqFt: z.coerce.number().positive(),
    askPricePerSqFt: z.coerce.number().positive(),
    condition: z.enum([
      "new_overstock",
      "discontinued",
      "slight_damage",
      "returns",
      "seconds",
      "remnants",
      "closeout",
      "other",
    ]),
    species: z.string().optional(),
    finish: z
      .enum([
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
      ])
      .optional(),
    grade: z
      .enum([
        "select",
        "1_common",
        "2_common",
        "3_common",
        "cabin",
        "character",
        "rustic",
        "premium",
        "standard",
        "economy",
        "other",
      ])
      .optional(),
    color: z.string().optional(),
    thickness: z.coerce.number().optional(),
    width: z.coerce.number().optional(),
    length: z.coerce.number().optional(),
    sqFtPerBox: z.coerce.number().optional(),
    boxesPerPallet: z.coerce.number().int().optional(),
    totalPallets: z.coerce.number().int().positive("Total pallets is required"),
    moq: z.coerce.number().positive("Minimum order quantity is required"),
    moqUnit: z.enum(["pallets", "sqft"]),
    locationCity: z.string().optional(),
    locationState: optionalNormalizedUsStateSchema("State"),
    locationZip: z.string().min(5, "ZIP code is required"),
    buyNowPrice: z.coerce.number().optional(),
    description: z.string().optional(),
    palletWeight: z.coerce.number().positive("Pallet weight is required"),
    palletLength: z.coerce.number().positive("Pallet length is required"),
    palletWidth: z.coerce.number().positive("Pallet width is required"),
    palletHeight: z.coerce.number().positive("Pallet height is required"),
    nmfcCode: z.string().max(20).optional(),
    freightClass: z.string().max(10).optional(),
    fullLotOnly: csvBooleanSchema().transform((value) => value ?? false),
    partialQuantityMarkupPercent: csvNumberSchema()
      .pipe(
        z
          .number()
          .min(0, "Partial-quantity markup cannot be negative")
          .max(500, "Partial-quantity markup is too high")
          .optional(),
      )
      .transform((value) => value ?? null),
    automaticMarkdownEnabled: csvBooleanSchema().transform(
      (value) => value ?? false,
    ),
    automaticMarkdownFloorPercent: csvNumberSchema()
      .pipe(
        z
          .number()
          .positive("Automatic markdown floor percent must be greater than 0")
          .max(100, "Automatic markdown floor percent cannot exceed 100")
          .optional(),
      )
      .transform((value) => value ?? null),
    automaticMarkdownIntervalDays: csvNumberSchema()
      .pipe(
        z
          .number()
          .int("Automatic markdown interval must be a whole number of days")
          .positive("Automatic markdown interval must be at least 1 day")
          .max(365, "Automatic markdown interval is too long")
          .optional(),
      )
      .transform((value) => value ?? null),
    allowSampleRequests: csvBooleanSchema().transform((value) => value ?? false),
    territoryMode: z
      .enum(["unrestricted", "allowed_states"])
      .default("unrestricted"),
    allowedDestinationStates: csvStateListSchema("Allowed destination states"),
    freightPaymentMode: z.enum(["buyer_pays", "seller_pays"]).default("buyer_pays"),
    sellerFreightStates: csvStateListSchema("Seller freight states"),
    freightDropCharge: csvNumberSchema()
      .pipe(
        z
          .number()
          .min(0, "Freight drop charge cannot be negative")
          .max(100000, "Freight drop charge is too high")
          .optional(),
      )
      .transform((value) => value ?? null),
    pricingRulesVersion: csvNumberSchema()
      .pipe(z.number().int().positive().optional())
      .transform((value) => value ?? PRICING_RULES_VERSION),
});

export const csvListingRowSchema = csvListingRowSchemaBase.superRefine(
  applySellingRuleCrossFieldValidation,
);

export type ListingFormInput = z.infer<typeof listingFormSchema>;
export type ListingFilterInput = z.infer<typeof listingFilterSchema>;
export type CsvListingRow = z.infer<typeof csvListingRowSchema>;
