import { inngest } from "../client";
import { db } from "@/server/db";
import { listings } from "@/server/db/schema/listings";
import { users } from "@/server/db/schema/users";
import { eq, and, lte, gte } from "drizzle-orm";
import { resend } from "@/lib/email/client";
import { escapeHtml } from "@/lib/utils";

export const listingExpiryWarning = inngest.createFunction(
  { id: "listing-expiry-warning", name: "Send Listing Expiry Warnings" },
  { cron: "0 9 * * *" }, // Daily at 9 AM
  async ({ step }) => {
    const results = await step.run("fetch-expiring-listings", async () => {
      // Find listings expiring in 7 days
      const sevenDaysFromNow = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      );
      const eightDaysFromNow = new Date(
        Date.now() + 8 * 24 * 60 * 60 * 1000
      );

      const expiringListings = await db
        .select({
          listingId: listings.id,
          listingTitle: listings.title,
          expiresAt: listings.expiresAt,
          sellerId: listings.sellerId,
          sellerEmail: users.email,
          sellerName: users.name,
        })
        .from(listings)
        .innerJoin(users, eq(listings.sellerId, users.id))
        .where(
          and(
            eq(listings.status, "active"),
            gte(listings.expiresAt, sevenDaysFromNow),
            lte(listings.expiresAt, eightDaysFromNow)
          )
        );

      return expiringListings;
    });

    const emailsSent = await step.run("send-warning-emails", async () => {
      let sentCount = 0;

      for (const listing of results) {
        try {
          await resend.emails.send({
            from: "PlankMarket <noreply@plankmarket.com>",
            to: listing.sellerEmail,
            subject: `Your listing "${escapeHtml(listing.listingTitle)}" expires in 7 days`,
            html: `
              <p>Hi ${escapeHtml(listing.sellerName ?? "")},</p>
              <p>Your listing "<strong>${escapeHtml(listing.listingTitle)}</strong>" will expire in 7 days on ${listing.expiresAt ? new Date(listing.expiresAt).toLocaleDateString() : "soon"}.</p>
              <p>To keep your listing active:</p>
              <ul>
                <li><a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/seller/listings/${listing.listingId}/edit">Edit and republish your listing</a></li>
                <li>Or <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/seller/listings">manage your listings</a></li>
              </ul>
              <p>If you've already sold this inventory, you can mark the listing as sold.</p>
            `,
          });

          sentCount++;
        } catch (error) {
           
          console.error(
            `Failed to send expiry warning for listing ${listing.listingId}:`,
            error
          );
        }
      }

      return sentCount;
    });

    return { expiringListings: results.length, emailsSent };
  }
);
