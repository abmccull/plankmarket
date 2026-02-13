import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { listings, listingPromotions } from "@/server/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import Stripe from "stripe";
import { env } from "@/env";

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-01-28.clover" as const,
});

// Vercel Cron: runs every hour
// Add to vercel.json: { "crons": [{ "path": "/api/cron/expire-promotions", "schedule": "0 * * * *" }] }

export async function GET(req: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find expired but still marked active
  const stalePromotions = await db.query.listingPromotions.findMany({
    where: and(
      eq(listingPromotions.isActive, true),
      sql`${listingPromotions.expiresAt} < ${now}`
    ),
  });

  if (stalePromotions.length === 0) {
    return NextResponse.json({ expired: 0, refunded: 0 });
  }

  const staleIds = stalePromotions.map((p) => p.id);
  const listingIds = stalePromotions.map((p) => p.listingId);

  // Deactivate all stale promotions
  await db
    .update(listingPromotions)
    .set({ isActive: false })
    .where(inArray(listingPromotions.id, staleIds));

  // Clear denormalized fields on affected listings
  await db
    .update(listings)
    .set({
      promotionTier: null,
      promotionExpiresAt: null,
      updatedAt: now,
    })
    .where(inArray(listings.id, listingIds));

  // Check if any listings also expired and issue pro-rata refunds
  let refundCount = 0;
  for (const promotion of stalePromotions) {
    const listing = await db.query.listings.findFirst({
      where: eq(listings.id, promotion.listingId),
      columns: { status: true, expiresAt: true },
    });

    if (
      listing &&
      (listing.status === "expired" || listing.status === "sold") &&
      listing.expiresAt &&
      new Date(listing.expiresAt) < new Date(promotion.expiresAt)
    ) {
      const totalMs =
        new Date(promotion.expiresAt).getTime() -
        new Date(promotion.startsAt).getTime();
      const usedMs =
        new Date(listing.expiresAt).getTime() -
        new Date(promotion.startsAt).getTime();
      const unusedRatio = Math.max(0, 1 - usedMs / totalMs);
      const refundAmount = Math.round(
        promotion.pricePaid * unusedRatio * 100
      );

      if (refundAmount > 0 && promotion.stripePaymentIntentId) {
        try {
          await stripe.refunds.create({
            payment_intent: promotion.stripePaymentIntentId,
            amount: refundAmount,
          });
          await db
            .update(listingPromotions)
            .set({ paymentStatus: "refunded" })
            .where(eq(listingPromotions.id, promotion.id));
          refundCount++;
        } catch (err) {
          console.error(`Failed to refund promotion ${promotion.id}:`, err);
        }
      }
    }
  }

  return NextResponse.json({
    expired: stalePromotions.length,
    refunded: refundCount,
  });
}
