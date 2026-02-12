import { z } from "zod";

export const promotionTierSchema = z.enum(["spotlight", "featured", "premium"]);
export const promotionDurationSchema = z.union([
  z.literal(7),
  z.literal(14),
  z.literal(30),
]);

export const purchasePromotionSchema = z.object({
  listingId: z.string().uuid(),
  tier: promotionTierSchema,
  durationDays: promotionDurationSchema,
});

export const cancelPromotionSchema = z.object({
  promotionId: z.string().uuid(),
});

export type PurchasePromotionInput = z.infer<typeof purchasePromotionSchema>;
export type CancelPromotionInput = z.infer<typeof cancelPromotionSchema>;
