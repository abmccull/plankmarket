import { z } from "zod";
import { US_STATE_CODES } from "@/lib/selling-territory";

const materialTypes = [
  "hardwood",
  "engineered",
  "laminate",
  "vinyl_lvp",
  "bamboo",
  "tile",
  "other",
] as const;

const installTypes = ["click", "glue", "nail", "float"] as const;

const certifications = [
  "FSC",
  "FloorScore",
  "GreenGuard",
  "GreenGuard Gold",
  "CARB2",
  "LEED",
  "NAUF",
] as const;

const inventorySources = [
  "closeout",
  "overstock",
  "discontinued",
  "returns",
  "seconds",
] as const;

export const buyerPreferencesSchema = z.object({
  preferredZip: z.string().regex(/^\d{5}$/).optional(),
  preferredRadiusMiles: z.number().int().min(10).max(3000).optional(),
  preferredMaterialTypes: z.array(z.enum(materialTypes)).optional(),
  preferredSpecies: z.array(z.string().max(50)).max(20).optional(),
  preferredUseCase: z
    .enum(["residential", "commercial", "multifamily", "flips", "other"])
    .optional(),
  minLotSizeSqFt: z.number().positive().max(1000000).optional(),
  maxLotSizeSqFt: z.number().positive().max(1000000).optional(),
  priceMinPerSqFt: z.number().min(0).max(100).optional(),
  priceMaxPerSqFt: z.number().min(0).max(100).optional(),
  preferredShippingMode: z.enum(["pickup", "ship", "both"]).optional(),
  urgency: z.enum(["asap", "2_weeks", "4_weeks", "flexible"]).optional(),
  preferredInstallTypes: z.array(z.enum(installTypes)).optional(),
  minThicknessMm: z.number().min(0).max(50).optional(),
  minWearLayerMil: z.number().min(0).max(100).optional(),
  preferredCertifications: z.array(z.enum(certifications)).optional(),
  waterproofRequired: z.boolean().optional(),
});

export const sellerPreferencesSchema = z.object({
  originZip: z.string().regex(/^\d{5}$/).optional(),
  shipCapable: z.boolean().optional(),
  leadTimeDaysMin: z.number().int().min(0).max(90).optional(),
  leadTimeDaysMax: z.number().int().min(0).max(90).optional(),
  typicalMaterialTypes: z.array(z.enum(materialTypes)).optional(),
  minLotSqFt: z.number().positive().max(1000000).optional(),
  avgLotSqFt: z.number().positive().max(1000000).optional(),
  canSplitLots: z.boolean().optional(),
  preferredBuyerRadiusMiles: z.number().int().min(10).max(3000).optional(),
  pricingStyle: z.enum(["fixed", "negotiable", "tiered"]).optional(),
  palletizationCapable: z.boolean().optional(),
  inventorySource: z.array(z.enum(inventorySources)).optional(),
  partialQuantityMarkupPercent: z
    .number()
    .min(0)
    .max(500)
    .nullable()
    .optional(),
  automaticMarkdownEnabled: z.boolean().optional(),
  automaticMarkdownFloorPercent: z
    .number()
    .positive()
    .max(100)
    .nullable()
    .optional(),
  automaticMarkdownIntervalDays: z
    .number()
    .int()
    .min(1)
    .max(365)
    .nullable()
    .optional(),
  defaultAllowOffers: z.boolean().optional(),
  allowSampleRequests: z.boolean().optional(),
  sellingTerritoryMode: z
    .enum(["unrestricted", "allowed_states"])
    .optional(),
  allowedDestinationStates: z.array(z.enum(US_STATE_CODES)).max(50).optional(),
  freightPaymentMode: z.enum(["buyer_pays", "seller_pays"]).optional(),
  sellerFreightStates: z.array(z.enum(US_STATE_CODES)).max(50).optional(),
  freightDropCharge: z.number().min(0).max(100000).nullable().optional(),
  taxRegisteredStates: z.array(z.enum(US_STATE_CODES)).max(50).optional(),
});

