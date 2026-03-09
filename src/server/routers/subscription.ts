import { createTRPCRouter, protectedProcedure } from "../trpc";
import { users, promotionCredits } from "../db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/env";
import { stripe } from "@/lib/stripe";

// TODO: Add stricter rate limiting to financial endpoints (createCheckout, createPortalSession)
// when rate limiting infrastructure is implemented

/** Stripe Price IDs for Pro subscription (not secrets — publishable IDs). */
const STRIPE_PRO_PRICES = {
  monthly: "price_1T98IpRFBoUcNSX5RayPGieP",
  annual: "price_1T98IqRFBoUcNSX5nVfBQCBW",
} as const;

export const subscriptionRouter = createTRPCRouter({
  /**
   * Get the current user's Pro subscription status and available promotion credit balance.
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, ctx.user.id),
      columns: {
        proStatus: true,
        proStartedAt: true,
        proExpiresAt: true,
        stripeSubscriptionId: true,
      },
    });

    // Sum available credit: (amount - usedAmount) where not expired
    const [creditResult] = await ctx.db
      .select({
        availableCredit: sql<number>`coalesce(sum(${promotionCredits.amount} - ${promotionCredits.usedAmount}), 0)`,
      })
      .from(promotionCredits)
      .where(
        sql`${promotionCredits.userId} = ${ctx.user.id} AND ${promotionCredits.expiresAt} > now()`
      );

    return {
      proStatus: user?.proStatus ?? "free",
      proStartedAt: user?.proStartedAt ?? null,
      proExpiresAt: user?.proExpiresAt ?? null,
      stripeSubscriptionId: user?.stripeSubscriptionId ?? null,
      availableCredit: Number(creditResult?.availableCredit ?? 0),
    };
  }),

  /**
   * Create a Stripe Checkout Session for a Pro subscription.
   */
  createCheckout: protectedProcedure
    .input(
      z.object({
        interval: z.enum(["monthly", "annual"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Block if already subscribed
      if (ctx.user.proStatus === "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Already subscribed",
        });
      }

      // Resolve the correct price ID
      const priceId = STRIPE_PRO_PRICES[input.interval];

      // Ensure user has a Stripe customer ID (atomic to prevent duplicates)
      let stripeCustomerId = ctx.user.stripeCustomerId;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: ctx.user.email,
          metadata: { userId: ctx.user.id },
        });

        // Atomically set customer ID only if still null (prevents race condition)
        const [updated] = await ctx.db
          .update(users)
          .set({
            stripeCustomerId: customer.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(users.id, ctx.user.id),
              isNull(users.stripeCustomerId)
            )
          )
          .returning({ stripeCustomerId: users.stripeCustomerId });

        if (updated) {
          stripeCustomerId = customer.id;
        } else {
          // Another request already set it — re-read the winning value
          const freshUser = await ctx.db.query.users.findFirst({
            where: eq(users.id, ctx.user.id),
            columns: { stripeCustomerId: true },
          });
          stripeCustomerId = freshUser?.stripeCustomerId ?? customer.id;
          // Clean up the orphaned Stripe customer
          await stripe.customers.del(customer.id).catch(() => {});
        }
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${env.NEXT_PUBLIC_APP_URL}/pro/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.NEXT_PUBLIC_APP_URL}/pro`,
        subscription_data: {
          metadata: { userId: ctx.user.id },
        },
      });

      return { url: session.url };
    }),

  /**
   * Create a Stripe Billing Portal session for managing the subscription.
   */
  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user.stripeCustomerId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No billing account found. Please subscribe first.",
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: ctx.user.stripeCustomerId,
      return_url: `${env.NEXT_PUBLIC_APP_URL}/settings/subscription`,
    });

    return { url: session.url };
  }),
});
