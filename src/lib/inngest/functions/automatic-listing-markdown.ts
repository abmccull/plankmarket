import { inngest } from "../client";
import { db } from "@/server/db";
import {
  agentActions,
  listings,
  notifications,
} from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { resolveAutomaticMarkdownListingUpdate } from "@/lib/listing-pricing";

export const automaticListingMarkdown = inngest.createFunction(
  {
    id: "automatic-listing-markdown",
    name: "Listings: Automatic Markdown",
  },
  { cron: "0 5 * * *" },
  async ({ step }) => {
    const candidateIds = await step.run("load-candidate-listings", async () => {
      const rows = await db
        .select({ id: listings.id })
        .from(listings)
        .where(
          and(
            eq(listings.status, "active"),
            eq(listings.automaticMarkdownEnabled, true),
          ),
        );

      return rows.map((row) => row.id);
    });

    const results = [];

    for (const listingId of candidateIds) {
      const result = await step.run(`apply-markdown-${listingId}`, async () => {
        return db.transaction(async (tx) => {
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
      });

      results.push(result);
    }

    return {
      scanned: candidateIds.length,
      applied: results.filter((result) => result.applied).length,
      results,
    };
  },
);
