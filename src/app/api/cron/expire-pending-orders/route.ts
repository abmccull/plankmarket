import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { env } from "@/env";
import { releaseReservedInventory } from "@/server/services/inventory-reservation";

const ORDER_EXPIRY_HOURS = 24;

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
    console.error("CRON_SECRET is missing; rejecting pending-order expiry cron");
    return NextResponse.json(
      { error: "Cron endpoint misconfigured" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!safeCompareBearerToken(authHeader, env.CRON_SECRET)) {
    console.warn("Unauthorized cron access attempt", {
      path: req.nextUrl.pathname,
      userAgent: req.headers.get("user-agent"),
      hasAuthHeader: Boolean(authHeader),
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - ORDER_EXPIRY_HOURS * 60 * 60 * 1000);

  const staleOrders = await db.query.orders.findMany({
    where: and(
      eq(orders.status, "pending"),
      sql`${orders.createdAt} < ${cutoff}`,
      sql`${orders.paymentStatus} <> 'succeeded'`,
    ),
    columns: { id: true },
  });

  let expiredCount = 0;

  for (const order of staleOrders) {
    await db.transaction(async (tx) => {
      const [lockedOrder] = await tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(eq(orders.id, order.id))
        .for("update");

      if (!lockedOrder || lockedOrder.status !== "pending") {
        return;
      }

      await tx
        .update(orders)
        .set({
          status: "cancelled",
          paymentStatus: "failed",
          cancelledAt: new Date(),
          updatedAt: new Date(),
          notes: "Cancelled automatically: payment window expired",
        })
        .where(eq(orders.id, order.id));

      await releaseReservedInventory({
        db: tx,
        orderId: order.id,
        reason: "pending_order_expired",
      });

      expiredCount += 1;
    });
  }

  return NextResponse.json({
    expired: expiredCount,
    scanned: staleOrders.length,
    cutoff: cutoff.toISOString(),
  });
}
