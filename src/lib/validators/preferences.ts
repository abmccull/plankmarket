import { z } from "zod";

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
});

export const upsertPreferencesSchema = z.discriminatedUnion("role", [
  z
    .object({ role: z.literal("buyer") })
    .merge(buyerPreferencesSchema),
  z
    .object({ role: z.literal("seller") })
    .merge(sellerPreferencesSchema),
]);

export type BuyerPreferences = z.infer<typeof buyerPreferencesSchema>;
export type SellerPreferences = z.infer<typeof sellerPreferencesSchema>;
export type UpsertPreferences = z.infer<typeof upsertPreferencesSchema>;
