import { inngest } from "../client";
import { db } from "@/server/db";
import { savedSearches } from "@/server/db/schema/saved-searches";
import { listings } from "@/server/db/schema/listings";
import { notifications } from "@/server/db/schema/notifications";
import { users } from "@/server/db/schema/users";
import { eq, and, gte, sql } from "drizzle-orm";
import { resend } from "@/lib/email/client";
import { filtersToSearchParams } from "@/lib/utils/search-filters";
import type { SearchFilters } from "@/types";

const FREQUENCY_INTERVALS: Record<string, number> = {
  instant: 0, // always process
  daily: 24 * 60 * 60 * 1000, // 24h
  weekly: 7 * 24 * 60 * 60 * 1000, // 7d
};

export const savedSearchAlerts = inngest.createFunction(
  { id: "saved-search-alerts", name: "Send Saved Search Alerts" },
  { cron: "0 */4 * * *" }, // Every 4 hours
  async ({ step }) => {
    const results = await step.run("fetch-saved-searches", async () => {
      // Get all saved searches with alerts enabled
      const searches = await db
        .select({
          id: savedSearches.id,
          userId: savedSearches.userId,
          name: savedSearches.name,
          filters: savedSearches.filters,
          lastAlertAt: savedSearches.lastAlertAt,
          alertFrequency: savedSearches.alertFrequency,
          alertChannels: savedSearches.alertChannels,
          userEmail: users.email,
          userName: users.name,
        })
        .from(savedSearches)
        .innerJoin(users, eq(savedSearches.userId, users.id))
        .where(eq(savedSearches.alertEnabled, true));

      return searches;
    });

    const alertsSent = await step.run("process-alerts", async () => {
      let sentCount = 0;

      for (const search of results) {
        try {
          // Check frequency: skip if alerted too recently
          const frequency = (search.alertFrequency as string) || "instant";
          const minInterval = FREQUENCY_INTERVALS[frequency] ?? 0;

          if (minInterval > 0 && search.lastAlertAt) {
            const lastAlertTime = new Date(
              search.lastAlertAt as unknown as string | number
            ).getTime();
            if (Date.now() - lastAlertTime < minInterval) {
              continue; // too soon, skip this search
            }
          }

          // Find new listings matching the search filters since last alert
          const lastChecked =
            search.lastAlertAt || new Date(Date.now() - 24 * 60 * 60 * 1000);
          const filters = search.filters as SearchFilters;

          // Build query based on filters
          const conditions = [
            eq(listings.status, "active"),
            gte(listings.createdAt, new Date(lastChecked instanceof Date ? lastChecked.getTime() : lastChecked)),
          ] as ReturnType<typeof eq>[];

          if (filters.materialType && filters.materialType.length > 0) {
            conditions.push(
              sql`${listings.materialType} = ANY(${filters.materialType})`
            );
          }

          if (filters.condition && filters.condition.length > 0) {
            conditions.push(
              sql`${listings.condition} = ANY(${filters.condition})`
            );
          }

          if (filters.priceMin !== undefined) {
            conditions.push(gte(listings.askPricePerSqFt, filters.priceMin));
          }

          if (filters.priceMax !== undefined) {
            conditions.push(
              sql`${listings.askPricePerSqFt} <= ${filters.priceMax}`
            );
          }

          if (filters.state && filters.state.length > 0) {
            conditions.push(
              sql`${listings.locationState} = ANY(${filters.state})`
            );
          }

          const matchingListings = await db
            .select({
              id: listings.id,
              title: listings.title,
              askPricePerSqFt: listings.askPricePerSqFt,
              totalSqFt: listings.totalSqFt,
              materialType: listings.materialType,
              condition: listings.condition,
              locationState: listings.locationState,
            })
            .from(listings)
            .where(and(...conditions))
            .limit(10);

          if (matchingListings.length === 0) continue;

          const channels = (search.alertChannels as string[]) || ["email"];
          const appUrl =
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const searchUrl = `${appUrl}/listings?${filtersToSearchParams(filters)}`;

          // Send email if channel enabled
          if (channels.includes("email")) {
            await resend.emails.send({
              from: "PlankMarket <noreply@plankmarket.com>",
              to: search.userEmail,
              subject: `${matchingListings.length} new listing${matchingListings.length > 1 ? "s" : ""} match "${search.name}"`,
              html: `
                <p>Hi ${search.userName},</p>
                <p>We found ${matchingListings.length} new listing${matchingListings.length > 1 ? "s" : ""} that match your saved search "${search.name}":</p>
                <ul>
                  ${matchingListings
                    .map(
                      (listing) => `
                    <li>
                      <strong>${listing.title}</strong><br/>
                      $${listing.askPricePerSqFt}/sq ft • ${listing.totalSqFt} sq ft<br/>
                      ${listing.materialType} • ${listing.condition} • ${listing.locationState}
                      <br/>
                      <a href="${appUrl}/listings/${listing.id}">View Listing</a>
                    </li>
                  `
                    )
                    .join("")}
                </ul>
                <p><a href="${searchUrl}">View all matches</a></p>
              `,
            });
          }

          // Create in-app notification if channel enabled
          if (channels.includes("in_app")) {
            await db.insert(notifications).values({
              userId: search.userId,
              type: "listing_match",
              title: `${matchingListings.length} new match${matchingListings.length > 1 ? "es" : ""}`,
              message: `Your saved search "${search.name}" has ${matchingListings.length} new listing${matchingListings.length > 1 ? "s" : ""}.`,
              data: {
                savedSearchId: search.id,
                matchingListingIds: matchingListings.map((l) => l.id),
              },
            });
          }

          // Update last alert timestamp
          await db
            .update(savedSearches)
            .set({ lastAlertAt: new Date() })
            .where(eq(savedSearches.id, search.id));

          sentCount++;
        } catch (error) {

          console.error(
            `Failed to process saved search ${search.id}:`,
            error
          );
        }
      }

      return sentCount;
    });

    return { totalSearches: results.length, alertsSent };
  }
);
