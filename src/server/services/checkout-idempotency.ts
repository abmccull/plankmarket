import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@/server/db";
import { orders, checkoutAbandonments } from "@/server/db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalize(entry)]));
  }
  return value;
}

export function checkoutInputFingerprint(mode: "direct" | "offer", input: { requestId: string } & Record<string, unknown>): string {
  const payload = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "requestId"));
  return createHash("sha256").update(JSON.stringify(canonicalize({ version: 1, mode, payload }))).digest("hex");
}

/** Must be the first operation in the order creation transaction. The lock is
 * held through quote consumption, inventory reservation and commit, so a lost
 * response or concurrent retry can only replay the original committed order. */
export async function findCheckoutReplay(tx: Transaction, buyerId: string, requestId: string, fingerprint: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`checkout:${buyerId}:${requestId}`}, 0))`);
  const abandoned = await tx.query.checkoutAbandonments.findFirst({
    where: and(eq(checkoutAbandonments.buyerId, buyerId), eq(checkoutAbandonments.requestId, requestId)),
  });
  if (abandoned) {
    throw new TRPCError({ code: "CONFLICT", message: "This checkout attempt was closed. Select shipping again to begin a new checkout." });
  }
  const existing = await tx.query.orders.findFirst({
    where: and(eq(orders.buyerId, buyerId), eq(orders.checkoutRequestId, requestId)),
  });
  if (existing && existing.checkoutInputFingerprint !== fingerprint) {
    throw new TRPCError({ code: "CONFLICT", message: "This checkout request was already used with different details. Resume the original order." });
  }
  return existing;
}

/** Only forget an unreserved or terminal checkout. A missing order is checked
 * under the creation lock and tombstoned in the same transaction, so a delayed
 * create cannot reserve inventory after the browser has moved on. */
export async function abandonCheckoutAttempt(tx: Transaction, buyerId: string, requestId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`checkout:${buyerId}:${requestId}`}, 0))`);
  const existing = await tx.query.orders.findFirst({
    where: and(eq(orders.buyerId, buyerId), eq(orders.checkoutRequestId, requestId)),
  });
  if (existing) {
    const cancelled = existing.status === "cancelled" && existing.inventoryReleasedAt !== null &&
      ["pending", "failed", "cancelled", "canceled"].includes(existing.paymentStatus ?? "pending");
    const refunded = existing.status === "refunded" && existing.paymentStatus === "refunded";
    if (!cancelled && !refunded) {
      throw new TRPCError({ code: "CONFLICT", message: "This checkout already has an active order. Resume it or wait for the unpaid reservation to expire before changing checkout details." });
    }
  }
  await tx.insert(checkoutAbandonments).values({ buyerId, requestId }).onConflictDoNothing();
  return { abandoned: true as const };
}
