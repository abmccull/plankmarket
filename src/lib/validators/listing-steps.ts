import { z } from "zod";

// Step 1: Product Details
export const step1Schema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(200, "Title must be at most 200 characters"),
  materialType: z.enum([
    "hardwood",
    "engineered",
    "laminate",
    "vinyl_lvp",
    "bamboo",
    "tile",
    "other",
  ]),
});

// Step 2: Lot Details
export const step2Schema = z.object({
  totalSqFt: z
    .number()
    .positive("Total square footage must be positive"),
  widthInches: z
    .number()
    .positive("Width must be positive")
    .optional(),
  lengthInches: z
    .number()
    .positive("Length must be positive")
    .optional(),
  totalPallets: z.number().int().positive("Total pallets must be positive"),
  palletWeight: z.number().positive("Pallet weight is required").max(5000, "Maximum 5000 lbs per pallet"),
  palletLength: z.number().positive("Pallet length is required").max(120, "Maximum 120 inches"),
  palletWidth: z.number().positive("Pallet width is required").max(120, "Maximum 120 inches"),
  palletHeight: z.number().positive("Pallet height is required").max(120, "Maximum 120 inches"),
});

// Step 3: Pricing
export const step3Schema = z.object({
  askPricePerSqFt: z
    .number()
    .positive("Ask price per sq ft must be positive")
    .max(1000, "Price seems too high"),
  minimumOrderSqFt: z
    .number()
    .positive("Minimum order quantity must be positive")
    .optional(),
});

// Step 4: Condition
export const step4Schema = z.object({
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
});

// Step 5: Photos
export const step5Schema = z.object({
  photos: z
    .array(z.string())
    .min(1, "At least one photo is required")
    .max(20, "Maximum 20 photos allowed"),
});

// Step 6: Review - no validation needed, or just check that required fields are present
export const step6Schema = z.object({}).optional();

// Helper function to validate a specific step
export function validateStep(
  stepNumber: number,
  data: Record<string, unknown>
): { success: boolean; errors?: Record<string, string> } {
  try {
    let schema: z.ZodSchema;
    switch (stepNumber) {
      case 1:
        schema = step1Schema;
        break;
      case 2:
        schema = step2Schema;
        break;
      case 3:
        schema = step3Schema;
        break;
      case 4:
        schema = step4Schema;
        break;
      case 5:
        schema = step5Schema;
        break;
      case 6:
        // Review step - no validation needed
        return { success: true };
      default:
        return { success: false, errors: { general: "Invalid step number" } };
    }

    schema.parse(data);
    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.issues.forEach((err) => {
        const path = err.path.join(".");
        errors[path] = err.message;
      });
      return { success: false, errors };
    }
    return {
      success: false,
      errors: { general: "Validation failed" },
    };
  }
}

export type Step1Input = z.infer<typeof step1Schema>;
export type Step2Input = z.infer<typeof step2Schema>;
export type Step3Input = z.infer<typeof step3Schema>;
export type Step4Input = z.infer<typeof step4Schema>;
export type Step5Input = z.infer<typeof step5Schema>;
