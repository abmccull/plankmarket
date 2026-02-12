import {
  createTRPCRouter,
  publicProcedure,
  protectedProcedure,
  sellerProcedure,
  rateLimitedPaymentProcedure,
} from "../trpc";
import { orders, users, notifications } from "../db/schema";
import { eq, and, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import Stripe from "stripe";
import { env } from "@/env";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-01-28.clover" as const,
});

export const paymentRouter = createTRPCRouter({
  // Check if seller has completed payment setup
  checkSellerPaymentReady: publicProcedure
    .input(z.object({ sellerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const seller = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.sellerId),
        columns: { id: true, stripeOnboardingComplete: true },
      });

      if (!seller) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Seller not found" });
      }

      return { ready: seller.stripeOnboardingComplete };
    }),

  // Create a payment intent for an order
  createPaymentIntent: rateLimitedPaymentProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
        with: {
          seller: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      if (order.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only pay for your own orders",
        });
      }

      if (!order.seller.stripeAccountId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Seller has not completed payment setup",
        });
      }

      // Create Stripe PaymentIntent with marketplace fees
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(order.totalPrice * 100), // Convert to cents
        currency: "usd",
        application_fee_amount: Math.round(
          (order.buyerFee + order.sellerFee) * 100
        ),
        transfer_data: {
          destination: order.seller.stripeAccountId,
        },
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          buyerId: order.buyerId,
          sellerId: order.sellerId,
        },
      });

      // Save payment intent ID to order
      await ctx.db
        .update(orders)
        .set({
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: "pending",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, input.orderId));

      return {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      };
    }),

  // Get payment status for an order
  getPaymentStatus: protectedProcedure
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

      if (
        order.buyerId !== ctx.user.id &&
        order.sellerId !== ctx.user.id &&
        ctx.user.role !== "admin"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Access denied",
        });
      }

      return {
        orderId: order.id,
        paymentStatus: order.paymentStatus,
        stripePaymentIntentId: order.stripePaymentIntentId,
      };
    }),

  // Create Stripe Connect account for seller
  createConnectAccount: sellerProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.stripeAccountId) {
      // Return existing onboarding link
      const accountLink = await stripe.accountLinks.create({
        account: ctx.user.stripeAccountId,
        refresh_url: `${env.NEXT_PUBLIC_APP_URL}/seller/stripe-onboarding?refresh=true`,
        return_url: `${env.NEXT_PUBLIC_APP_URL}/seller/stripe-onboarding?success=true`,
        type: "account_onboarding",
      });

      return { url: accountLink.url };
    }

    // Create new connected account
    const account = await stripe.accounts.create({
      type: "express",
      email: ctx.user.email,
      metadata: {
        userId: ctx.user.id,
        businessName: ctx.user.businessName || "",
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    // Save account ID to user
    await ctx.db
      .update(users)
      .set({
        stripeAccountId: account.id,
        updatedAt: new Date(),
      })
      .where(eq(users.id, ctx.user.id));

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${env.NEXT_PUBLIC_APP_URL}/seller/stripe-onboarding?refresh=true`,
      return_url: `${env.NEXT_PUBLIC_APP_URL}/seller/stripe-onboarding?success=true`,
      type: "account_onboarding",
    });

    return { url: accountLink.url };
  }),

  // Check Stripe Connect account status
  getConnectStatus: sellerProcedure.query(async ({ ctx }) => {
    if (!ctx.user.stripeAccountId) {
      return { connected: false, onboardingComplete: false };
    }

    try {
      const account = await stripe.accounts.retrieve(
        ctx.user.stripeAccountId
      );

      const onboardingComplete =
        account.charges_enabled && account.payouts_enabled;

      // Update DB if status changed
      if (onboardingComplete !== ctx.user.stripeOnboardingComplete) {
        await ctx.db
          .update(users)
          .set({
            stripeOnboardingComplete: onboardingComplete,
            updatedAt: new Date(),
          })
          .where(eq(users.id, ctx.user.id));
      }

      return {
        connected: true,
        onboardingComplete,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
      };
    } catch (err) {
      // Only suppress "account not found" errors — rethrow others (L18)
      if (
        err instanceof Stripe.errors.StripeInvalidRequestError &&
        err.code === "resource_missing"
      ) {
        return { connected: false, onboardingComplete: false };
      }
      console.error("Stripe Connect status check failed:", err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to check Stripe account status",
      });
    }
  }),

  // Nudge seller to complete Stripe onboarding
  nudgeSellerToOnboard: protectedProcedure
    .input(z.object({ sellerId: z.string().uuid(), listingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // 1. Check if seller already has stripeOnboardingComplete=true
      const seller = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.sellerId),
        columns: { id: true, stripeOnboardingComplete: true },
      });

      if (!seller) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Seller not found",
        });
      }

      if (seller.stripeOnboardingComplete) {
        return { alreadyReady: true };
      }

      // 2. Check if a "system" notification was already sent to this seller
      //    in the last 24 hours (spam protection)
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentNotification = await ctx.db.query.notifications.findFirst({
        where: and(
          eq(notifications.userId, input.sellerId),
          eq(notifications.type, "system"),
          gt(notifications.createdAt, twentyFourHoursAgo)
        ),
      });

      if (recentNotification) {
        return { notified: false, reason: "recently_notified" };
      }

      // 3. Insert a notification for the seller
      await ctx.db.insert(notifications).values({
        userId: input.sellerId,
        type: "system",
        title: "Someone wants to purchase your listing!",
        message:
          "A buyer is interested in your listing. Set up Stripe payments to start receiving orders.",
        data: { listingId: input.listingId },
      });

      // 4. Return success
      return { notified: true };
    }),
});
