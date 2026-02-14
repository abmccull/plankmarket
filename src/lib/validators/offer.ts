import { z } from "zod";
import { noContactInfo } from "@/lib/content-filter/zod";

export const createOfferSchema = z.object({
  listingId: z.string().uuid(),
  offerPricePerSqFt: z
    .number()
    .positive("Offer price must be positive")
    .max(1000, "Price seems too high"),
  quantitySqFt: z
    .number()
    .positive("Quantity must be positive")
    .max(1000000, "Quantity seems too high"),
  message: z
    .string()
    .max(500, "Message must be at most 500 characters")
    .superRefine(noContactInfo("offer message"))
    .optional(),
});

export const counterOfferSchema = z.object({
  offerId: z.string().uuid(),
  pricePerSqFt: z
    .number()
    .positive("Price must be positive")
    .max(1000, "Price seems too high"),
  message: z
    .string()
    .max(500, "Message must be at most 500 characters")
    .superRefine(noContactInfo("counter offer message"))
    .optional(),
});

export const acceptOfferSchema = z.object({
  offerId: z.string().uuid(),
});

export const rejectOfferSchema = z.object({
  offerId: z.string().uuid(),
  message: z
    .string()
    .max(500, "Message must be at most 500 characters")
    .superRefine(noContactInfo("rejection message"))
    .optional(),
});

export const withdrawOfferSchema = z.object({
  offerId: z.string().uuid(),
});

export const getOfferByIdSchema = z.object({
  offerId: z.string().uuid(),
});

export const respondToOfferSchema = z
  .object({
    offerId: z.string().uuid(),
    action: z.enum(["accept", "reject", "counter"]),
    counterPricePerSqFt: z
      .number()
      .positive("Counter price must be positive")
      .max(1000, "Price seems too high")
      .optional(),
    counterMessage: z
      .string()
      .max(500, "Message must be at most 500 characters")
      .superRefine(noContactInfo("counter message"))
      .optional(),
  })
  .refine(
    (data) => {
      if (data.action === "counter") {
        return data.counterPricePerSqFt !== undefined;
      }
      return true;
    },
    {
      message: "Counter price is required when countering an offer",
      path: ["counterPricePerSqFt"],
    }
  );

export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type CounterOfferInput = z.infer<typeof counterOfferSchema>;
export type AcceptOfferInput = z.infer<typeof acceptOfferSchema>;
export type RejectOfferInput = z.infer<typeof rejectOfferSchema>;
export type WithdrawOfferInput = z.infer<typeof withdrawOfferSchema>;
export type GetOfferByIdInput = z.infer<typeof getOfferByIdSchema>;
export type RespondToOfferInput = z.infer<typeof respondToOfferSchema>;
