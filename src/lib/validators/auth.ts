import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";

export const registerSchema = z.object({
  // Account info
  email: z.string().email("Please enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
  name: z.string().min(2, "Name must be at least 2 characters").max(255),
  role: z.enum(["buyer", "seller"]),
  businessName: z.string().min(2, "Business name is required").max(255),
  phone: z
    .string()
    .refine((val) => !val || isValidPhoneNumber(val, "US"), {
      message: "Please enter a valid phone number",
    })
    .optional(),
  zipCode: z
    .string()
    .length(5, "ZIP code must be 5 digits")
    .regex(/^\d{5}$/, "Invalid ZIP code"),
});

export const submitVerificationSchema = z.object({
  einTaxId: z
    .string()
    .regex(/^\d{2}-\d{7}$/, "EIN must be in XX-XXXXXXX format"),
  businessWebsite: z
    .string()
    .url("Please enter a valid URL")
    .optional()
    .or(z.literal("")),
  verificationDocUrl: z
    .string()
    .url("Please provide a valid verification document URL")
    .min(1, "Verification document URL is required"),
  businessAddress: z.string().min(1, "Business address is required").max(500),
  businessCity: z.string().min(1, "City is required").max(100),
  businessState: z.string().length(2, "State must be 2-letter abbreviation"),
  businessZip: z.string().min(5, "ZIP code is required").max(10),
});

/**
 * Drafts deliberately accept incomplete values so a user can stop mid-step.
 * The strict submitVerificationSchema remains the final submission gate.
 */
export const saveVerificationDraftSchema = z.object({
  currentStep: z.number().int().min(1).max(3),
  businessWebsite: z.string().max(2048).optional(),
  einTaxId: z.string().max(11).optional(),
  verificationDocUrl: z.string().max(2048).optional(),
  businessAddress: z.string().max(500).optional(),
  businessCity: z.string().max(100).optional(),
  businessState: z.string().max(2).optional(),
  businessZip: z.string().max(10).optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  phone: z
    .string()
    .refine((val) => !val || isValidPhoneNumber(val, "US"), {
      message: "Please enter a valid phone number",
    })
    .optional()
    .nullable(),
  businessName: z.string().min(2).max(255).optional().nullable(),
  businessAddress: z.string().max(500).optional().nullable(),
  businessCity: z.string().max(100).optional().nullable(),
  businessState: z.string().length(2).optional().nullable(),
  businessZip: z.string().max(10).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;
export type SaveVerificationDraftInput = z.infer<
  typeof saveVerificationDraftSchema
>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
