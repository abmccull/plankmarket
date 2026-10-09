import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/server/db";
import { auditEvents, listings, orders, users, userPreferences } from "@/server/db/schema";
import { getPostHogServer } from "@/lib/analytics/posthog-server";
import { sanitizeAnalyticsProperties } from "@/lib/analytics/privacy";

function eventUuid(key: string) {
  const bytes = createHash("sha256").update(`plankmarket-funnel:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const value = bytes.toString("hex");
  return `${value.slice(0,8)}-${value.slice(8,12)}-${value.slice(12,16)}-${value.slice(16,20)}-${value.slice(20)}`;
}
const validDate = (date: Date | null | undefined): date is Date => date instanceof Date && Number.isFinite(date.getTime());
async function consentingActor(id: string) {
  const actor = await db.query.users.findFirst({ where: eq(users.id, id), columns: { id: true, active: true } });
  if (!actor?.active || actor.id !== id) return false;
  const preferences = await db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, id), columns: { userId: true, analyticsTrackingEnabled: true } });
  return preferences?.userId === id && preferences.analyticsTrackingEnabled === true;
}

export const listingPublishedAnalytics = inngest.createFunction(
  { id: "analytics-listing-published", name: "Observe published inventory funnel", retries: 3 },
  { event: "listing/created" },
  async ({ event, step }) => step.run("capture-consented-publication", async () => {
    const provider = getPostHogServer();
    if (!provider) return { captured: false, reason: "analytics_disabled" };
    const listing = await db.query.listings.findFirst({ where: eq(listings.id, event.data.listingId) });
    if (!listing || listing.sellerId !== event.data.sellerId || !validDate(listing.publishedAt)) return { captured: false, reason: "publication_missing" };
    const intent = await db.query.auditEvents.findFirst({ where: eq(auditEvents.idempotencyKey, `listing-published:${listing.id}`) });
    if (!intent || intent.entityId !== listing.id || intent.actorId !== listing.sellerId || intent.action !== "listing.published" || !validDate(intent.createdAt) || !validDate(listing.createdAt)) return { captured: false, reason: "publication_evidence_missing" };
    const minutes = (intent.createdAt.getTime() - listing.createdAt.getTime()) / 60000;
    if (minutes < 0 || !Number.isFinite(minutes) || !await consentingActor(listing.sellerId)) return { captured: false, reason: "not_eligible" };
    // The current lot may have sold or been edited. Do not invent its original quantity/price.
    await provider.captureAcknowledged({ distinctId: listing.sellerId, event: "listing_published", uuid: eventUuid(`listing:${listing.id}`), timestamp: intent.createdAt, properties: sanitizeAnalyticsProperties({ time_to_publish_minutes: minutes, measurement: "durable_publication" }) });
    return { captured: true };
  }),
);

export const paymentCompletedAnalytics = inngest.createFunction(
  { id: "analytics-payment-completed", name: "Observe confirmed checkout funnel", retries: 3 },
  { event: "order/paid" },
  async ({ event, step }) => step.run("capture-consented-confirmed-payment", async () => {
    const provider = getPostHogServer();
    if (!provider) return { captured: false, reason: "analytics_disabled" };
    const order = await db.query.orders.findFirst({ where: eq(orders.id, event.data.orderId) });
    // Refunds do not erase a previously confirmed gross checkout. Unconfirmed late payments do not qualify.
    if (!order || !order.stripePaymentIntentId || !validDate(order.confirmedAt) || !["succeeded", "partially_refunded", "refunded"].includes(order.paymentStatus) || !Number.isFinite(order.totalPrice) || order.totalPrice <= 0 || !Number.isFinite(order.quantitySqFt) || order.quantitySqFt <= 0 || !await consentingActor(order.buyerId)) return { captured: false, reason: "not_eligible" };
    await provider.captureAcknowledged({ distinctId: order.buyerId, event: "payment_completed", uuid: eventUuid(`payment:${order.id}:${order.stripePaymentIntentId}`), timestamp: order.confirmedAt, properties: sanitizeAnalyticsProperties({ amount: order.totalPrice, quantity_sqft: order.quantitySqFt, payment_method: "unknown", measurement: "confirmed_checkout_gross" }) });
    return { captured: true };
  }),
);
