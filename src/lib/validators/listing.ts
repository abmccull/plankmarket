import { z } from "zod";

export const listingFormSchema = z.object({
  // Step 1: Product Details
  title: z
    .string()
    .min(10, "Title must be at least 10 characters")
    .max(255, "Title must be at most 255 characters"),
  description: z
    .string()
    .max(5000, "Description must be at most 5000 characters")
    .optional(),
  materialType: z.enum([
    "hardwood",
    "engineered",
    "laminate",
    "vinyl_lvp",
    "bamboo",
    "tile",
    "other",
  ]),
  species: z.string().max(100).optional(),
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
  totalPallets: z
    .number()
    .int()
    .positive("Total pallets must be positive")
    .optional(),
  moq: z.number().positive("MOQ must be positive").optional(),
  locationCity: z.string().max(100).optional(),
  locationState: z.string().length(2, "State must be 2 characters").optional(),
  locationZip: z.string().max(10).optional(),

  // Step 3: Pricing
  askPricePerSqFt: z
    .number()
    .positive("Price per sq ft must be positive")
    .max(1000, "Price seems too high"),
  buyNowPrice: z.number().positive("Buy now price must be positive").optional(),
  allowOffers: z.boolean().default(true),
  floorPrice: z
    .number()
    .positive("Floor price must be positive")
    .optional(),

  // Step 4: Condition
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
  reasonCode: z
    .enum([
      "overproduction",
      "color_change",
      "line_discontinuation",
      "warehouse_clearance",
      "customer_return",
      "slight_defect",
      "packaging_damage",
      "end_of_season",
      "other",
    ])
    .optional(),
  certifications: z.array(z.string()).default([]),

  // Step 5: Media (handled separately via upload)
  mediaIds: z.array(z.string().uuid()).optional(),
});

export const listingFilterSchema = z.object({
  query: z.string().optional(),
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
      ])
    )
    .optional(),
  species: z.array(z.string()).optional(),
  colorFamily: z.array(z.string()).optional(),
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
      ])
    )
    .optional(),
  width: z.array(z.number()).optional(),
  thickness: z.array(z.number()).optional(),
  wearLayer: z.array(z.number()).optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
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
      ])
    )
    .optional(),
  state: z.array(z.string()).optional(),
  certifications: z.array(z.string()).optional(),
  minLotSize: z.number().optional(),
  maxLotSize: z.number().optional(),
  maxDistance: z.number().optional(),
  buyerZip: z.string().length(5).regex(/^\d{5}$/).optional(),
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
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(24),
});

export const csvListingRowSchema = z.object({
  title: z.string().min(1),
  materialType: z.string().min(1),
  totalSqFt: z.coerce.number().positive(),
  askPricePerSqFt: z.coerce.number().positive(),
  condition: z.string().min(1),
  species: z.string().optional(),
  finish: z.string().optional(),
  grade: z.string().optional(),
  color: z.string().optional(),
  thickness: z.coerce.number().optional(),
  width: z.coerce.number().optional(),
  length: z.coerce.number().optional(),
  sqFtPerBox: z.coerce.number().optional(),
  boxesPerPallet: z.coerce.number().int().optional(),
  totalPallets: z.coerce.number().int().optional(),
  moq: z.coerce.number().optional(),
  locationCity: z.string().optional(),
  locationState: z.string().optional(),
  locationZip: z.string().optional(),
  buyNowPrice: z.coerce.number().optional(),
  description: z.string().optional(),
});

export type ListingFormInput = z.infer<typeof listingFormSchema>;
export type ListingFilterInput = z.infer<typeof listingFilterSchema>;
