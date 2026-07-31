import { z } from "zod";
import { isValidPhoneNumber } from "libphonenumber-js";
import { isUsStateCode, type UsStateCode } from "@/lib/selling-territory";

export const createSampleRequestSchema = z.object({
  listingId: z.string().uuid(),
  buyerMessage: z
    .string()
    .trim()
    .max(1000, "Notes must be 1000 characters or fewer")
    .optional(),
  shippingName: z.string().trim().min(2, "Name is required").max(255),
  shippingAddress1: z.string().trim().min(5, "Address is required").max(255),
  shippingAddress2: z.string().trim().max(255).optional(),
  shippingCity: z.string().trim().min(2, "City is required").max(100),
  shippingState: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => isUsStateCode(value), "Select a valid state")
    .transform((value) => value as UsStateCode),
  shippingZip: z.string().regex(/^\d{5}(?:-\d{4})?$/, "Enter a valid ZIP code"),
  shippingPhone: z
    .string()
    .trim()
    .refine((value) => !value || isValidPhoneNumber(value, "US"), {
      message: "Please enter a valid phone number",
    })
    .optional(),
  consentToShareAddress: z.literal(true, {
    message:
      "You must authorize address sharing after seller approval to request a sample.",
  }),
});

export const sampleRequestActionSchema = z
  .object({
    requestId: z.string().uuid(),
    action: z.enum(["approve", "decline", "cancel", "ship", "deliver"]),
    reason: z.string().trim().min(3, "Reason is required").max(500),
    carrier: z.string().trim().max(100).optional(),
    trackingNumber: z.string().trim().max(120).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "ship" && !value.carrier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["carrier"],
        message: "Carrier is required when marking a sample as shipped",
      });
    }
  });

export type CreateSampleRequestInput = z.infer<typeof createSampleRequestSchema>;
export type SampleRequestActionInput = z.infer<typeof sampleRequestActionSchema>;
