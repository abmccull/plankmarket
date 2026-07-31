import {
  createTRPCRouter,
  publicProcedure,
  sellerProcedure,
  adminProcedure,
  strictSellerProcedure,
} from "../trpc";
import {
  purchasePromotionSchema,
  cancelPromotionSchema,
} from "@/lib/validators/promotion";
import { listings, listingPromotions, promotionCredits } from "../db/schema";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import {
  publicListingColumns,
  publicMediaColumns,
  publicSellerColumns,
  toPublicListing,
} from "@/server/security/public-data";
import { publicActiveListingWhere } from "@/server/security/listing-visibility";
import {
  prepareCancelledPromotionRefund,
  prepareExpiredPromotionRefund,
  PromotionNotActiveError,
  reconcilePromotionRefundResult,
} from "@/server/services/promotion-refund-reconciliation";

// Pricing matrix: tier × duration → price in dollars
const PRICING: Record<string, Record<number, number>> = {
  spotlight: { 7: 29, 14: 49, 30: 99 },
  featured: { 7: 79, 14: 139, 30: 249 },
  premium: { 7: 199, 14: 349, 30: 599 },
};


export const promotionRouter = createTRPCRouter({
  // Return the pricing matrix (no DB query)
  getPricing: publicProcedure.query(() => {
    return PRICING;
  }),

  // Purchase a promotion for a listing
  purchase: strictSellerProcedure
    .input(purchasePromotionSchema)
    .mutation(async ({ ctx, input }) => {
      // Validate listing exists, is active, and belongs to the seller
      const listing = await ctx.db.query.listings.findFirst({
        where: and(
          eq(listings.id, input.listingId),
          eq(listings.sellerId, ctx.user.id)
        ),
        with: {
          media: { columns: { id: true } },
        },
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found or you do not own it",
        });
      }

      if (listing.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only active listings can be promoted",
        });
      }

      // Quality gate: 3+ photos, 100+ char description, verified seller
      if (listing.media.length < 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Listing must have at least 3 photos to be promoted",
        });
      }

      if (!listing.description || listing.description.length < 100) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Listing description must be at least 100 characters to be promoted",
        });
      }

      if (
        ctx.user.role !== "admin" &&
        ctx.user.verificationStatus !== "verified"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only verified sellers can promote listings",
        });
      }

      // Check listing has been active for 24h+
      const listingAge =
        Date.now() - new Date(listing.createdAt).getTime();
      if (listingAge < 24 * 60 * 60 * 1000) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Listing must be active for at least 24 hours before promotion",
        });
      }

      // No existing active promotion on this listing
      const existingPromotion =
        await ctx.db.query.listingPromotions.findFirst({
          where: and(
            eq(listingPromotions.listingId, input.listingId),
            eq(listingPromotions.isActive, true),
            gt(listingPromotions.expiresAt, new Date())
          ),
        });

      if (existingPromotion) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This listing already has an active promotion",
        });
      }

      // Check 30% category cap: seller can't hold >30% of promoted slots in same materialType
      const [promotedInCategory] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(listingPromotions)
        .innerJoin(listings, eq(listingPromotions.listingId, listings.id))
        .where(
          and(
            eq(listings.materialType, listing.materialType),
            eq(listingPromotions.isActive, true),
            gt(listingPromotions.expiresAt, new Date()),
            eq(listingPromotions.sellerId, ctx.user.id)
          )
        );

      const [totalPromotedInCategory] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(listingPromotions)
        .innerJoin(listings, eq(listingPromotions.listingId, listings.id))
        .where(
          and(
            eq(listings.materialType, listing.materialType),
            eq(listingPromotions.isActive, true),
            gt(listingPromotions.expiresAt, new Date())
          )
        );

      const sellerCount = promotedInCategory?.count ?? 0;
      const totalCount = totalPromotedInCategory?.count ?? 0;

      // After adding this one, seller would have sellerCount+1 out of totalCount+1
      if (totalCount > 0 && (sellerCount + 1) / (totalCount + 1) > 0.3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "You cannot hold more than 30% of promoted slots in this category",
        });
      }

      // Calculate price
      const price = PRICING[input.tier]?.[input.durationDays];
      if (!price) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid tier or duration",
        });
      }

      const now = new Date();

      // Read credits with FOR UPDATE lock inside transaction to prevent double-spend.
      // Decide full/partial/no-credit path within the same transaction context.
      const creditResult = await ctx.db.transaction(async (tx) => {
        // Lock and read credits inside transaction to prevent concurrent spend
        const lockedCredits = await tx.execute(
          sql`SELECT id, amount, used_amount, expires_at
              FROM promotion_credits
              WHERE user_id = ${ctx.user.id}
                AND expires_at > now()
                AND used_amount < amount
              ORDER BY expires_at ASC
              FOR UPDATE`
        );

        const availableCredits = (lockedCredits as unknown) as Array<{
          id: string;
          amount: number;
          used_amount: number;
          expires_at: Date;
        }>;

        const totalCredit = availableCredits.reduce(
          (sum, c) => sum + (Number(c.amount) - Number(c.used_amount)),
          0
        );

        // FULL CREDIT PATH: credits fully cover the price, skip Stripe
        if (totalCredit >= price) {
          let remaining = price;
          for (const credit of availableCredits) {
            if (remaining <= 0) break;
            const available = Number(credit.amount) - Number(credit.used_amount);
            const deduct = Math.min(available, remaining);
            await tx
              .update(promotionCredits)
              .set({ usedAmount: Number(credit.used_amount) + deduct })
              .where(eq(promotionCredits.id, credit.id));
            remaining -= deduct;
          }

          // Create promotion as immediately active (paid via credits)
          const [promotion] = await tx
            .insert(listingPromotions)
            .values({
              listingId: input.listingId,
              sellerId: ctx.user.id,
              tier: input.tier,
              durationDays: input.durationDays,
              pricePaid: price,
              startsAt: now,
              expiresAt: new Date(
                now.getTime() + input.durationDays * 24 * 60 * 60 * 1000
              ),
              isActive: true,
              stripePaymentIntentId: null,
              paymentStatus: "succeeded",
            })
            .returning();

          // Denormalize promotion fields onto the listing
          await tx
            .update(listings)
            .set({
              promotionTier: input.tier,
              promotionExpiresAt: new Date(
                now.getTime() + input.durationDays * 24 * 60 * 60 * 1000
              ),
              updatedAt: now,
            })
            .where(eq(listings.id, input.listingId));

          return {
            type: "full_credit" as const,
            promotionId: promotion.id,
            creditApplied: price,
          };
        }

        // PARTIAL or NO CREDIT PATH: return credit info but don't deduct yet.
        // Credits will be deducted AFTER Stripe PaymentIntent succeeds.
        return {
          type: "needs_stripe" as const,
          totalCredit,
          availableCredits,
        };
      });

      // Full credit path — return immediately
      if (creditResult.type === "full_credit") {
        return {
          promotionId: creditResult.promotionId,
          clientSecret: null,
          price,
          creditApplied: creditResult.creditApplied,
          paidViaCredits: true,
        };
      }

      // Partial or no credit: create Stripe PaymentIntent FIRST, then deduct credits
      const creditToApply = Math.min(creditResult.totalCredit, price);
      const chargeAmount = price - creditToApply;

      // Create Stripe PaymentIntent for the remaining amount BEFORE touching credits.
      // If Stripe fails, no credits are lost.
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(chargeAmount * 100),
        currency: "usd",
        metadata: {
          type: "promotion",
          listingId: input.listingId,
          sellerId: ctx.user.id,
          tier: input.tier,
          durationDays: input.durationDays.toString(),
          creditApplied: creditToApply.toString(),
        },
      });

      // Now deduct credits in a transaction with FOR UPDATE (safe from double-spend)
      if (creditToApply > 0) {
        await ctx.db.transaction(async (tx) => {
          // Re-lock credits to prevent double-spend even after the gap
          const lockedCredits = await tx.execute(
            sql`SELECT id, amount, used_amount
                FROM promotion_credits
                WHERE user_id = ${ctx.user.id}
                  AND expires_at > now()
                  AND used_amount < amount
                ORDER BY expires_at ASC
                FOR UPDATE`
          );

          const freshCredits = (lockedCredits as unknown) as Array<{
            id: string;
            amount: number;
            used_amount: number;
          }>;

          let remaining = creditToApply;
          for (const credit of freshCredits) {
            if (remaining <= 0) break;
            const available = Number(credit.amount) - Number(credit.used_amount);
            const deduct = Math.min(available, remaining);
            await tx
              .update(promotionCredits)
              .set({ usedAmount: Number(credit.used_amount) + deduct })
              .where(eq(promotionCredits.id, credit.id));
            remaining -= deduct;
          }
        });
      }

      // Insert promotion row with pending payment status
      const [promotion] = await ctx.db
        .insert(listingPromotions)
        .values({
          listingId: input.listingId,
          sellerId: ctx.user.id,
          tier: input.tier,
          durationDays: input.durationDays,
          pricePaid: price,
          startsAt: now,
          expiresAt: new Date(
            now.getTime() + input.durationDays * 24 * 60 * 60 * 1000
          ),
          isActive: false, // Activated on payment success
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: "pending",
        })
        .returning();

      return {
        promotionId: promotion.id,
        clientSecret: paymentIntent.client_secret,
        price,
        creditApplied: creditToApply,
        paidViaCredits: false,
      };
    }),

  // Cancel an active promotion with pro-rata refund
  cancel: strictSellerProcedure
    .input(cancelPromotionSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      let preparation;
      try {
        preparation = await prepareCancelledPromotionRefund({
          promotionId: input.promotionId,
          cancelledAt: now,
          expectedSellerId: ctx.user.id,
          database: ctx.db,
        });
      } catch (error) {
        if (error instanceof PromotionNotActiveError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
            cause: error,
          });
        }
        throw error;
      }
      if (!preparation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Promotion not found",
        });
      }
      const result = await reconcilePromotionRefundResult(
        preparation,
        now,
        ctx.db,
      );

      return {
        refundAmountCents: result.refundAmountCents,
        refundAmountDollars: result.refundAmountCents / 100,
        refundStatus: result.refundStatus,
        stripeRefundId: result.stripeRefundId ?? null,
        requiresReconciliation:
          result.refundStatus === "reconciliation_required",
      };
    }),

  // Get all promotions for the current seller
  getMyPromotions: sellerProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        ctx.db.query.listingPromotions.findMany({
          where: eq(listingPromotions.sellerId, ctx.user.id),
          with: {
            listing: {
              columns: {
                id: true,
                title: true,
                status: true,
                askPricePerSqFt: true,
                totalSqFt: true,
                viewsCount: true,
              },
              with: {
                media: {
                  orderBy: (media, { asc }) => [asc(media.sortOrder)],
                  limit: 1,
                },
              },
            },
          },
          orderBy: desc(listingPromotions.createdAt),
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(listingPromotions)
          .where(eq(listingPromotions.sellerId, ctx.user.id)),
      ]);

      const total = countResult[0]?.count ?? 0;

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        hasMore: offset + items.length < total,
      };
    }),

  // Get the active promotion for a specific listing (public)
  getActiveForListing: publicProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const promotion = await ctx.db.query.listingPromotions.findFirst({
        where: and(
          eq(listingPromotions.listingId, input.listingId),
          eq(listingPromotions.isActive, true),
          gt(listingPromotions.expiresAt, new Date())
        ),
        columns: {
          id: true,
          tier: true,
          startsAt: true,
          expiresAt: true,
        },
      });

      return promotion ?? null;
    }),

  // Get featured/premium listings for homepage (public)
  getFeatured: publicProcedure
    .input(z.object({ limit: z.number().int().positive().max(12).default(6) }))
    .query(async ({ ctx, input }) => {
      const featuredListings = await ctx.db.query.listings.findMany({
        where: and(
          publicActiveListingWhere(new Date(), ctx.user),
          inArray(listings.promotionTier, ["featured", "premium"]),
          gt(listings.promotionExpiresAt, new Date())
        ),
        columns: publicListingColumns,
        with: {
          media: {
            columns: publicMediaColumns,
            orderBy: (media, { asc }) => [asc(media.sortOrder)],
            limit: 1,
          },
          seller: {
            columns: publicSellerColumns,
          },
        },
        orderBy: [
          desc(
            sql`CASE ${listings.promotionTier} WHEN 'premium' THEN 3 WHEN 'featured' THEN 2 ELSE 1 END`
          ),
          desc(listings.createdAt),
        ],
        limit: input.limit,
      });

      return featuredListings.map(toPublicListing);
    }),

  // Get premium listings for hero rotation (public)
  getPremiumHero: publicProcedure.query(async ({ ctx }) => {
    const premiumListings = await ctx.db.query.listings.findMany({
      where: and(
        publicActiveListingWhere(new Date(), ctx.user),
        eq(listings.promotionTier, "premium"),
        gt(listings.promotionExpiresAt, new Date())
      ),
      columns: publicListingColumns,
      with: {
        media: {
          columns: publicMediaColumns,
          orderBy: (media, { asc }) => [asc(media.sortOrder)],
          limit: 3,
        },
        seller: {
          columns: publicSellerColumns,
        },
      },
      orderBy: desc(listings.createdAt),
      limit: 5,
    });

    return premiumListings.map(toPublicListing);
  }),

  // Expire stale promotions (admin or cron)
  expireStale: adminProcedure.mutation(async ({ ctx }) => {
    const now = new Date();

    const candidates = await ctx.db.query.listingPromotions.findMany({
      where: or(
        and(
          eq(listingPromotions.isActive, true),
          lt(listingPromotions.expiresAt, now),
        ),
        and(
          eq(listingPromotions.paymentStatus, "refund_pending"),
          or(
            isNull(listingPromotions.refundNextAttemptAt),
            lte(listingPromotions.refundNextAttemptAt, now),
          ),
        ),
      ),
      columns: { id: true },
      orderBy: [asc(listingPromotions.createdAt)],
      limit: 100,
    });

    if (candidates.length === 0) {
      return {
        processed: 0,
        expired: 0,
        refunded: 0,
        refundPending: 0,
        reconciliationRequired: 0,
        failures: [],
      };
    }

    let expiredCount = 0;
    let refundCount = 0;
    let refundPendingCount = 0;
    let reconciliationRequiredCount = 0;
    const failures: Array<{ promotionId: string; error: string }> = [];
    for (const candidate of candidates) {
      try {
        const preparation = await prepareExpiredPromotionRefund(
          candidate.id,
          now,
          ctx.db,
        );
        if (!preparation) continue;
        if (preparation.expired) expiredCount++;
        const result = await reconcilePromotionRefundResult(
          preparation,
          now,
          ctx.db,
        );
        if (result.refundStatus === "refunded") {
          refundCount++;
        } else if (result.refundStatus === "refund_pending") {
          refundPendingCount++;
        } else if (result.refundStatus === "reconciliation_required") {
          reconciliationRequiredCount++;
        }
      } catch (error) {
        failures.push({
          promotionId: candidate.id,
          error:
            error instanceof Error
              ? error.message
              : "Unknown promotion expiry error",
        });
      }
    }

    return {
      processed: candidates.length,
      expired: expiredCount,
      refunded: refundCount,
      refundPending: refundPendingCount,
      reconciliationRequired: reconciliationRequiredCount,
      failures,
    };
  }),

  // Admin: Get all promotions with stats
  adminGetAll: adminProcedure
    .input(
      z.object({
        tier: z.enum(["spotlight", "featured", "premium"]).optional(),
        activeOnly: z.boolean().default(false),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const conditions = [];
      if (input.tier) {
        conditions.push(eq(listingPromotions.tier, input.tier));
      }
      if (input.activeOnly) {
        conditions.push(eq(listingPromotions.isActive, true));
        conditions.push(gt(listingPromotions.expiresAt, new Date()));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countResult, revenueResult] = await Promise.all([
        ctx.db.query.listingPromotions.findMany({
          where: whereClause,
          with: {
            listing: {
              columns: {
                id: true,
                title: true,
                status: true,
              },
            },
            seller: {
              columns: {
                id: true,
                name: true,
                businessName: true,
              },
            },
          },
          orderBy: desc(listingPromotions.createdAt),
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(listingPromotions)
          .where(whereClause),
        // Revenue stats
        ctx.db
          .select({
            totalRevenue: sql<number>`coalesce(sum(${listingPromotions.pricePaid}), 0)`,
            activeCount: sql<number>`cast(count(*) filter (where ${listingPromotions.isActive} = true and ${listingPromotions.expiresAt} > now()) as integer)`,
            spotlightRevenue: sql<number>`coalesce(sum(${listingPromotions.pricePaid}) filter (where ${listingPromotions.tier} = 'spotlight'), 0)`,
            featuredRevenue: sql<number>`coalesce(sum(${listingPromotions.pricePaid}) filter (where ${listingPromotions.tier} = 'featured'), 0)`,
            premiumRevenue: sql<number>`coalesce(sum(${listingPromotions.pricePaid}) filter (where ${listingPromotions.tier} = 'premium'), 0)`,
          })
          .from(listingPromotions)
          .where(eq(listingPromotions.paymentStatus, "succeeded")),
      ]);

      const total = countResult[0]?.count ?? 0;
      const stats = revenueResult[0] ?? {
        totalRevenue: 0,
        activeCount: 0,
        spotlightRevenue: 0,
        featuredRevenue: 0,
        premiumRevenue: 0,
      };

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        hasMore: offset + items.length < total,
        stats,
      };
    }),

  // Admin: Cancel a promotion
  adminCancel: adminProcedure
    .input(z.object({ promotionId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      let preparation;
      try {
        preparation = await prepareCancelledPromotionRefund({
          promotionId: input.promotionId,
          cancelledAt: now,
          database: ctx.db,
        });
      } catch (error) {
        if (error instanceof PromotionNotActiveError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
            cause: error,
          });
        }
        throw error;
      }
      if (!preparation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Promotion not found",
        });
      }
      const result = await reconcilePromotionRefundResult(
        preparation,
        now,
        ctx.db,
      );

      return {
        refundAmountCents: result.refundAmountCents,
        refundAmountDollars: result.refundAmountCents / 100,
        refundStatus: result.refundStatus,
        stripeRefundId: result.stripeRefundId ?? null,
        requiresReconciliation:
          result.refundStatus === "reconciliation_required",
      };
    }),
});
