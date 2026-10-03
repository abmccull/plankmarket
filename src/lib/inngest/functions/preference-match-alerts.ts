import { inngest } from "../client";
import { db } from "@/server/db";
import { listings } from "@/server/db/schema/listings";
import { userPreferences } from "@/server/db/schema/user-preferences";
import { notifications } from "@/server/db/schema/notifications";
import { users } from "@/server/db/schema/users";
import { eq, and, sql } from "drizzle-orm";
import { sendEmailOrThrow } from "@/lib/email/delivery";
import { buildEmailIdempotencyKey, EmailSuppressedError } from "@/lib/email/delivery-policy";
import { env } from "@/env";
import { escapeHtml } from "@/lib/utils";
import { isListingVisibleToBuyers } from "@/lib/listing-freshness";
import { isListingTerritoryVisibleToViewer } from "@/server/security/listing-visibility";
import { getDirectPurchaseUnitPrice } from "@/lib/listing-pricing";
import { listingMatchesSavedSearch, type SavedSearchMatchListing } from "@/lib/saved-search-matching";
import zipcodes from "zipcodes";

type AlertListing = SavedSearchMatchListing &
  Pick<typeof listings.$inferSelect, "id" | "slug" | "sellerId" | "territoryMode" | "allowedDestinationStates"> &
  Parameters<typeof isListingVisibleToBuyers>[0];

async function findMatchingBuyers(listing: AlertListing, userId?: string) {
  // Buying material preferences belong to any purchasing account.
  const allBuyerPrefs = await db
    .select({
      userId: userPreferences.userId,
      preferredMaterialTypes: userPreferences.preferredMaterialTypes,
      priceMinPerSqFt: userPreferences.priceMinPerSqFt,
      priceMaxPerSqFt: userPreferences.priceMaxPerSqFt,
      preferredZip: userPreferences.preferredZip,
      preferredRadiusMiles: userPreferences.preferredRadiusMiles,
      minLotSizeSqFt: userPreferences.minLotSizeSqFt,
      maxLotSizeSqFt: userPreferences.maxLotSizeSqFt,
      waterproofRequired: userPreferences.waterproofRequired,
      buyerMatchInAppEnabled: userPreferences.buyerMatchInAppEnabled,
      buyerMatchEmailEnabled: userPreferences.buyerMatchEmailEnabled,
      buyerEmail: users.email,
      buyerName: users.name,
      buyerRole: users.role,
      buyerVerificationStatus: users.verificationStatus,
      buyerBusinessState: users.businessState,
    })
    .from(userPreferences)
    .innerJoin(users, eq(userPreferences.userId, users.id))
    .where(
      and(
        eq(users.active, true),
        userId ? eq(userPreferences.userId, userId) : undefined,
        // Only accounts that have chosen buying material preferences
        sql`${userPreferences.preferredMaterialTypes} IS NOT NULL`,
        // Buyer's preferredMaterialTypes includes the listing's materialType
        sql`${userPreferences.preferredMaterialTypes} ? ${listing.materialType}`,
      ),
    );

  return allBuyerPrefs.filter((pref) => {
    if (
      !isListingTerritoryVisibleToViewer(listing, {
        id: pref.userId,
        role: pref.buyerRole,
        verificationStatus: pref.buyerVerificationStatus,
        businessState: pref.buyerBusinessState,
      })
    ) {
      return false;
    }

    // A chosen radius requires verifiable geography. Unknown locations must
    // not silently turn a local preference into nationwide alerts.
    if (pref.preferredRadiusMiles != null) {
      if (
        !Number.isFinite(pref.preferredRadiusMiles) ||
        pref.preferredRadiusMiles <= 0 ||
        !pref.preferredZip ||
        !/^\d{5}$/.test(pref.preferredZip) ||
        !zipcodes.lookup(pref.preferredZip) ||
        listing.locationLat == null ||
        listing.locationLng == null ||
        !Number.isFinite(listing.locationLat) ||
        !Number.isFinite(listing.locationLng) ||
        Math.abs(listing.locationLat) > 90 ||
        Math.abs(listing.locationLng) > 180
      ) {
        return false;
      }
    }

    // Reuse catalog matching for direct price, lot size, reviewed evidence
    // and ZIP-centroid distance, including large finite radii.
    return listingMatchesSavedSearch(listing, {
      priceMin: pref.priceMinPerSqFt ?? undefined,
      priceMax: pref.priceMaxPerSqFt ?? undefined,
      minLotSize: pref.minLotSizeSqFt ?? undefined,
      maxLotSize: pref.maxLotSizeSqFt ?? undefined,
      waterproofRequired: pref.waterproofRequired ? true : undefined,
      buyerZip: pref.preferredZip ?? undefined,
      maxDistance: pref.preferredRadiusMiles ?? undefined,
    });
  });
}

