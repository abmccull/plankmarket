import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  sellerProcedure,
} from "../trpc";
import {
  createReviewSchema,
  respondToReviewSchema,
} from "@/lib/validators/review";
import { reviews, orders } from "../db/schema";
import { eq, and, desc, sql, avg } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const reviewRouter = createTRPCRouter({
  // Create a review for an order
  create: protectedProcedure
    .input(createReviewSchema)
    .mutation(async ({ ctx, input }) => {
      // Get the order
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      // Verify user is the buyer
      if (order.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the buyer can review this order",
        });
      }

      // Verify order is delivered
      if (order.status !== "delivered") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can only review delivered orders",
        });
      }

      // Check if review already exists
      const existingReview = await ctx.db.query.reviews.findFirst({
        where: eq(reviews.orderId, input.orderId),
      });

      if (existingReview) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You have already reviewed this order",
        });
      }

      // Create the review
      const [review] = await ctx.db
        .insert(reviews)
        .values({
          orderId: input.orderId,
          reviewerId: ctx.user.id,
          sellerId: order.sellerId,
          rating: input.rating,
          title: input.title,
          comment: input.comment,
          communicationRating: input.communicationRating,
          accuracyRating: input.accuracyRating,
          shippingRating: input.shippingRating,
        })
        .returning();

      return review;
    }),

  // Get review by order ID
  getByOrder: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const review = await ctx.db.query.reviews.findFirst({
        where: eq(reviews.orderId, input.orderId),
        with: {
          reviewer: {
            columns: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      });

      return review;
    }),

  // Get all reviews for a seller with pagination
  getBySeller: publicProcedure
    .input(
      z.object({
        sellerId: z.string().uuid(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const reviewsList = await ctx.db.query.reviews.findMany({
        where: eq(reviews.sellerId, input.sellerId),
        orderBy: [desc(reviews.createdAt)],
        limit: input.limit,
        offset,
        with: {
          reviewer: {
            columns: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(reviews)
        .where(eq(reviews.sellerId, input.sellerId));

      return {
        reviews: reviewsList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Seller responds to a review
  respond: sellerProcedure
    .input(respondToReviewSchema)
    .mutation(async ({ ctx, input }) => {
      // Get the review
      const review = await ctx.db.query.reviews.findFirst({
        where: eq(reviews.id, input.reviewId),
      });

      if (!review) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Review not found",
        });
      }

      // Verify user is the seller
      if (review.sellerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only respond to reviews on your orders",
        });
      }

      // Check if already responded
      if (review.sellerResponse) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You have already responded to this review",
        });
      }

      // Update the review
      const [updatedReview] = await ctx.db
        .update(reviews)
        .set({
          sellerResponse: input.sellerResponse,
          sellerRespondedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, input.reviewId))
        .returning();

      return updatedReview;
    }),

  // Get average rating for a seller
  getAverageRating: publicProcedure
    .input(z.object({ sellerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select({
          averageRating: avg(reviews.rating),
          totalReviews: sql<number>`cast(count(*) as integer)`,
        })
        .from(reviews)
        .where(eq(reviews.sellerId, input.sellerId));

      const averageRating = result[0]?.averageRating
        ? parseFloat(result[0].averageRating as unknown as string)
        : null;
      const totalReviews = result[0]?.totalReviews ?? 0;

      return {
        averageRating: averageRating
          ? Math.round(averageRating * 10) / 10
          : null,
        totalReviews,
      };
    }),
});
