import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/server/db";
import { listingPromotions } from "@/server/db/schema";
import { and, asc, eq, isNull, lt, lte, or } from "drizzle-orm";
import { env } from "@/env";
import {
  prepareExpiredPromotionRefund,
  reconcilePromotionRefundResult,
} from "@/server/services/promotion-refund-reconciliation";

// Vercel Cron: runs every hour
// Add to vercel.json: { "crons": [{ "path": "/api/cron/expire-promotions", "schedule": "0 * * * *" }] }
const EXPIRY_BATCH_SIZE = 50;

function safeCompareBearerToken(
  authHeader: string | null,
  expectedSecret: string,
): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const providedToken = authHeader.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(expectedSecret);
  const providedBuffer = Buffer.from(providedToken);

  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function GET(req: NextRequest) {
  if (!env.CRON_SECRET) {
    console.error("CRON_SECRET is missing; rejecting cron request");
    return NextResponse.json(
      { error: "Cron endpoint misconfigured" },
      { status: 500 },
    );
  }

  // Verify cron secret to prevent unauthorized access
  const authHeader = req.headers.get("authorization");
  if (!safeCompareBearerToken(authHeader, env.CRON_SECRET)) {
    console.warn("Unauthorized cron access attempt", {
      path: req.nextUrl.pathname,
      userAgent: req.headers.get("user-agent"),
      hasAuthHeader: Boolean(authHeader),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Include both newly expired promotions and durable refund obligations that
  // are ready for another provider reconciliation attempt.
  let candidates;
  try {
    candidates = await db.query.listingPromotions.findMany({
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
      limit: EXPIRY_BATCH_SIZE,
    });
  } catch (err) {
    console.error("Failed to query promotion expiry work:", err);
    return NextResponse.json(
      { error: "Database query failed" },
      { status: 500 },
    );
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      processed: 0,
      expired: 0,
      refunded: 0,
      refundPending: 0,
      reconciliationRequired: 0,
      failures: [],
    });
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
        db,
      );
      if (!preparation) continue;
      if (preparation.expired) expiredCount++;

      const result = await reconcilePromotionRefundResult(
        preparation,
        now,
        db,
      );

      if (result.refundStatus === "refunded") {
        refundCount++;
      } else if (result.refundStatus === "refund_pending") {
        refundPendingCount++;
      } else if (result.refundStatus === "reconciliation_required") {
        reconciliationRequiredCount++;
        console.error("Promotion refund requires reconciliation", {
          promotionId: candidate.id,
          error: result.error,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown promotion expiry error";
      failures.push({ promotionId: candidate.id, error: message });
      console.error("Failed to process promotion expiry", {
        promotionId: candidate.id,
        error,
      });
    }
  }

  return NextResponse.json(
    {
      processed: candidates.length,
      expired: expiredCount,
      refunded: refundCount,
      refundPending: refundPendingCount,
      reconciliationRequired: reconciliationRequiredCount,
      failures,
    },
    { status: failures.length > 0 ? 500 : 200 },
  );
}
