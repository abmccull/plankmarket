import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";

export const createShippingAddressSchema = z.object({
  label: z.string().min(1, "Label is required").max(100),
  name: z.string().min(2, "Name is required").max(255),
  address: z.string().min(5, "Address is required"),
  city: z.string().min(2, "City is required").max(100),
  state: z.string().length(2, "State must be 2 characters"),
  zip: z.string().min(5, "ZIP code is required").max(10),
  phone: z
    .string()
    .refine((val) => !val || isValidPhoneNumber(val, "US"), {
      message: "Please enter a valid phone number",
    })
    .optional(),
  isDefault: z.boolean().optional(),
});

export const updateShippingAddressSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(100).optional(),
  name: z.string().min(2).max(255).optional(),
  address: z.string().min(5).optional(),
  city: z.string().min(2).max(100).optional(),
  state: z.string().length(2).optional(),
  zip: z.string().min(5).max(10).optional(),
  phone: z
    .string()
    .refine((val) => !val || isValidPhoneNumber(val, "US"), {
      message: "Please enter a valid phone number",
    })
    .optional(),
  isDefault: z.boolean().optional(),
});

export type CreateShippingAddressInput = z.infer<typeof createShippingAddressSchema>;
export type UpdateShippingAddressInput = z.infer<typeof updateShippingAddressSchema>;