/**
 * The complete commercial subset used when a seller explicitly applies saved
 * defaults to existing active listings. Unlike the broader preferences form,
 * these fields are intentionally complete so a bulk operation can validate
 * the full post-update listing rule bundle instead of merging partial input.
 */
export const sellerCommercialDefaultsSchema = z
  .object({
    canSplitLots: z.boolean(),
    partialQuantityMarkupPercent: z.number().min(0).max(500).nullable(),
    automaticMarkdownEnabled: z.boolean(),
    automaticMarkdownFloorPercent: z
      .number()
      .positive()
      .max(100)
      .nullable(),
    automaticMarkdownIntervalDays: z
      .number()
      .int()
      .min(1)
      .max(365)
      .nullable(),
    defaultAllowOffers: z.boolean(),
    allowSampleRequests: z.boolean(),
    sellingTerritoryMode: z.enum(["unrestricted", "allowed_states"]),
    allowedDestinationStates: z.array(z.enum(US_STATE_CODES)).max(50),
    freightPaymentMode: z.enum(["buyer_pays", "seller_pays"]),
    sellerFreightStates: z.array(z.enum(US_STATE_CODES)).max(50),
    freightDropCharge: z.number().min(0).max(100000).nullable(),
  })
  .superRefine((data, ctx) => {
    if (
      data.automaticMarkdownEnabled &&
      data.automaticMarkdownFloorPercent == null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["automaticMarkdownFloorPercent"],
        message: "Enter a lowest price before applying automatic markdown",
      });
    }

    if (
      data.automaticMarkdownEnabled &&
      data.automaticMarkdownIntervalDays == null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["automaticMarkdownIntervalDays"],
        message: "Enter a markdown interval before applying automatic markdown",
      });
    }

    if (
      data.sellingTerritoryMode === "allowed_states" &&
      data.allowedDestinationStates.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["allowedDestinationStates"],
        message: "Select at least one state for a restricted selling territory",
      });
    }
  })
  .transform((data) => ({
    ...data,
    partialQuantityMarkupPercent: data.canSplitLots
      ? data.partialQuantityMarkupPercent
      : null,
    automaticMarkdownFloorPercent: data.automaticMarkdownEnabled
      ? data.automaticMarkdownFloorPercent
      : null,
    automaticMarkdownIntervalDays: data.automaticMarkdownEnabled
      ? data.automaticMarkdownIntervalDays
      : null,
    allowedDestinationStates:
      data.sellingTerritoryMode === "allowed_states"
        ? data.allowedDestinationStates
        : [],
    sellerFreightStates:
      data.freightPaymentMode === "seller_pays"
        ? data.sellerFreightStates
        : [],
    freightDropCharge:
      data.freightPaymentMode === "seller_pays"
        ? data.freightDropCharge
        : null,
  }));

export const upsertPreferencesSchema = z
  .discriminatedUnion("role", [
    z
      .object({ role: z.literal("buyer") })
      .merge(buyerPreferencesSchema),
    z
      .object({ role: z.literal("seller") })
      .merge(sellerPreferencesSchema),
  ])
  .superRefine((data, ctx) => {
    if (data.role !== "seller") return;

    if (
      data.automaticMarkdownEnabled &&
      data.automaticMarkdownFloorPercent == null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["automaticMarkdownFloorPercent"],
        message: "Enter a lowest price for automatic markdown",
      });
    }
    if (
      data.automaticMarkdownEnabled &&
      data.automaticMarkdownIntervalDays == null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["automaticMarkdownIntervalDays"],
        message: "Enter a markdown interval",
      });
    }
    if (
      data.sellingTerritoryMode === "allowed_states" &&
      (data.allowedDestinationStates?.length ?? 0) === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["allowedDestinationStates"],
        message: "Select at least one allowed destination state",
      });
    }
  });

export type BuyerPreferences = z.infer<typeof buyerPreferencesSchema>;
export type SellerPreferences = z.infer<typeof sellerPreferencesSchema>;
export type SellerCommercialDefaults = z.infer<
  typeof sellerCommercialDefaultsSchema
>;
export type UpsertPreferences = z.infer<typeof upsertPreferencesSchema>;
