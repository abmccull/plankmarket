import { z } from "zod";

export const registerSchema = z.object({
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
    .regex(/^\+?[\d\s\-()]{10,20}$/, "Please enter a valid phone number")
    .optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  phone: z
    .string()
    .regex(/^\+?[\d\s\-()]{10,20}$/)
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
