import {
  createTRPCRouter,
  protectedProcedure,
  verifiedProcedure,
  publicProcedure,
} from "../trpc";
import {
  createReviewSchema,
  respondToReviewSchema,
} from "@/lib/validators/review";
import { reviews, orders } from "../db/schema";
import { eq, desc, sql, avg, and, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const reviewRouter = createTRPCRouter({
  // Create a review for an order (buyer→seller or seller→buyer)
  create: verifiedProcedure
    .input(createReviewSchema)
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      // Verify order is delivered
      if (order.status !== "delivered") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can only review delivered orders",
        });
      }

      // Determine reviewer/reviewee based on direction
      let revieweeId: string;
      if (input.direction === "buyer_to_seller") {
        if (order.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the buyer can leave a buyer-to-seller review",
          });
        }
        revieweeId = order.sellerId;
      } else {
        if (order.sellerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the seller can leave a seller-to-buyer review",
          });
        }
        revieweeId = order.buyerId;
      }

      // Check if review already exists for this direction
      const existingReview = await ctx.db.query.reviews.findFirst({
        where: and(
          eq(reviews.orderId, input.orderId),
          eq(reviews.direction, input.direction)
        ),
      });

      if (existingReview) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You have already reviewed this order",
        });
      }

      const [review] = await ctx.db
        .insert(reviews)
        .values({
          orderId: input.orderId,
          reviewerId: ctx.user.id,
          sellerId: order.sellerId,
          revieweeId,
          direction: input.direction,
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

  // Get reviews by order ID — returns both directions
  getByOrder: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      // Only buyer, seller, or admin can view
      const isAdmin = ctx.user.role === "admin";
      if (
        order.buyerId !== ctx.user.id &&
        order.sellerId !== ctx.user.id &&
        !isAdmin
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this order's reviews",
        });
      }

      const orderReviews = await ctx.db.query.reviews.findMany({
        where: eq(reviews.orderId, input.orderId),
        with: {
          reviewer: {
            columns: {
              id: true,
              role: true,
            },
          },
        },
      });

      return {
        buyerToSeller:
          orderReviews.find((r) => r.direction === "buyer_to_seller") ?? null,
        sellerToBuyer:
          orderReviews.find((r) => r.direction === "seller_to_buyer") ?? null,
      };
    }),

  // Get all reviews where a user is the reviewee (works for any user)
  getByReviewee: publicProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const reviewsList = await ctx.db.query.reviews.findMany({
        where: eq(reviews.revieweeId, input.userId),
        orderBy: [desc(reviews.createdAt)],
        limit: input.limit,
        offset,
        with: {
          reviewer: {
            columns: {
              id: true,
              role: true,
            },
          },
        },
      });

      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(reviews)
        .where(eq(reviews.revieweeId, input.userId));

      return {
        reviews: reviewsList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Seller responds to a buyer→seller review
  respond: verifiedProcedure
    .input(respondToReviewSchema)
    .mutation(async ({ ctx, input }) => {
      const review = await ctx.db.query.reviews.findFirst({
        where: eq(reviews.id, input.reviewId),
      });

      if (!review) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Review not found",
        });
      }

      if (review.sellerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only respond to reviews on your orders",
        });
      }

      if (review.sellerResponse) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You have already responded to this review",
        });
      }

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

  // Get reputation for any user (rating, review count, completed transactions)
  getUserReputation: publicProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      // Get average rating and review count where user is reviewee
      const ratingResult = await ctx.db
        .select({
          averageRating: avg(reviews.rating),
          reviewCount: sql<number>`cast(count(*) as integer)`,
        })
        .from(reviews)
        .where(eq(reviews.revieweeId, input.userId));

      const averageRating = ratingResult[0]?.averageRating
        ? parseFloat(ratingResult[0].averageRating as unknown as string)
        : null;
      const reviewCount = ratingResult[0]?.reviewCount ?? 0;

      // Get completed transaction count (as buyer or seller)
      const [txResult] = await ctx.db
        .select({
          completedTransactions: sql<number>`cast(count(*) as integer)`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.status, "delivered"),
            or(
              eq(orders.buyerId, input.userId),
              eq(orders.sellerId, input.userId)
            )
          )
        );

      return {
        averageRating: averageRating
          ? Math.round(averageRating * 10) / 10
          : null,
        reviewCount,
        completedTransactions: txResult?.completedTransactions ?? 0,
      };
    }),
});
