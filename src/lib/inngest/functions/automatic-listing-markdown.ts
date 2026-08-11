import { inngest } from "../client";
import { PLANKMARKET_EVENTS } from "../events";
import { db } from "@/server/db";
import {
  agentActions,
  listings,
  notifications,
} from "@/server/db/schema";
import { and, eq, gt } from "drizzle-orm";
import { resolveAutomaticMarkdownListingUpdate } from "@/lib/listing-pricing";

const AUTOMATIC_MARKDOWN_BATCH_SIZE = 100;

interface AutomaticListingMarkdownPageEvent {
  data: {
    afterListingId?: string;
  };
}

async function loadAutomaticMarkdownCandidateIds(afterListingId?: string) {
  const where = afterListingId
    ? and(
        eq(listings.status, "active"),
        eq(listings.automaticMarkdownEnabled, true),
        gt(listings.id, afterListingId),
      )
    : and(
        eq(listings.status, "active"),
        eq(listings.automaticMarkdownEnabled, true),
      );

  const rows = await db
    .select({ id: listings.id })
    .from(listings)
    .where(where)
    .orderBy(listings.id)
    .limit(AUTOMATIC_MARKDOWN_BATCH_SIZE + 1);

  return rows.map((row) => row.id);
}

export const automaticListingMarkdownScheduler = inngest.createFunction(
  {
    id: "automatic-listing-markdown-scheduler",
    name: "Queue Listings: Automatic Markdown",
  },
  { cron: "0 5 * * *" },
  async ({ step }) => {
    const queuedAt = new Date().toISOString();
    await step.sendEvent("queue-automatic-listing-markdown-page", {
      id: `automatic-listing-markdown:${queuedAt}`,
      name: PLANKMARKET_EVENTS.automaticListingMarkdownPage,
      data: {},
    });
    return { queued: true, queuedAt };
  },
);

export async function processAutomaticListingMarkdownPage(
  eventData: AutomaticListingMarkdownPageEvent["data"],
) {
  const candidateIdsRaw = await loadAutomaticMarkdownCandidateIds(
    eventData.afterListingId,
  );
  const hasMore = candidateIdsRaw.length > AUTOMATIC_MARKDOWN_BATCH_SIZE;
  const candidateIds = candidateIdsRaw.slice(0, AUTOMATIC_MARKDOWN_BATCH_SIZE);
  const results = [];

  for (const listingId of candidateIds) {
    const result = await db.transaction(async (tx) => {
      const [listing] = await tx
        .select()
        .from(listings)
        .where(
          and(
            eq(listings.id, listingId),
            eq(listings.status, "active"),
            eq(listings.automaticMarkdownEnabled, true),
          ),
        )
        .for("update");

      if (!listing) {
        return { listingId, applied: false, reason: "listing_missing" } as const;
      }

      const decision = resolveAutomaticMarkdownListingUpdate({
        listingStatus: listing.status,
        currentAskPricePerSqFt: Number(listing.askPricePerSqFt),
        currentBuyNowPricePerSqFt:
          listing.buyNowPrice == null ? null : Number(listing.buyNowPrice),
        automaticMarkdownEnabled: listing.automaticMarkdownEnabled,
        automaticMarkdownFloorPercent:
          listing.automaticMarkdownFloorPercent,
        automaticMarkdownIntervalDays:
          listing.automaticMarkdownIntervalDays,
        automaticMarkdownStartedAt: listing.automaticMarkdownStartedAt,
        automaticMarkdownCurrentStep: listing.automaticMarkdownCurrentStep,
        automaticMarkdownLastAppliedAt:
          listing.automaticMarkdownLastAppliedAt,
      });

      if (decision.status !== "ready") {
        return {
          listingId,
          applied: false,
          reason: decision.reason,
          currentStep: decision.currentStep,
          targetStep: decision.targetStep,
        } as const;
      }

      await tx
        .update(listings)
        .set({
          askPricePerSqFt: decision.targetAskPricePerSqFt!,
          buyNowPrice: decision.targetBuyNowPricePerSqFt,
          automaticMarkdownCurrentStep: decision.targetStep,
          automaticMarkdownLastAppliedAt: decision.lastAppliedAt,
          updatedAt: decision.evaluatedAt,
        })
        .where(eq(listings.id, listing.id));

      const oldAskPrice = Number(listing.askPricePerSqFt);
      const newAskPrice = decision.targetAskPricePerSqFt!;
      const oldBuyNowPrice =
        listing.buyNowPrice == null ? null : Number(listing.buyNowPrice);
      const newBuyNowPrice = decision.targetBuyNowPricePerSqFt;
      const dueAtIso = decision.dueAt?.toISOString() ?? null;

      await tx.insert(agentActions).values({
        userId: listing.sellerId,
        actionType: "listing_markdown_applied",
        relatedId: listing.id,
        details: {
          mode: "automatic_markdown",
          fromStep: decision.currentStep,
          toStep: decision.targetStep,
          appliedSteps: decision.appliedSteps,
          baseUnitPrice: decision.baseUnitPrice,
          oldAskPrice,
          newAskPrice,
          oldBuyNowPrice,
          newBuyNowPrice,
          floorPercent: listing.automaticMarkdownFloorPercent,
          intervalDays: listing.automaticMarkdownIntervalDays,
          dueAt: dueAtIso,
          appliedAt: decision.evaluatedAt.toISOString(),
        },
      });

      await tx.insert(notifications).values({
        userId: listing.sellerId,
        type: "system",
        title: "Automatic markdown applied",
        message:
          decision.appliedSteps > 1
            ? `Your listing price was automatically reduced from $${oldAskPrice.toFixed(2)} to $${newAskPrice.toFixed(2)}/sq ft and caught up ${decision.appliedSteps} scheduled markdown steps.`
            : `Your listing price was automatically reduced from $${oldAskPrice.toFixed(2)} to $${newAskPrice.toFixed(2)}/sq ft.`,
        data: {
          listingId: listing.id,
          fromStep: decision.currentStep,
          toStep: decision.targetStep,
          dueAt: dueAtIso,
        },
        read: false,
      });

      return {
        listingId,
        applied: true,
        reason: "ready",
        fromStep: decision.currentStep,
        toStep: decision.targetStep,
        oldAskPrice,
        newAskPrice,
      } as const;
    });

    results.push(result);
  }

  return {
    scanned: candidateIds.length,
    applied: results.filter((result) => result.applied).length,
    results,
    nextCursor:
      hasMore && candidateIds.length > 0
        ? { afterListingId: candidateIds.at(-1)! }
        : null,
  };
}

export const automaticListingMarkdown = inngest.createFunction(
  {
    id: "automatic-listing-markdown",
    name: "Listings: Automatic Markdown",
  },
  { event: PLANKMARKET_EVENTS.automaticListingMarkdownPage },
  async ({ event, step }) => {
    const page = event.data as AutomaticListingMarkdownPageEvent["data"];
    const result = await step.run("apply-automatic-markdown-page", async () => {
      return processAutomaticListingMarkdownPage(page);
    });

    if (result.nextCursor) {
      await step.sendEvent("queue-next-automatic-listing-markdown-page", {
        id: `automatic-listing-markdown:${result.nextCursor.afterListingId}`,
        name: PLANKMARKET_EVENTS.automaticListingMarkdownPage,
        data: {
          afterListingId: result.nextCursor.afterListingId,
        },
      });
    }

    return result;
  },
);
