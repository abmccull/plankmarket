import { inngest } from "../client";
import { PLANKMARKET_EVENTS } from "../events";
import { db } from "@/server/db";
import {
  buyerRequests,
  listings,
  materialTypeEnum,
  users,
} from "@/server/db/schema";
import {
  and,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lte,
  ne,
  or,
} from "drizzle-orm";
import { sendEmailOrThrow } from "@/lib/email/delivery";
import { buildEmailIdempotencyKey } from "@/lib/email/delivery-policy";
import { env } from "@/env";
import { escapeHtml } from "@/lib/utils";
import { selectBuyerRequestAlertTargets } from "@/server/services/buyer-request-listing-match";

type ListingMaterialType = (typeof materialTypeEnum.enumValues)[number];
const listingMaterialTypes = new Set<string>(materialTypeEnum.enumValues);
const BUYER_REQUEST_ALERT_BATCH_SIZE = 50;

interface BuyerRequestAlertPageEvent {
  data: {
    scanStartedAt: string;
    windowStartAt: string;
    afterCreatedAt?: string;
    afterRequestId?: string;
  };
}

function buildBuyerRequestCursorWhere(input: {
  windowStartAt: Date;
  scanStartedAt: Date;
  afterCreatedAt?: Date;
  afterRequestId?: string;
}) {
  const baseWhere = and(
    eq(buyerRequests.status, "open"),
    gte(buyerRequests.createdAt, input.windowStartAt),
    lte(buyerRequests.createdAt, input.scanStartedAt),
  );

  if (!input.afterCreatedAt || !input.afterRequestId) {
    return baseWhere;
  }

  return and(
    baseWhere,
    or(
      gt(buyerRequests.createdAt, input.afterCreatedAt),
      and(
        eq(buyerRequests.createdAt, input.afterCreatedAt),
        gt(buyerRequests.id, input.afterRequestId),
      ),
    ),
  );
}

async function loadBuyerRequestAlertsPage(input: {
  windowStartAt: Date;
  scanStartedAt: Date;
  afterCreatedAt?: Date;
  afterRequestId?: string;
}) {
  return db
    .select({
      id: buyerRequests.id,
      buyerId: buyerRequests.buyerId,
      title: buyerRequests.title,
      materialTypes: buyerRequests.materialTypes,
      minTotalSqFt: buyerRequests.minTotalSqFt,
      maxTotalSqFt: buyerRequests.maxTotalSqFt,
      priceMaxPerSqFt: buyerRequests.priceMaxPerSqFt,
      priceMinPerSqFt: buyerRequests.priceMinPerSqFt,
      destinationZip: buyerRequests.destinationZip,
      urgency: buyerRequests.urgency,
      notes: buyerRequests.notes,
      createdAt: buyerRequests.createdAt,
    })
    .from(buyerRequests)
    .where(buildBuyerRequestCursorWhere(input))
    .orderBy(buyerRequests.createdAt, buyerRequests.id)
    .limit(BUYER_REQUEST_ALERT_BATCH_SIZE + 1);
}

export const buyerRequestAlertScheduler = inngest.createFunction(
  {
    id: "buyer-request-alert-scheduler",
    name: "Queue Buyer Request Alerts to Sellers",
  },
  { cron: "0 */4 * * *" },
  async ({ step }) => {
    const scanStartedAt = new Date();
    const windowStartAt = new Date(
      scanStartedAt.getTime() - 4 * 60 * 60 * 1000,
    );

    await step.sendEvent("queue-buyer-request-alert-page", {
      id: `buyer-request-alert:${scanStartedAt.toISOString()}`,
      name: PLANKMARKET_EVENTS.buyerRequestAlertPage,
      data: {
        scanStartedAt: scanStartedAt.toISOString(),
        windowStartAt: windowStartAt.toISOString(),
      },
    });

    return {
      queued: true,
      scanStartedAt: scanStartedAt.toISOString(),
      windowStartAt: windowStartAt.toISOString(),
    };
  },
);

