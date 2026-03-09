import { inngest } from "../client";
import { db } from "@/server/db";
import {
  agentConfigs,
  agentActions,
  notifications,
  users,
  savedSearches,
  listings,
} from "@/server/db/schema";
import { eq, and, gt, gte, lte } from "drizzle-orm";
import { isPro } from "@/lib/pro";

export const agentMonitor = inngest.createFunction(
  { id: "agent-monitor", name: "AI Agent: Monitor Listings" },
  { cron: "0 */4 * * *" }, // Every 4 hours
  async ({ step }) => {
    // Step 1: Find all users with monitoring enabled, joined with user data
    const configs = await step.run("load-configs", async () => {
      return db
        .select()
        .from(agentConfigs)
        .where(eq(agentConfigs.monitorEnabled, true))
        .innerJoin(users, eq(agentConfigs.userId, users.id));
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const { agent_configs: _config, users: user } of configs) {
      // Inngest serializes dates to strings; reconstruct for isPro check
      const proCheckable = {
        proStatus: user.proStatus ?? "free",
        proExpiresAt: user.proExpiresAt
          ? new Date(user.proExpiresAt as unknown as string)
          : null,
      };
      if (!isPro(proCheckable)) continue;

      // Step 2: For each Pro user, scan their saved searches for new matches
      await step.run(`scan-${user.id}`, async () => {
        const searches = await db.query.savedSearches.findMany({
          where: and(
            eq(savedSearches.userId, user.id),
            eq(savedSearches.alertEnabled, true)
          ),
        });

        for (const search of searches) {
          // Determine the time horizon: since last alert, or last 4 hours
          const since =
            search.lastAlertAt ??
            new Date(Date.now() - 4 * 60 * 60 * 1000);

          // Build filter conditions from saved search
          const conditions = [
            eq(listings.status, "active"),
            gt(listings.createdAt, since),
          ];

          // Apply saved search filters if present
          const filters = (search.filters ?? {}) as Record<string, unknown>;
          if (filters.materialType && typeof filters.materialType === "string") {
            conditions.push(eq(listings.materialType, filters.materialType as typeof listings.materialType.enumValues[number]));
          }
          if (filters.species && typeof filters.species === "string") {
            conditions.push(eq(listings.species, filters.species));
          }
          if (filters.minPrice && typeof filters.minPrice === "number") {
            conditions.push(gte(listings.askPricePerSqFt, filters.minPrice));
          }
          if (filters.maxPrice && typeof filters.maxPrice === "number") {
            conditions.push(lte(listings.askPricePerSqFt, filters.maxPrice));
          }

          // TODO: When auto-offer functionality is added to the monitor,
          // enforce monitorBudgetMonthly/monitorBudgetUsed limits here

          const newListings = await db.query.listings.findMany({
            where: and(...conditions),
            limit: 10,
          });

          if (newListings.length === 0) continue;

          // Log each match as an agent action
          for (const listing of newListings) {
            await db.insert(agentActions).values({
              userId: user.id,
              actionType: "match_found",
              relatedId: listing.id,
              details: { searchId: search.id, searchName: search.name },
            });
          }

          // Notify user about the matches
          await db.insert(notifications).values({
            userId: user.id,
            type: "system",
            title: `${newListings.length} New Match${newListings.length > 1 ? "es" : ""}`,
            message: `Your saved search "${search.name}" found ${newListings.length} new listing${newListings.length > 1 ? "s" : ""}.`,
            data: { searchId: search.id },
            read: false,
          });

          // Update lastAlertAt so the next scan only picks up newer listings
          await db
            .update(savedSearches)
            .set({ lastAlertAt: new Date() })
            .where(eq(savedSearches.id, search.id));
        }
      });
    }
  }
);
