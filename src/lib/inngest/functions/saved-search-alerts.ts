import { inngest } from "../client";
import { db } from "@/server/db";
import { savedSearches } from "@/server/db/schema/saved-searches";
import { listings } from "@/server/db/schema/listings";
import { users } from "@/server/db/schema/users";
import { eq, and, gte, sql } from "drizzle-orm";
import { resend } from "@/lib/email/client";
import type { SearchFilters } from "@/types";

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

          if (matchingListings.length > 0) {
            // Send email notification
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
                      <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/listings/${listing.id}">View Listing</a>
                    </li>
                  `
                    )
                    .join("")}
                </ul>
                <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/listings?saved_search=${search.id}">View all matches</a></p>
              `,
            });

            // Update last alert timestamp
            await db
              .update(savedSearches)
              .set({ lastAlertAt: new Date() })
              .where(eq(savedSearches.id, search.id));

            sentCount++;
          }
        } catch (error) {
          // eslint-disable-next-line no-console
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
