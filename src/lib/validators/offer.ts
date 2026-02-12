import { z } from "zod";

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
    .optional(),
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
export type RespondToOfferInput = z.infer<typeof respondToOfferSchema>;
