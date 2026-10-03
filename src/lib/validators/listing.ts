import { resolveMinimumOrderSqFt } from "@/lib/marketplace/minimum-order-quantity";
import { z } from "zod";
import { normalizeCsvWearLayer } from "@/lib/csv/wear-layer";
import { productSpecificationFields } from "@/lib/product-specifications";
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

export const freightPaymentModeSchema = z.enum(["buyer_pays", "seller_pays"]);

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
  return z
    .array(z.string())
    .default([])
    .transform((values, ctx) => {
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
    .number({ error: "Enter a valid partial-quantity markup percentage." })
    .min(0, "Partial-quantity markup cannot be negative")
    .max(500, "Partial-quantity markup is too high")
    .nullish()
    .transform((value) => value ?? null),
  automaticMarkdownEnabled: z.boolean().default(false),
  automaticMarkdownFloorPercent: z
    .number({ error: "Enter the minimum price as a percentage of the starting price." })
    .positive("Automatic markdown floor percent must be greater than 0")
    .max(100, "Automatic markdown floor percent cannot exceed 100")
    .nullish()
    .transform((value) => value ?? null),
  automaticMarkdownIntervalDays: z
    .number({ error: "Enter the number of days between markdowns." })
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
    .number({ error: "Enter a valid buyer drop charge." })
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
  ...productSpecificationFields,
  // Step 1: Product Details
  title: z
    .string({ error: "Enter a listing title." })
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
  thickness: z.number({ error: "Enter a valid thickness, or leave it blank." }).positive("Thickness must be positive").optional(),
  width: z.number({ error: "Enter a valid plank width, or leave it blank." }).positive("Width must be positive").optional(),
  length: z.number({ error: "Enter a valid plank length, or leave it blank." }).positive("Length must be positive").optional(),
  wearLayer: z.number({ error: "Enter a valid wear layer, or leave it blank." }).positive("Wear layer must be positive").optional(),
  brand: z.string().max(255).optional(),
  modelNumber: z.string().max(255).optional(),

  // Step 2: Lot Details
  sqFtPerBox: z.number({ error: "Enter square feet per box, or leave it blank." }).positive("Sq ft per box must be positive").optional(),
  boxesPerPallet: z
    .number({ error: "Enter boxes per pallet, or leave it blank." })
    .int("Enter a whole number of boxes per pallet.")
    .positive("Boxes per pallet must be positive")
    .optional(),
  totalSqFt: z.number({ error: "Enter the total square feet available." }).positive("Total sq ft must be positive"),
  totalPallets: z.number({ error: "Enter the number of pallets." }).int("Enter a whole number of pallets.").positive("Total pallets is required"),
  moq: z.number({ error: "Enter the minimum order quantity." }).positive("Minimum order quantity is required"),
  moqUnit: z.enum(["pallets", "sqft"], { error: "Choose pallets or square feet for the minimum order quantity." }),

  // Freight / shipping dimensions
  palletWeight: z
    .number({ error: "Enter the weight per pallet in pounds." })
    .positive("Pallet weight is required")
    .max(5000, "Maximum 5000 lbs per pallet"),
  palletLength: z
    .number({ error: "Enter the pallet length in inches." })
    .positive("Pallet length is required")
    .max(120, "Maximum 120 inches"),
  palletWidth: z
    .number({ error: "Enter the pallet width in inches." })
    .positive("Pallet width is required")
    .max(120, "Maximum 120 inches"),
  palletHeight: z
    .number({ error: "Enter the pallet height in inches." })
    .positive("Pallet height is required")
    .max(120, "Maximum 120 inches"),
  nmfcCode: z.string().max(20).optional(),
  freightClass: z.string().max(10).optional(),

  locationCity: z.string().max(100).optional(),
  locationState: optionalNormalizedUsStateSchema("State"),
  locationZip: z.string({ error: "Enter the pickup ZIP code." }).min(5, "ZIP code is required").max(10, "Use no more than 10 characters for the pickup ZIP code."),

  // Step 3: Pricing
  askPricePerSqFt: z
    .number({ error: "Enter an asking price per square foot." })
    .positive("Price per sq ft must be positive")
    .max(1000, "Price seems too high"),
  buyNowPrice: z.number({ error: "Enter a Buy Now price, or leave it blank." }).positive("Buy now price must be positive").optional(),
  allowOffers: z.boolean().default(true),
  floorPrice: z.number({ error: "Enter an offer floor price, or leave it blank." }).positive("Floor price must be positive").optional(),
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

export function applyPalletMinimumValidation(data: {
  moq?: number | null; moqUnit?: "pallets" | "sqft" | null;
  sqFtPerBox?: number | null; boxesPerPallet?: number | null;
}, ctx: z.RefinementCtx) {
  if (data.moqUnit !== "pallets" || !data.moq || resolveMinimumOrderSqFt(data) !== null) return;
  if (data.sqFtPerBox == null || !Number.isFinite(data.sqFtPerBox) || data.sqFtPerBox <= 0) {
    ctx.addIssue({ code: "custom", path: ["sqFtPerBox"], message: "Enter actual square feet per box for a pallet minimum." });
  }
  if (data.boxesPerPallet == null || !Number.isInteger(data.boxesPerPallet) || data.boxesPerPallet <= 0) {
    ctx.addIssue({ code: "custom", path: ["boxesPerPallet"], message: "Enter the actual whole number of boxes per pallet for a pallet minimum." });
  }
  if (data.sqFtPerBox != null && Number.isFinite(data.sqFtPerBox) && data.sqFtPerBox > 0 &&
      data.boxesPerPallet != null && Number.isInteger(data.boxesPerPallet) && data.boxesPerPallet > 0) {
    ctx.addIssue({ code: "custom", path: ["moq"], message: "These pallet measurements cannot establish a valid minimum order quantity." });
  }
}

export const listingPalletMinimumSchema = z.object({
  moq: z.number().nullish(), moqUnit: z.enum(["pallets", "sqft"]).nullish(),
  sqFtPerBox: z.number().nullish(), boxesPerPallet: z.number().nullish(),
}).superRefine(applyPalletMinimumValidation);

export const listingSellingRulesSchema = z
  .object(sellingRuleFieldValidators)
  .superRefine(applySellingRuleCrossFieldValidation);

// Creation can bind a saved pickup origin atomically. Reassignment remains in
// warehouse.assignListing, with its reserved-order protections.
// A previous lot can supply product specifications, never its stock or terms.
export const listingPalletDimensionsSchema = listingFormSchemaBase.pick({ palletLength: true, palletWidth: true, palletHeight: true });

export const listingProductReuseSchema = listingFormSchemaBase.pick({
  materialType: true, species: true, finish: true, grade: true, color: true, colorFamily: true,
  thickness: true, width: true, length: true, wearLayer: true, brand: true, modelNumber: true,
  sqFtPerBox: true, installationMethod: true, waterResistance: true, certifications: true,
}).extend({ certifications: z.array(z.string().max(100)).max(100).default([]) });

export const listingFormSchema = listingFormSchemaBase.superRefine(applySellingRuleCrossFieldValidation).superRefine(applyPalletMinimumValidation);
export const listingCreationSchema = listingFormSchemaBase.extend({
  warehouseId: z.string().uuid().optional(),
  warehouseRevision: z.number().int().positive().optional(),
}).superRefine(applySellingRuleCrossFieldValidation).superRefine(applyPalletMinimumValidation).superRefine((data, ctx) => {
  if ((data.warehouseId !== undefined) !== (data.warehouseRevision !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["warehouseId"], message: "Choose a current pickup warehouse or use a manual location." });
  }
});

export const CLEARABLE_LISTING_NUMBER_FIELDS = [
  "thickness",
  "width",
  "length",
  "wearLayer",
  "sqFtPerBox",
  "boxesPerPallet",
  "buyNowPrice",
  "floorPrice",
] as const;

const listingUpdateFields = {
  ...listingFormSchemaBase.shape,
  thickness: listingFormSchemaBase.shape.thickness.nullable(),
  width: listingFormSchemaBase.shape.width.nullable(),
  length: listingFormSchemaBase.shape.length.nullable(),
  wearLayer: listingFormSchemaBase.shape.wearLayer.nullable(),
  sqFtPerBox: listingFormSchemaBase.shape.sqFtPerBox.nullable(),
  boxesPerPallet: listingFormSchemaBase.shape.boxesPerPallet.nullable(),
  buyNowPrice: listingFormSchemaBase.shape.buyNowPrice.nullable(),
  floorPrice: listingFormSchemaBase.shape.floorPrice.nullable(),
};

// Zod 4 applies creation defaults inside .partial(). An update must short-circuit
// absent values before those defaults/transforms and preserve deliberate nulls.
const optionalListingUpdateFields = Object.fromEntries(
  Object.entries(listingUpdateFields).map(([key, field]) => [
    key,
    z.union([z.undefined(), field]).optional(),
  ]),
) as {
  [K in keyof typeof listingUpdateFields]: z.ZodOptional<
    z.ZodUnion<[z.ZodUndefined, (typeof listingUpdateFields)[K]]>
  >;
};

export const listingFormUpdateSchema = z
  .object(optionalListingUpdateFields)
  .transform((data) => {
    for (const key of Object.keys(data) as (keyof typeof data)[]) {
      if (data[key] === undefined) delete data[key];
    }
    // Cross-field selling rules are checked against the locked, merged record.
    return data;
  });

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

export const listingFilterSchema = z
  .object({
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
    hideQuantityConflicts: z.literal(true).optional(),
    maxDistance: z
      .number()
      .finite()
      .positive()
      .max(MAX_PUBLIC_DISTANCE_MILES)
      .optional(),
    buyerZip: z
      .string()
      .length(5)
      .regex(/^\d{5}$/)
      .optional(),
    // These are familiar opt-in confidence filters, not a request to surface
    // sellers or listings that lack evidence. Treat false as invalid at the API
    // boundary so a hidden negative constraint cannot be saved accidentally.
    waterproofRequired: z.literal(true).optional(),
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
  })
  .superRefine((input, ctx) => {
    if (input.hideQuantityConflicts && !(input.minLotSize !== undefined && input.minLotSize > 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["minLotSize"],
        message: "Enter the square footage needed before hiding quantity conflicts.",
      });
    }
    const resultWindowEnd = input.page * input.limit;
    if (resultWindowEnd > MAX_PUBLIC_LISTING_RESULT_WINDOW) {
      ctx.addIssue({
        code: "custom",
        path: ["page"],
        message: `Catalog browsing is limited to the first ${MAX_PUBLIC_LISTING_RESULT_WINDOW.toLocaleString()} matching listings. Refine the filters to continue.`,
      });
    }
  });