export async function processBuyerRequestAlertsPage(
  eventData: BuyerRequestAlertPageEvent["data"],
) {
  const scanStartedAt = new Date(eventData.scanStartedAt);
  const windowStartAt = new Date(eventData.windowStartAt);
  const afterCreatedAt = eventData.afterCreatedAt
    ? new Date(eventData.afterCreatedAt)
    : undefined;
  const recentRequestsRaw = await loadBuyerRequestAlertsPage({
    scanStartedAt,
    windowStartAt,
    afterCreatedAt,
    afterRequestId: eventData.afterRequestId,
  });
  const hasMore = recentRequestsRaw.length > BUYER_REQUEST_ALERT_BATCH_SIZE;
  const recentRequests = recentRequestsRaw.slice(0, BUYER_REQUEST_ALERT_BATCH_SIZE);
  let alertsSent = 0;
  const failures: unknown[] = [];

  for (const request of recentRequests) {
    try {
      const requestMaterialTypes = request.materialTypes.filter(
        (materialType): materialType is ListingMaterialType =>
          listingMaterialTypes.has(materialType),
      );
      if (requestMaterialTypes.length === 0) {
        continue;
      }

      const matchingListingCandidates = await db
        .select({
          listingId: listings.id,
          sellerId: listings.sellerId,
          sellerEmail: users.email,
          sellerName: users.name,
          territoryMode: listings.territoryMode,
          allowedDestinationStates: listings.allowedDestinationStates,
        })
        .from(listings)
        .innerJoin(users, eq(listings.sellerId, users.id))
        .where(
          and(
            eq(listings.status, "active"),
            inArray(listings.materialType, requestMaterialTypes),
            isNotNull(listings.lastConfirmedAt),
            isNotNull(listings.confirmationDueAt),
            gte(listings.confirmationDueAt, scanStartedAt),
            gt(listings.totalSqFt, 0),
            ne(listings.sellerId, request.buyerId),
          ),
        );
      const matchingSellers = selectBuyerRequestAlertTargets({
        destinationZip: request.destinationZip,
        candidates: matchingListingCandidates,
      });

      for (const seller of matchingSellers) {
        try {
          const appUrl = env.NEXT_PUBLIC_APP_URL;
          const urgencyLabel: Record<string, string> = {
            asap: "ASAP",
            "2_weeks": "Within 2 weeks",
            "4_weeks": "Within 4 weeks",
            flexible: "Flexible",
          };

          await sendEmailOrThrow({
            category: "buyer_request_alert",
            idempotencyKey: buildEmailIdempotencyKey(
              "buyer_request_alert",
              request.id,
              seller.sellerId,
            ),
            message: {
              from: env.EMAIL_FROM,
              to: seller.sellerEmail,
              subject: `New buyer request matching your active inventory: ${request.title}`,
              html: `
              <p>Hi ${escapeHtml(seller.sellerName ?? "")},</p>
              <p>A buyer just posted a request matching ${seller.matchingListingIds.length === 1 ? "an active listing" : `${seller.matchingListingIds.length} active listings`} in your inventory on PlankMarket.</p>
              <table style="border-collapse:collapse;width:100%;max-width:480px;">
                <tr>
                  <td style="padding:8px 0;font-weight:bold;color:#555;">Request</td>
                  <td style="padding:8px 0;">${escapeHtml(request.title)}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-weight:bold;color:#555;">Material Types</td>
                  <td style="padding:8px 0;">${escapeHtml(requestMaterialTypes.join(", "))}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-weight:bold;color:#555;">Square Footage Needed</td>
                  <td style="padding:8px 0;">
                    ${request.minTotalSqFt} sq ft${request.maxTotalSqFt ? ` - ${request.maxTotalSqFt} sq ft` : ""}
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-weight:bold;color:#555;">Max Price</td>
                  <td style="padding:8px 0;">$${request.priceMaxPerSqFt}/sq ft${request.priceMinPerSqFt ? ` (min $${request.priceMinPerSqFt}/sq ft)` : ""}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-weight:bold;color:#555;">Destination ZIP</td>
                  <td style="padding:8px 0;">${escapeHtml(request.destinationZip ?? "")}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-weight:bold;color:#555;">Urgency</td>
                  <td style="padding:8px 0;">${escapeHtml(urgencyLabel[request.urgency] ?? request.urgency)}</td>
                </tr>
                ${
                  request.notes
                    ? `<tr>
                  <td style="padding:8px 0;font-weight:bold;color:#555;">Buyer Notes</td>
                  <td style="padding:8px 0;">${escapeHtml(request.notes)}</td>
                </tr>`
                    : ""
                }
              </table>
              <br/>
              <a
                href="${appUrl}/seller/request-board"
                style="background:#1a1a1a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;"
              >
                View Request &amp; Respond
              </a>
              <br/><br/>
              <p style="color:#888;font-size:12px;">
                You&apos;re receiving this because you have active inventory
                whose material and selling territory match this request.
              </p>
            `,
            },
          });

          alertsSent++;
        } catch (emailError) {
          failures.push(emailError);
          console.error(
            `Failed to send buyer request alert to seller ${seller.sellerId} for request ${request.id}:`,
            emailError,
          );
        }
      }
    } catch (error) {
      failures.push(error);
      console.error(`Failed to process buyer request ${request.id}:`, error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "One or more buyer request alerts could not be delivered",
    );
  }

  const lastRequest = recentRequests.at(-1);

  return {
    totalRequests: recentRequests.length,
    alertsSent,
    nextCursor:
      hasMore && lastRequest
        ? {
            afterCreatedAt: lastRequest.createdAt.toISOString(),
            afterRequestId: lastRequest.id,
          }
        : null,
  };
}

export const buyerRequestAlerts = inngest.createFunction(
  { id: "buyer-request-alerts", name: "Send Buyer Request Alerts to Sellers" },
  { event: PLANKMARKET_EVENTS.buyerRequestAlertPage },
  async ({ event, step }) => {
    const page = event.data as BuyerRequestAlertPageEvent["data"];
    const result = await step.run("match-and-alert-sellers-page", async () => {
      return processBuyerRequestAlertsPage(page);
    });

    if (result.nextCursor) {
      await step.sendEvent("queue-next-buyer-request-alert-page", {
        id: `buyer-request-alert:${page.scanStartedAt}:${result.nextCursor.afterCreatedAt}:${result.nextCursor.afterRequestId}`,
        name: PLANKMARKET_EVENTS.buyerRequestAlertPage,
        data: {
          scanStartedAt: page.scanStartedAt,
          windowStartAt: page.windowStartAt,
          afterCreatedAt: result.nextCursor.afterCreatedAt,
          afterRequestId: result.nextCursor.afterRequestId,
        },
      });
    }

    return result;
  },
);