type MatchBuyer = Awaited<ReturnType<typeof findMatchingBuyers>>[number];

async function currentChannelEnabled(
  snapshot: AlertListing,
  buyer: MatchBuyer,
  channel: "in_app" | "email",
): Promise<boolean> {
  const current = await db.query.listings.findFirst({ where: eq(listings.id, snapshot.id) });
  if (!current || !isListingVisibleToBuyers(current) || current.sellerId === buyer.userId) return false;

  // Keep the event payload stable for provider retries. A changed advertisement
  // or recipient belongs to a new event, not the old delivery identity.
  const advertisedFields = [
    "title", "slug", "materialType", "totalSqFt", "askPricePerSqFt",
    "buyNowPrice", "locationCity", "locationState", "locationZip", "condition",
  ] as const;
  if (advertisedFields.some((field) => (current[field] ?? null) !== (snapshot[field] ?? null))) return false;
  const [latest] = await findMatchingBuyers(current, buyer.userId);
  if (!latest || latest.buyerEmail.trim().toLowerCase() !== buyer.buyerEmail.trim().toLowerCase()) return false;
  return channel === "in_app" ? latest.buyerMatchInAppEnabled : latest.buyerMatchEmailEnabled;
}

export const preferenceMatchAlerts = inngest.createFunction(
  {
    id: "preference-match-alerts",
    name: "Send Preference Match Alerts on Listing Created",
  },
  { event: "listing/created" },
  async ({ event, step }) => {
    const { listingId } = event.data;

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

    if (!listing || !isListingVisibleToBuyers(listing)) {
      return { skipped: true, reason: "Listing not found or not active" };
    }
    const directPurchaseUnitPrice = getDirectPurchaseUnitPrice(listing);

    const matchingBuyers = await step.run("find-matching-buyers", () => findMatchingBuyers(listing));

    const notificationsAndEmailsSent = await step.run(
      "create-notifications-and-send-emails",
      async () => {
        let notifCount = 0;
        let emailCount = 0;
        let suppressedCount = 0;
        const failures: unknown[] = [];

        const appUrl = env.NEXT_PUBLIC_APP_URL;
        const listingUrl = `${appUrl}/listings/${listing.slug ?? listing.id}`;

        for (const buyer of matchingBuyers) {
          // Skip alerting the seller about their own listing
          if (buyer.userId === listing.sellerId) {
            continue;
          }

          try {
            if (await currentChannelEnabled(listing, buyer, "in_app")) {
              const created = await db.transaction(async (tx) => {
                await tx.execute(
                  sql`select pg_advisory_xact_lock(hashtextextended(${`preference-match:${buyer.userId}:${listing.id}`}, 0))`,
                );
                const existingNotification = await tx
                  .select({ id: notifications.id })
                  .from(notifications)
                  .where(
                    and(
                      eq(notifications.userId, buyer.userId),
                      eq(notifications.type, "listing_match"),
                      sql`${notifications.data}->>'listingId' = ${listing.id}`,
                    ),
                  )
                  .limit(1);

                if (existingNotification.length === 0) {
                  await tx.insert(notifications).values({
                    userId: buyer.userId,
                    type: "listing_match",
                    title: "New listing matches your preferences",
                    message: `A new ${escapeHtml(listing.materialType.replace("_", " "))} listing "${escapeHtml(listing.title)}" is available for $${directPurchaseUnitPrice.toFixed(2)}/sq ft direct purchase.`,
                    data: {
                      listingId: listing.id,
                      listingSlug: listing.slug,
                      materialType: listing.materialType,
                      askPricePerSqFt: Number(listing.askPricePerSqFt),
                      directPurchasePricePerSqFt: directPurchaseUnitPrice,
                    },
                  });
                  return true;
                }
                return false;
              });
              if (created) notifCount++;
            }
          } catch (notifError) {
            failures.push(notifError);
            console.error(
              `Failed to create notification for buyer ${buyer.userId}:`,
              notifError,
            );
          }

          try {
            if (!(await currentChannelEnabled(listing, buyer, "email"))) continue;
            // Send the frozen event payload after checking current eligibility.
            await sendEmailOrThrow({
              category: "preference_match_alert",
              idempotencyKey: buildEmailIdempotencyKey(
                "preference_match_alert",
                listing.id,
                buyer.userId,
              ),
              message: {
                from: env.EMAIL_FROM,
                to: buyer.buyerEmail,
                subject: `New listing matches your preferences: ${escapeHtml(listing.title)}`,
                html: `
                <p>Hi ${escapeHtml(buyer.buyerName ?? "")},</p>
                <p>A new listing that matches your material preferences just went live on PlankMarket.</p>
                <table style="border-collapse:collapse;width:100%;max-width:480px;">
                  <tr>
                    <td style="padding:8px 0;font-weight:bold;color:#555;">Listing</td>
                    <td style="padding:8px 0;">${escapeHtml(listing.title)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-weight:bold;color:#555;">Material Type</td>
                    <td style="padding:8px 0;">${escapeHtml(listing.materialType.replace(/_/g, " "))}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-weight:bold;color:#555;">Price</td>
                    <td style="padding:8px 0;">$${directPurchaseUnitPrice.toFixed(2)}/sq ft direct purchase</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-weight:bold;color:#555;">Total Available</td>
                    <td style="padding:8px 0;">${listing.totalSqFt} sq ft</td>
                  </tr>
                  ${
                    listing.locationState
                      ? `<tr>
                    <td style="padding:8px 0;font-weight:bold;color:#555;">Location</td>
                    <td style="padding:8px 0;">${listing.locationCity ? `${escapeHtml(listing.locationCity)}, ` : ""}${escapeHtml(listing.locationState ?? "")}${listing.locationZip ? ` ${escapeHtml(listing.locationZip)}` : ""}</td>
                  </tr>`
                      : ""
                  }
                  ${
                    listing.condition
                      ? `<tr>
                    <td style="padding:8px 0;font-weight:bold;color:#555;">Condition</td>
                    <td style="padding:8px 0;">${escapeHtml(listing.condition.replace(/_/g, " "))}</td>
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
                  <a href="${appUrl}/preferences?workspace=buyer">Manage your preferences</a>.
                </p>
              `,
              },
            });
            emailCount++;
          } catch (emailError) {
            if (emailError instanceof EmailSuppressedError) {
              // The delivery ledger already records this terminal channel state.
              // Keep the in-app alert without retrying a blocked email address.
              suppressedCount++;
              continue;
            }
            failures.push(emailError);
            console.error(
              `Failed to send preference match email to buyer ${buyer.userId}:`,
              emailError,
            );
          }
        }

        if (failures.length > 0) {
          throw new AggregateError(
            failures,
            "One or more preference alerts could not be delivered",
          );
        }

        return { notifCount, emailCount, suppressedCount };
      },
    );

    return {
      listingId,
      matchingBuyers: matchingBuyers.length,
      notificationsSent: notificationsAndEmailsSent.notifCount,
      emailsSent: notificationsAndEmailsSent.emailCount,
      emailsSuppressed: notificationsAndEmailsSent.suppressedCount,
    };
  },
);
