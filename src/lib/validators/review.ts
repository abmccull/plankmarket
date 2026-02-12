import { z } from "zod";

export const createReviewSchema = z.object({
  orderId: z.string().uuid(),
  rating: z
    .number()
    .int()
    .min(1, "Rating must be at least 1")
    .max(5, "Rating must be at most 5"),
  title: z.string().max(200, "Title must be at most 200 characters").optional(),
  comment: z
    .string()
    .max(2000, "Comment must be at most 2000 characters")
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
    .max(2000, "Response must be at most 2000 characters"),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type RespondToReviewInput = z.infer<typeof respondToReviewSchema>;
