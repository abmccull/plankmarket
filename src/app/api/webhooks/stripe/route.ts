import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/server/db";
import { orders, users, listings, listingPromotions } from "@/server/db/schema";
import { eq, and } from "drizzle-orm";
import { env } from "@/env";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-01-28.clover" as const,
});

const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

/**
 * Handle incoming Stripe webhook requests, verify the signature, and apply side effects in the database.
 *
 * Processes the following Stripe events: `payment_intent.succeeded`, `payment_intent.payment_failed`, and `account.updated`.
 * - For promotion payments: activates or marks promotions as failed and denormalizes promotion data onto listings.
 * - For order payments: updates order payment status and confirmation.
 * - For account updates: updates user onboarding completion based on account capabilities.
 *
 * @param req - The incoming Stripe webhook HTTP request
 * @returns A JSON NextResponse acknowledging receipt (`{ received: true }`) on success, or a JSON error object with an appropriate HTTP status code on failure
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        if (paymentIntent.metadata.type === "promotion") {
          // Promotion payment succeeded — activate the promotion
          const { listingId, tier, durationDays } = paymentIntent.metadata;
          if (listingId) {
            const now = new Date();
            const expiresAt = new Date(
              now.getTime() +
                parseInt(durationDays, 10) * 24 * 60 * 60 * 1000
            );

            await db
              .update(listingPromotions)
              .set({
                paymentStatus: "succeeded",
                isActive: true,
                startsAt: now,
                expiresAt,
              })
              .where(
                and(
                  eq(
                    listingPromotions.stripePaymentIntentId,
                    paymentIntent.id
                  )
                )
              );

            // Denormalize onto listings row
            await db
              .update(listings)
              .set({
                promotionTier: tier as "spotlight" | "featured" | "premium",
                promotionExpiresAt: expiresAt,
                updatedAt: now,
              })
              .where(eq(listings.id, listingId));
          }
        } else {
          // Order payment succeeded
          const orderId = paymentIntent.metadata.orderId;
          if (orderId) {
            await db
              .update(orders)
              .set({
                paymentStatus: "succeeded",
                status: "confirmed",
                confirmedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(orders.id, orderId));
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        if (paymentIntent.metadata.type === "promotion") {
          // Promotion payment failed
          await db
            .update(listingPromotions)
            .set({ paymentStatus: "failed" })
            .where(
              eq(
                listingPromotions.stripePaymentIntentId,
                paymentIntent.id
              )
            );
        } else {
          // Order payment failed
          const orderId = paymentIntent.metadata.orderId;
          if (orderId) {
            await db
              .update(orders)
              .set({
                paymentStatus: "failed",
                updatedAt: new Date(),
              })
              .where(eq(orders.id, orderId));
          }
        }
        break;
      }

      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const isComplete =
          account.charges_enabled && account.payouts_enabled;

        if (account.metadata?.userId) {
          await db
            .update(users)
            .set({
              stripeOnboardingComplete: isComplete,
              updatedAt: new Date(),
            })
            .where(eq(users.id, account.metadata.userId));
        }
        break;
      }

      default:
        // Unhandled event type
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}