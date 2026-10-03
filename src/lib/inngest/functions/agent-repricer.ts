import { inngest } from "../client";
import { db } from "@/server/db";
import {
  agentConfigs,
  agentActions,
  notifications,
  listings,
} from "@/server/db/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import {
  lockAgentConfig,
  getEligibleAgentUser,
  agentOwnerId,
} from "@/server/services/agent-controls";

export const agentRepricer = inngest.createFunction(
  { id: "agent-repricer", name: "AI Agent: Smart Repricing" },
  { cron: "0 6 * * *" },
  async ({ step, event, runId }) => {
    const owners = await step.run("load-configs", () =>
      db
        .select({ userId: agentConfigs.userId })
        .from(agentConfigs)
        .where(eq(agentConfigs.repricingEnabled, true)),
    );
    const invocation = event.id ?? runId;

    for (const checkpoint of owners) {
      const owner = { userId: agentOwnerId(checkpoint) };
      await step.run(`reprice-${owner.userId}`, async () => {
        // Discovery is only a hint; each bounded transaction checks current rules.
        const candidates = await db.query.listings.findMany({
          where: and(
            eq(listings.sellerId, owner.userId),
            eq(listings.status, "active"),
            eq(listings.automaticMarkdownEnabled, false),
            eq(listings.offerCount, 0),
          ),
          columns: { id: true },
        });
        for (const candidate of candidates)
          await db.transaction(async (tx) => {
            const config = await lockAgentConfig(tx, owner.userId);
            if (
              !config?.repricingEnabled ||
              !(await getEligibleAgentUser(tx, owner.userId, true))
            )
              return;
            await tx.execute(
              sql`select id from ${listings} where ${listings.id} = ${candidate.id} for update`,
            );
            const now = new Date();
            const staleDays = config.repricingStaleAfterDays ?? 14;
            const dropPercent = config.repricingDropPercent ?? 5;
            const floorPercent = config.repricingFloorPercent ?? 70;
            const eligible = and(
              eq(listings.id, candidate.id),
              eq(listings.sellerId, owner.userId),
              eq(listings.status, "active"),
              eq(listings.automaticMarkdownEnabled, false),
              lt(
                listings.updatedAt,
                new Date(now.getTime() - staleDays * 86400000),
              ),
              eq(listings.offerCount, 0),
            );
            const listing = await tx.query.listings.findFirst({
              where: eligible,
            });
            if (!listing) return;
            const executionKey = `reprice:${invocation}:${candidate.id}`;
            const previous = await tx.query.agentActions.findFirst({
              where: and(
                eq(agentActions.userId, owner.userId),
                eq(agentActions.relatedId, candidate.id),
                eq(agentActions.actionType, "listing_repriced"),
                sql`${agentActions.details}->>'executionKey' = ${executionKey}`,
              ),
            });
            if (previous) return;
            const first = await tx.query.agentActions.findFirst({
              where: and(
                eq(agentActions.relatedId, candidate.id),
                eq(agentActions.actionType, "listing_repriced"),
                eq(agentActions.userId, owner.userId),
              ),
              orderBy: (actions, { asc }) => [
                asc(actions.createdAt),
                asc(actions.id),
              ],
            });
            const currentPrice = Number(listing.askPricePerSqFt);
            const details = first?.details as
              | Record<string, unknown>
              | undefined;
            const originalPrice = details
              ? Number(details.originalPrice ?? details.oldPrice)
              : currentPrice;
            if (
              !Number.isFinite(originalPrice) ||
              !Number.isFinite(currentPrice) ||
              originalPrice <= 0 ||
              currentPrice <= 0
            )
              return;
            const newPrice = Math.max(
              (originalPrice * floorPercent) / 100,
              currentPrice * (1 - dropPercent / 100),
            );
            // Never raise a price that a seller has already moved below the stored floor.
            if (newPrice >= currentPrice || currentPrice - newPrice < 0.01)
              return;
            const [updated] = await tx
              .update(listings)
              .set({ askPricePerSqFt: newPrice, updatedAt: now })
              .where(eligible)
              .returning({ id: listings.id });
            if (!updated) return;
            await tx
              .insert(agentActions)
              .values({
                userId: owner.userId,
                actionType: "listing_repriced",
                relatedId: candidate.id,
                details: {
                  executionKey,
                  originalPrice,
                  oldPrice: currentPrice,
                  newPrice,
                  dropPercent,
                  reason: `No offers after ${staleDays} days`,
                },
              });
            await tx
              .insert(notifications)
              .values({
                userId: owner.userId,
                type: "system",
                title: "Listing Repriced",
                message: `Your AI agent reduced the price from $${currentPrice.toFixed(2)} to $${newPrice.toFixed(2)}/sq ft on a stale listing.`,
                data: { listingId: candidate.id },
                read: false,
              });
          });
      });
    }
  },
);
