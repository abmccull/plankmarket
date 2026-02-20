import { z } from "zod";
import { noContactInfo } from "@/lib/content-filter/zod";

export const createReviewSchema = z.object({
  orderId: z.string().uuid(),
  direction: z.enum(["buyer_to_seller", "seller_to_buyer"]),
  rating: z
    .number()
    .int()
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5"),
  title: z.string().max(200, "Title must be at most 200 characters").superRefine(noContactInfo("review title")).optional(),
  comment: z
    .string()
    .max(2000, "Comment must be at most 2000 characters")
    .superRefine(noContactInfo("review comment"))
    .optional(),
  communicationRating: z
    .number()
    .int()
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5")
    .optional(),
  accuracyRating: z
    .number()
    .int()
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5")
    .optional(),
  shippingRating: z
    .number()
    .int()
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5")
    .optional(),
});

export const respondToReviewSchema = z.object({
  reviewId: z.string().uuid(),
  sellerResponse: z
    .string()
    .min(1, "Response cannot be empty")
    .max(2000, "Response must be at most 2000 characters")
    .superRefine(noContactInfo("seller response")),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type RespondToReviewInput = z.infer<typeof respondToReviewSchema>;
