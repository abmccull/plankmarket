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
  preferredZip: z.string().regex(/^\d{5}$/).nullable().optional(),
  preferredRadiusMiles: z.number().int().min(10).max(3000).nullable().optional(),
  preferredMaterialTypes: z.array(z.enum(materialTypes)).optional(),
  preferredSpecies: z.array(z.string().max(50)).max(20).optional(),
  preferredUseCase: z
    .enum(["residential", "commercial", "multifamily", "flips", "other"])
    .nullable()
    .optional(),
  minLotSizeSqFt: z.number().positive().max(1000000).nullable().optional(),
  maxLotSizeSqFt: z.number().positive().max(1000000).nullable().optional(),
  priceMinPerSqFt: z.number().min(0).max(100).nullable().optional(),
  priceMaxPerSqFt: z.number().min(0).max(100).nullable().optional(),
  preferredShippingMode: z.enum(["pickup", "ship", "both"]).nullable().optional(),
  urgency: z.enum(["asap", "2_weeks", "4_weeks", "flexible"]).nullable().optional(),
  preferredInstallTypes: z.array(z.enum(installTypes)).optional(),
  minThicknessMm: z.number().min(0).max(50).nullable().optional(),
  minWearLayerMil: z.number().min(0).max(100).nullable().optional(),
  preferredCertifications: z.array(z.enum(certifications)).optional(),
  waterproofRequired: z.boolean().optional(),
  buyerMatchInAppEnabled: z.boolean().optional(),
  buyerMatchEmailEnabled: z.boolean().optional(),
});

export const sellerPreferencesSchema = z.object({
  originZip: z.string().regex(/^\d{5}$/).nullable().optional(),
  shipCapable: z.boolean().optional(),
  leadTimeDaysMin: z.number().int().min(0).max(90).nullable().optional(),
  leadTimeDaysMax: z.number().int().min(0).max(90).nullable().optional(),
  typicalMaterialTypes: z.array(z.enum(materialTypes)).optional(),
  minLotSqFt: z.number().positive().max(1000000).nullable().optional(),
  avgLotSqFt: z.number().positive().max(1000000).nullable().optional(),
  canSplitLots: z.boolean().optional(),
  preferredBuyerRadiusMiles: z.number().int().min(10).max(3000).nullable().optional(),
  pricingStyle: z.enum(["fixed", "negotiable", "tiered"]).nullable().optional(),
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
      .object({
        role: z.literal("buyer"),
        analyticsTrackingEnabled: z.boolean().nullable().optional(),
      })
      .merge(buyerPreferencesSchema),
    z
      .object({
        role: z.literal("seller"),
        analyticsTrackingEnabled: z.boolean().nullable().optional(),
      })
      .merge(sellerPreferencesSchema),
  ]);

/** Validate dependencies only after the owned patch is merged with saved answers. */
export const mergedPreferencesSchema = upsertPreferencesSchema
  .superRefine((data, ctx) => {
    if (data.role === "buyer") {
      if (data.priceMinPerSqFt != null && data.priceMaxPerSqFt != null &&
          data.priceMinPerSqFt > data.priceMaxPerSqFt) {
        ctx.addIssue({ code: "custom", path: ["priceMaxPerSqFt"], message: "Maximum price must be at least the minimum price" });
      }
      if (data.minLotSizeSqFt != null && data.maxLotSizeSqFt != null &&
          data.minLotSizeSqFt > data.maxLotSizeSqFt) {
        ctx.addIssue({ code: "custom", path: ["maxLotSizeSqFt"], message: "Maximum lot size must be at least the minimum lot size" });
      }
    }
    if (data.role !== "seller") return;

    if (data.leadTimeDaysMin != null && data.leadTimeDaysMax != null &&
        data.leadTimeDaysMin > data.leadTimeDaysMax) {
      ctx.addIssue({ code: "custom", path: ["leadTimeDaysMax"], message: "Maximum lead time must be at least the minimum lead time" });
    }

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
