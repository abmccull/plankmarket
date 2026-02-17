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

const finishTypes = [
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
] as const;

export const buyerRequestSpecsSchema = z.object({
  thicknessMinMm: z.number().min(0).max(50).optional(),
  wearLayerMinMil: z.number().min(0).max(100).optional(),
  installTypes: z.array(z.enum(installTypes)).optional(),
  waterproofRequired: z.boolean().optional(),
  species: z.array(z.string().max(50)).max(10).optional(),
  finishTypes: z.array(z.enum(finishTypes)).optional(),
  certifications: z.array(z.enum(certifications)).optional(),
});

export const createBuyerRequestSchema = z.object({
  materialTypes: z
    .array(z.enum(materialTypes))
    .min(1, "Select at least one material type"),
  minTotalSqFt: z.number().positive("Must be greater than 0"),
  maxTotalSqFt: z.number().positive().optional(),
  priceMaxPerSqFt: z.number().positive("Must be greater than 0").max(100),
  priceMinPerSqFt: z.number().min(0).max(100).optional(),
  destinationZip: z.string().regex(/^\d{5}$/, "Enter a valid 5-digit ZIP"),
  pickupOk: z.boolean().default(false),
  pickupRadiusMiles: z.number().int().min(10).max(500).optional(),
  shippingOk: z.boolean().default(true),
  specs: buyerRequestSpecsSchema.optional(),
  notes: z.string().max(1000).optional(),
  urgency: z
    .enum(["asap", "2_weeks", "4_weeks", "flexible"])
    .default("flexible"),
});

export const updateBuyerRequestSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(1000).optional(),
  urgency: z.enum(["asap", "2_weeks", "4_weeks", "flexible"]).optional(),
  status: z.enum(["closed"]).optional(),
});

export const createResponseSchema = z.object({
  requestId: z.string().uuid(),
  listingId: z.string().uuid().optional(),
  message: z.string().min(1).max(2000),
});

export const buyerRequestFilterSchema = z.object({
  materialTypes: z.array(z.enum(materialTypes)).optional(),
  minSqFt: z.number().positive().optional(),
  maxSqFt: z.number().positive().optional(),
  maxPricePerSqFt: z.number().positive().optional(),
  destinationState: z.string().max(2).optional(),
  urgency: z.enum(["asap", "2_weeks", "4_weeks", "flexible"]).optional(),
  sort: z
    .enum(["newest", "urgency", "sqft_desc", "price_desc"])
    .default("newest"),
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

export type CreateBuyerRequest = z.infer<typeof createBuyerRequestSchema>;
export type CreateResponse = z.infer<typeof createResponseSchema>;
export type BuyerRequestFilter = z.infer<typeof buyerRequestFilterSchema>;
