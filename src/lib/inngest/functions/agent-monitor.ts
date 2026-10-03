import { inngest } from "../client";
import { db } from "@/server/db";
import {
  agentConfigs,
  agentActions,
  notifications,
  savedSearches,
  listings,
} from "@/server/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import {
  lockAgentConfig,
  getEligibleAgentUser,
  agentOwnerId,
} from "@/server/services/agent-controls";
import { buildDigestListingConditions } from "@/server/services/saved-search-conditions";
import { filtersToSearchParams } from "@/lib/utils/search-filters";

export const agentMonitor = inngest.createFunction(
  { id: "agent-monitor", name: "AI Agent: Monitor Listings" },
  { cron: "0 */4 * * *" },
  async ({ step }) => {
    const owners = await step.run("load-configs", () =>
      db
        .select({ userId: agentConfigs.userId })
        .from(agentConfigs)
        .where(eq(agentConfigs.monitorEnabled, true)),
    );
    for (const checkpoint of owners) {
      const owner = { userId: agentOwnerId(checkpoint) };
      await step.run(`scan-${owner.userId}`, async () => {
        const searches = await db.query.savedSearches.findMany({
          where: and(
            eq(savedSearches.userId, owner.userId),
            eq(savedSearches.alertEnabled, true),
          ),
          columns: { id: true },
        });
        for (const candidate of searches)
          await db.transaction(async (tx) => {
            const config = await lockAgentConfig(tx, owner.userId);
            if (!config?.monitorEnabled) return;
            const user = await getEligibleAgentUser(tx, owner.userId);
            if (!user) return;
            await tx.execute(
              sql`select id from ${savedSearches} where ${savedSearches.id} = ${candidate.id} for update`,
            );
            const search = await tx.query.savedSearches.findFirst({
              where: and(
                eq(savedSearches.id, candidate.id),
                eq(savedSearches.userId, owner.userId),
                eq(savedSearches.alertEnabled, true),
              ),
            });
            if (!search) return;
            const now = new Date();
            const conditions = buildDigestListingConditions(
              {
                filters: search.filters,
                lastAlertAt: null,
                userId: user.id,
                userRole: user.role,
                userVerificationStatus: user.verificationStatus,
                userBusinessState: user.businessState,
              },
              search.createdAt,
              now,
            );
            const matches = await tx
              .select()
              .from(listings)
              .where(
                and(
                  ...conditions,
                  sql`not exists (
              select 1 from ${agentActions} where ${agentActions.userId} = ${user.id}
                and ${agentActions.actionType} = 'match_found' and ${agentActions.relatedId} = ${listings.id}
                and ${agentActions.details}->>'searchId' = ${search.id}
            )`,
                ),
              )
              .orderBy(asc(listings.publishedAt), asc(listings.id))
              .limit(10);
            if (!matches.length) return;
            for (const listing of matches)
              await tx.insert(agentActions).values({
                userId: user.id,
                actionType: "match_found",
                relatedId: listing.id,
                details: {
                  searchId: search.id,
                  searchName: search.name,
                  evaluatedThrough: now.toISOString(),
                },
              });
            await tx.insert(notifications).values({
              userId: user.id,
              type: "listing_match",
              title: `${matches.length} New Match${matches.length > 1 ? "es" : ""}`,
              message: `Your saved search "${search.name}" found ${matches.length} new listing${matches.length > 1 ? "s" : ""}.${matches.length === 10 ? " More matches may follow in the next scan." : ""}`,
              data: {
                savedSearchId: search.id,
                matchingListingIds: matches.map((listing) => listing.id),
                searchQuery: filtersToSearchParams(search.filters).toString(),
              },
              read: false,
            });
            // The action ledger deduplicates each match. Email/digest lastAlertAt
            // belongs to its delivery workflow and must never be advanced here.
          });
      });
    }
  },
);
