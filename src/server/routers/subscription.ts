import {
  createTRPCRouter,
  protectedProcedure,
  strictProtectedProcedure,
} from "../trpc";
import { users, promotionCredits } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/env";
import { stripe } from "@/lib/stripe";

import { createProCheckoutSession } from "../services/subscription-checkout";

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
        stripeCustomerId: true,
      },
    });

    // Sum available credit: (amount - usedAmount) where not expired
    const [creditResult] = await ctx.db
      .select({
        availableCredit: sql<number>`coalesce(sum(${promotionCredits.amount} - ${promotionCredits.usedAmount}), 0)`,
      })
      .from(promotionCredits)
      .where(
        sql`${promotionCredits.userId} = ${ctx.user.id} AND ${promotionCredits.expiresAt} > now()`,
      );

    return {
      proStatus: user?.proStatus ?? "free",
      proStartedAt: user?.proStartedAt ?? null,
      proExpiresAt: user?.proExpiresAt ?? null,
      stripeSubscriptionId: user?.stripeSubscriptionId ?? null,
      hasBillingAccount: Boolean(user?.stripeCustomerId),
      availableCredit: Number(creditResult?.availableCredit ?? 0),
    };
  }),

  /**
   * Create a Stripe Checkout Session for a Pro subscription.
   */
  createCheckout: strictProtectedProcedure
    .input(
      z.object({
        interval: z.enum(["monthly", "annual"]),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      createProCheckoutSession(ctx.db, ctx.user.id, input.interval, {
        provider: stripe,
        appUrl: env.NEXT_PUBLIC_APP_URL,
      }),
    ),

  /**
   * Create a Stripe Billing Portal session for managing the subscription.
   */
  createPortalSession: strictProtectedProcedure.mutation(async ({ ctx }) => {
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
