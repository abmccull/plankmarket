import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";

export const registerSchema = z.object({
  // Step 1: Account info
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
  // Step 2: Business verification
  einTaxId: z
    .string()
    .regex(/^\d{2}-\d{7}$/, "EIN must be in XX-XXXXXXX format"),
  businessWebsite: z
    .string()
    .url("Please enter a valid URL")
    .min(1, "Business website is required"),
  verificationDocUrl: z
    .string()
    .url("Please upload a business license or resale certificate")
    .min(1, "Business license is required"),
  businessAddress: z.string().min(1, "Business address is required").max(500),
  businessCity: z.string().min(1, "City is required").max(100),
  businessState: z.string().length(2, "State must be 2-letter abbreviation"),
  businessZip: z.string().min(5, "ZIP code is required").max(10),
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
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
