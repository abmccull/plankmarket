import { inngest } from "../client";
import { db } from "@/server/db";
import { buyerRequests } from "@/server/db/schema/buyer-requests";
import { userPreferences } from "@/server/db/schema/user-preferences";
import { users } from "@/server/db/schema/users";
import { eq, and, gte, sql } from "drizzle-orm";
import { resend } from "@/lib/email/client";

export const buyerRequestAlerts = inngest.createFunction(
  { id: "buyer-request-alerts", name: "Send Buyer Request Alerts to Sellers" },
  { cron: "0 */4 * * *" }, // Every 4 hours
  async ({ step }) => {
    const recentRequests = await step.run("fetch-recent-buyer-requests", async () => {
      const since = new Date(Date.now() - 4 * 60 * 60 * 1000);

      const requests = await db
        .select({
          id: buyerRequests.id,
          title: buyerRequests.title,
          materialTypes: buyerRequests.materialTypes,
          minTotalSqFt: buyerRequests.minTotalSqFt,
          maxTotalSqFt: buyerRequests.maxTotalSqFt,
          priceMaxPerSqFt: buyerRequests.priceMaxPerSqFt,
          priceMinPerSqFt: buyerRequests.priceMinPerSqFt,
          destinationZip: buyerRequests.destinationZip,
          urgency: buyerRequests.urgency,
          notes: buyerRequests.notes,
          createdAt: buyerRequests.createdAt,
        })
        .from(buyerRequests)
        .where(
          and(
            eq(buyerRequests.status, "open"),
            gte(buyerRequests.createdAt, since)
          )
        );

      return requests;
    });

    const alertsSent = await step.run("match-and-alert-sellers", async () => {
      let sentCount = 0;

      for (const request of recentRequests) {
        try {
          const requestMaterialTypes = request.materialTypes as string[];

          // Find sellers whose typicalMaterialTypes overlap with the request's materialTypes
          const matchingSellers = await db
            .select({
              sellerId: userPreferences.userId,
              typicalMaterialTypes: userPreferences.typicalMaterialTypes,
              sellerEmail: users.email,
              sellerName: users.name,
            })
            .from(userPreferences)
            .innerJoin(users, eq(userPreferences.userId, users.id))
            .where(
              and(
                eq(userPreferences.role, "seller"),
                // Filter sellers whose typicalMaterialTypes array intersects with request materialTypes
                sql`${userPreferences.typicalMaterialTypes} ?| ${sql.raw(
                  `ARRAY[${requestMaterialTypes.map((m) => `'${m}'`).join(",")}]`
                )}`
              )
            );

          for (const seller of matchingSellers) {
            try {
              const appUrl =
                process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
              const urgencyLabel: Record<string, string> = {
                asap: "ASAP",
                "2_weeks": "Within 2 weeks",
                "4_weeks": "Within 4 weeks",
                flexible: "Flexible",
              };

              await resend.emails.send({
                from: "PlankMarket <noreply@plankmarket.com>",
                to: seller.sellerEmail,
                subject: `New buyer request matching your inventory: ${request.title}`,
                html: `
                  <p>Hi ${seller.sellerName},</p>
                  <p>A buyer just posted a new request that matches your inventory on PlankMarket.</p>
                  <table style="border-collapse:collapse;width:100%;max-width:480px;">
                    <tr>
                      <td style="padding:8px 0;font-weight:bold;color:#555;">Request</td>
                      <td style="padding:8px 0;">${request.title}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;font-weight:bold;color:#555;">Material Types</td>
                      <td style="padding:8px 0;">${requestMaterialTypes.join(", ")}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;font-weight:bold;color:#555;">Square Footage Needed</td>
                      <td style="padding:8px 0;">
                        ${request.minTotalSqFt} sq ft${request.maxTotalSqFt ? ` – ${request.maxTotalSqFt} sq ft` : ""}
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;font-weight:bold;color:#555;">Max Price</td>
                      <td style="padding:8px 0;">$${request.priceMaxPerSqFt}/sq ft${request.priceMinPerSqFt ? ` (min $${request.priceMinPerSqFt}/sq ft)` : ""}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;font-weight:bold;color:#555;">Destination ZIP</td>
                      <td style="padding:8px 0;">${request.destinationZip}</td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0;font-weight:bold;color:#555;">Urgency</td>
                      <td style="padding:8px 0;">${urgencyLabel[request.urgency] ?? request.urgency}</td>
                    </tr>
                    ${
                      request.notes
                        ? `<tr>
                      <td style="padding:8px 0;font-weight:bold;color:#555;">Buyer Notes</td>
                      <td style="padding:8px 0;">${request.notes}</td>
                    </tr>`
                        : ""
                    }
                  </table>
                  <br/>
                  <a
                    href="${appUrl}/buyer-requests/${request.id}"
                    style="background:#1a1a1a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;"
                  >
                    View Request &amp; Respond
                  </a>
                  <br/><br/>
                  <p style="color:#888;font-size:12px;">
                    You're receiving this because your seller preferences on PlankMarket match this buyer's material types.
                    <a href="${appUrl}/seller/preferences">Manage your preferences</a>.
                  </p>
                `,
              });

              sentCount++;
            } catch (emailError) {
              console.error(
                `Failed to send buyer request alert to seller ${seller.sellerId} for request ${request.id}:`,
                emailError
              );
            }
          }
        } catch (error) {
          console.error(
            `Failed to process buyer request ${request.id}:`,
            error
          );
        }
      }

      return sentCount;
    });

    return { totalRequests: recentRequests.length, alertsSent };
  }
);
