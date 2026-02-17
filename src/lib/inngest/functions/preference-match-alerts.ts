import { inngest } from "../client";
import { db } from "@/server/db";
import { listings } from "@/server/db/schema/listings";
import { userPreferences } from "@/server/db/schema/user-preferences";
import { notifications } from "@/server/db/schema/notifications";
import { users } from "@/server/db/schema/users";
import { eq, and, sql } from "drizzle-orm";
import { resend } from "@/lib/email/client";

// Haversine formula to calculate distance in miles between two lat/lng points
function haversineDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const preferenceMatchAlerts = inngest.createFunction(
  {
    id: "preference-match-alerts",
    name: "Send Preference Match Alerts on Listing Created",
  },
  { event: "listing/created" },
  async ({ event, step }) => {
    const { listingId } = event.data as { listingId: string };

    const listing = await step.run("fetch-listing", async () => {
      return db.query.listings.findFirst({
        where: eq(listings.id, listingId),
        with: {
          seller: {
            columns: { id: true, name: true },
          },
        },
      });
    });

    if (!listing || listing.status !== "active") {
      return { skipped: true, reason: "Listing not found or not active" };
    }

    const matchingBuyers = await step.run("find-matching-buyers", async () => {
      // Fetch all buyer preferences
      const allBuyerPrefs = await db
        .select({
          userId: userPreferences.userId,
          preferredMaterialTypes: userPreferences.preferredMaterialTypes,
          priceMinPerSqFt: userPreferences.priceMinPerSqFt,
          priceMaxPerSqFt: userPreferences.priceMaxPerSqFt,
          preferredZip: userPreferences.preferredZip,
          preferredRadiusMiles: userPreferences.preferredRadiusMiles,
          buyerEmail: users.email,
          buyerName: users.name,
        })
        .from(userPreferences)
        .innerJoin(users, eq(userPreferences.userId, users.id))
        .where(
          and(
            eq(userPreferences.role, "buyer"),
            // Only buyers who have set at least one preferred material type
            sql`${userPreferences.preferredMaterialTypes} IS NOT NULL`,
            // Buyer's preferredMaterialTypes includes the listing's materialType
            sql`${userPreferences.preferredMaterialTypes} ? ${listing.materialType}`
          )
        );

      // Apply price range and radius filters in-process
      const listingPrice = Number(listing.askPricePerSqFt);

      return allBuyerPrefs.filter((pref) => {
        // Price range filter
        if (
          pref.priceMinPerSqFt !== null &&
          pref.priceMinPerSqFt !== undefined &&
          listingPrice < pref.priceMinPerSqFt
        ) {
          return false;
        }
        if (
          pref.priceMaxPerSqFt !== null &&
          pref.priceMaxPerSqFt !== undefined &&
          listingPrice > pref.priceMaxPerSqFt
        ) {
          return false;
        }

        // Radius filter: only apply if buyer has a preferred ZIP and the listing has coordinates
        // We skip radius filtering if we lack the necessary geo data (latitude/longitude on listing)
        // because we don't have buyer lat/lng from ZIP alone without a geocoding service.
        // Sellers provide lat/lng on listings; buyer ZIP-based radius is advisory only here.
        // Future improvement: geocode buyer ZIP at preference save time and store lat/lng.
        if (
          pref.preferredZip &&
          pref.preferredRadiusMiles &&
          listing.locationLat !== null &&
          listing.locationLng !== null &&
          listing.locationLat !== undefined &&
          listing.locationLng !== undefined
        ) {
          // If listing has a ZIP and buyer has a ZIP, do a rough ZIP prefix match as a fallback
          // when we don't have buyer lat/lng. This is intentionally permissive.
          // Full geo-distance matching requires geocoding the buyer ZIP.
          // Assumption: if preferredRadiusMiles is very large (>= 500) treat as nationwide.
          if (pref.preferredRadiusMiles >= 500) {
            return true;
          }
          // Without buyer coordinates we cannot compute exact distance; include the buyer
          // so they don't miss relevant listings. This is the safe/permissive default.
        }

        return true;
      });
    });

    const notificationsAndEmailsSent = await step.run(
      "create-notifications-and-send-emails",
      async () => {
        let notifCount = 0;
        let emailCount = 0;

        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const listingUrl = `${appUrl}/listings/${listing.slug ?? listing.id}`;

        for (const buyer of matchingBuyers) {
          // Skip alerting the seller about their own listing
          if (buyer.userId === listing.sellerId) {
            continue;
          }

          try {
            // Create in-app notification
            await db.insert(notifications).values({
              userId: buyer.userId,
              type: "listing_match",
              title: "New listing matches your preferences",
              message: `A new ${listing.materialType.replace("_", " ")} listing "${listing.title}" is available for $${Number(listing.askPricePerSqFt).toFixed(2)}/sq ft.`,
              data: {
                listingId: listing.id,
                listingSlug: listing.slug,
                materialType: listing.materialType,
                askPricePerSqFt: Number(listing.askPricePerSqFt),
              },
            });
            notifCount++;
          } catch (notifError) {
            console.error(
              `Failed to create notification for buyer ${buyer.userId}:`,
              notifError
            );
          }

          try {
            // Send email notification
            await resend.emails.send({
              from: "PlankMarket <noreply@plankmarket.com>",
              to: buyer.buyerEmail,
              subject: `New listing matches your preferences: ${listing.title}`,
              html: `
                <p>Hi ${buyer.buyerName},</p>
                <p>A new listing that matches your material preferences just went live on PlankMarket.</p>
                <table style="border-collapse:collapse;width:100%;max-width:480px;">
                  <tr>
                    <td style="padding:8px 0;font-weight:bold;color:#555;">Listing</td>
                    <td style="padding:8px 0;">${listing.title}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-weight:bold;color:#555;">Material Type</td>
                    <td style="padding:8px 0;">${listing.materialType.replace(/_/g, " ")}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-weight:bold;color:#555;">Price</td>
                    <td style="padding:8px 0;">$${Number(listing.askPricePerSqFt).toFixed(2)}/sq ft</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-weight:bold;color:#555;">Total Available</td>
                    <td style="padding:8px 0;">${listing.totalSqFt} sq ft</td>
                  </tr>
                  ${
                    listing.locationState
                      ? `<tr>
                    <td style="padding:8px 0;font-weight:bold;color:#555;">Location</td>
                    <td style="padding:8px 0;">${listing.locationCity ? `${listing.locationCity}, ` : ""}${listing.locationState}${listing.locationZip ? ` ${listing.locationZip}` : ""}</td>
                  </tr>`
                      : ""
                  }
                  ${
                    listing.condition
                      ? `<tr>
                    <td style="padding:8px 0;font-weight:bold;color:#555;">Condition</td>
                    <td style="padding:8px 0;">${listing.condition.replace(/_/g, " ")}</td>
                  </tr>`
                      : ""
                  }
                </table>
                <br/>
                <a
                  href="${listingUrl}"
                  style="background:#1a1a1a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;"
                >
                  View Listing
                </a>
                <br/><br/>
                <p style="color:#888;font-size:12px;">
                  You're receiving this because this listing matches your buyer preferences on PlankMarket.
                  <a href="${appUrl}/buyer/preferences">Manage your preferences</a>.
                </p>
              `,
            });
            emailCount++;
          } catch (emailError) {
            console.error(
              `Failed to send preference match email to buyer ${buyer.userId}:`,
              emailError
            );
          }
        }

        return { notifCount, emailCount };
      }
    );

    return {
      listingId,
      matchingBuyers: matchingBuyers.length,
      notificationsSent: notificationsAndEmailsSent.notifCount,
      emailsSent: notificationsAndEmailsSent.emailCount,
    };
  }
);