export const csvListingRowSchemaBase = z.object({
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
  packagingType: z
    .preprocess(
      (v) => (v === "" ? undefined : v),
      productSpecificationFields.packagingType,
    )
    .optional(),
  installationMethod: z
    .preprocess(
      (v) => (v === "" ? undefined : v),
      productSpecificationFields.installationMethod,
    )
    .optional(),
  lotNumber: productSpecificationFields.lotNumber,
  waterResistance: z
    .preprocess(
      (v) => (v === "" ? undefined : v),
      productSpecificationFields.waterResistance,
    )
    .optional(),
  color: z.string().optional(),
  colorFamily: z.string().max(50).optional(),
  brand: z.string().max(255).optional(),
  modelNumber: z.string().max(255).optional(),
  wearLayer: z.coerce.number().positive().optional(),
  wearLayerUnit: z.string().trim().toLowerCase().pipe(z.enum(["mm", "mil"])).optional(),
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
  freightPaymentMode: z
    .enum(["buyer_pays", "seller_pays"])
    .default("buyer_pays"),
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

export const CSV_LISTING_FIELDS = Object.keys(csvListingRowSchemaBase.shape);
const CSV_REQUIRED_FIELDS = new Set([
  "title",
  "materialType",
  "totalSqFt",
  "askPricePerSqFt",
  "condition",
  "locationZip",
  "totalPallets",
  "palletWeight",
  "palletLength",
  "palletWidth",
  "palletHeight",
  "moq",
  "moqUnit",
]);
export const csvListingTransportSchema = z.preprocess((input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      typeof value === "string" &&
      value.trim() === "" &&
      !CSV_REQUIRED_FIELDS.has(key)
        ? undefined
        : value,
    ]),
  );
}, csvListingRowSchemaBase.strict().superRefine(applySellingRuleCrossFieldValidation));

// The browser rejects ambiguous rows before preview. The server also applies this
// contract to new claims after allowing a matching completed legacy replay.
export const csvListingRowSchema = csvListingTransportSchema.superRefine(applyPalletMinimumValidation).superRefine((row, ctx) => {
  try {
    normalizeCsvWearLayer(row.wearLayer, row.wearLayerUnit, row.materialType);
  } catch (error) {
    ctx.addIssue({
      code: "custom",
      path: [row.wearLayer !== undefined && row.wearLayerUnit === undefined ? "wearLayerUnit" : "wearLayer"],
      message: error instanceof Error ? error.message : "Check the wear-layer value and source unit.",
    });
  }
});

export type ListingFormInput = z.infer<typeof listingCreationSchema>;
export type ListingFilterInput = z.infer<typeof listingFilterSchema>;
export type CsvListingRow = z.infer<typeof csvListingRowSchema>;
