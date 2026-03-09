import { inngest } from "../client";
import { db } from "@/server/db";
import {
  agentConfigs,
  agentActions,
  notifications,
  users,
  listings,
} from "@/server/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { isPro } from "@/lib/pro";

export const agentRepricer = inngest.createFunction(
  { id: "agent-repricer", name: "AI Agent: Smart Repricing" },
  { cron: "0 6 * * *" }, // Daily at 6am UTC
  async ({ step }) => {
    // Step 1: Find all users with repricing enabled, joined with user data
    const configs = await step.run("load-configs", async () => {
      return db
        .select()
        .from(agentConfigs)
        .where(eq(agentConfigs.repricingEnabled, true))
        .innerJoin(users, eq(agentConfigs.userId, users.id));
    });

    for (const { agent_configs: config, users: user } of configs) {
      // Inngest serializes dates to strings; reconstruct for isPro check
      const proCheckable = {
        proStatus: user.proStatus ?? "free",
        proExpiresAt: user.proExpiresAt
          ? new Date(user.proExpiresAt as unknown as string)
          : null,
      };
      if (!isPro(proCheckable)) continue;

      await step.run(`reprice-${user.id}`, async () => {
        const staleDays = config.repricingStaleAfterDays ?? 14;
        const dropPercent = config.repricingDropPercent ?? 5;
        const floorPercent = config.repricingFloorPercent ?? 70;
        const staleDate = new Date(
          Date.now() - staleDays * 24 * 60 * 60 * 1000
        );

        // Find stale active listings with 0 offers
        const staleListings = await db.query.listings.findMany({
          where: and(
            eq(listings.sellerId, user.id),
            eq(listings.status, "active"),
            lt(listings.updatedAt, staleDate),
            eq(listings.offerCount, 0)
          ),
        });

        for (const listing of staleListings) {
          const currentPrice = Number(listing.askPricePerSqFt);

          // Check if this listing has been repriced before -- get original price from first reprice action
          const firstRepriceAction = await db.query.agentActions.findFirst({
            where: and(
              eq(agentActions.relatedId, listing.id),
              eq(agentActions.actionType, "listing_repriced"),
              eq(agentActions.userId, user.id)
            ),
            orderBy: (agentActions, { asc }) => [asc(agentActions.createdAt)],
          });

          const originalPrice = firstRepriceAction
            ? Number(
                (firstRepriceAction.details as Record<string, unknown>)
                  ?.originalPrice ??
                  (firstRepriceAction.details as Record<string, unknown>)
                    ?.oldPrice
              )
            : currentPrice;

          // Calculate floor from ORIGINAL price, not current
          const floorPrice = originalPrice * (floorPercent / 100);
          let newPrice = currentPrice * (1 - dropPercent / 100);

          // Enforce floor
          if (newPrice < floorPrice) newPrice = floorPrice;

          // Only reprice if meaningful change (> $0.01 difference)
          if (Math.abs(currentPrice - newPrice) < 0.01) continue;

          await db
            .update(listings)
            .set({
              askPricePerSqFt: newPrice,
              updatedAt: new Date(),
            })
            .where(eq(listings.id, listing.id));

          await db.insert(agentActions).values({
            userId: user.id,
            actionType: "listing_repriced",
            relatedId: listing.id,
            details: {
              originalPrice, // Always store original for future reference
              oldPrice: currentPrice,
              newPrice,
              dropPercent,
              reason: `No offers after ${staleDays} days`,
            },
          });

          await db.insert(notifications).values({
            userId: user.id,
            type: "system",
            title: "Listing Repriced",
            message: `Your AI agent reduced the price from $${currentPrice.toFixed(2)} to $${newPrice.toFixed(2)}/sqft on a stale listing.`,
            data: { listingId: listing.id },
            read: false,
          });
        }
      });
    }
  }
);
