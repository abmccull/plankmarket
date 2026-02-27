import { inngest } from "../client";
import { db } from "@/server/db";
import { followups } from "@/server/db/schema/crm";
import { notifications } from "@/server/db/schema/notifications";
import { users } from "@/server/db/schema/users";
import { eq, and, lte } from "drizzle-orm";
import { resend } from "@/lib/email/client";
import { escapeHtml } from "@/lib/utils";

export const followupReminders = inngest.createFunction(
  { id: "followup-reminders", name: "Send Followup Reminder Notifications" },
  { cron: "0 8 * * *" }, // Daily at 8 AM UTC
  async ({ step }) => {
    const pendingFollowups = await step.run(
      "fetch-pending-followups",
      async () => {
        const now = new Date();

        const results = await db
          .select({
            id: followups.id,
            title: followups.title,
            dueAt: followups.dueAt,
            conversationId: followups.conversationId,
            sellerId: followups.sellerId,
            buyerId: followups.buyerId,
            sellerEmail: users.email,
            sellerName: users.name,
          })
          .from(followups)
          .innerJoin(users, eq(followups.sellerId, users.id))
          .where(
            and(
              eq(followups.status, "pending"),
              lte(followups.dueAt, now)
            )
          );

        return results;
      }
    );

    const remindersSent = await step.run(
      "send-reminder-notifications",
      async () => {
        let sentCount = 0;

        for (const followup of pendingFollowups) {
          try {
            // Fetch buyer name if a buyerId is linked
            let buyerName: string | null = null;
            if (followup.buyerId) {
              const buyer = await db.query.users.findFirst({
                where: eq(users.id, followup.buyerId),
                columns: { name: true },
              });
              buyerName = buyer?.name ?? null;
            }

            const dueDate = new Date(followup.dueAt).toLocaleDateString(
              "en-US",
              {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              }
            );

            const notificationMessage = buyerName
              ? `Your followup "${escapeHtml(followup.title)}" with ${escapeHtml(buyerName)} was due on ${dueDate}.`
              : `Your followup "${escapeHtml(followup.title)}" was due on ${dueDate}.`;

            // Create in-app notification for the seller
            try {
              await db.insert(notifications).values({
                userId: followup.sellerId,
                type: "system",
                title: "Followup reminder",
                message: notificationMessage,
                data: {
                  followupId: followup.id,
                  conversationId: followup.conversationId ?? undefined,
                  buyerId: followup.buyerId ?? undefined,
                },
              });
            } catch (notifError) {
              console.error(
                `Failed to create notification for followup ${followup.id}:`,
                notifError
              );
            }

            // Send email reminder
            const appUrl =
              process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
            const conversationLink = followup.conversationId
              ? `${appUrl}/messages/${followup.conversationId}`
              : null;

            try {
              await resend.emails.send({
                from: "PlankMarket <noreply@plankmarket.com>",
                to: followup.sellerEmail,
                subject: `Followup reminder: ${escapeHtml(followup.title)}`,
                html: `
                  <p>Hi ${escapeHtml(followup.sellerName ?? "")},</p>
                  <p>This is a reminder about a followup that is due.</p>
                  <table style="border-collapse:collapse;width:100%;max-width:480px;">
                    <tr>
                      <td style="padding:8px 0;font-weight:bold;color:#555;">Followup</td>
                      <td style="padding:8px 0;">${escapeHtml(followup.title)}</td>
                    </tr>
                    ${
                      buyerName
                        ? `<tr>
                      <td style="padding:8px 0;font-weight:bold;color:#555;">Buyer</td>
                      <td style="padding:8px 0;">${escapeHtml(buyerName)}</td>
                    </tr>`
                        : ""
                    }
                    <tr>
                      <td style="padding:8px 0;font-weight:bold;color:#555;">Due Date</td>
                      <td style="padding:8px 0;">${dueDate}</td>
                    </tr>
                  </table>
                  <br/>
                  ${
                    conversationLink
                      ? `<a
                      href="${conversationLink}"
                      style="background:#1a1a1a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;"
                    >
                      Go to Conversation
                    </a>`
                      : `<a
                      href="${appUrl}/seller/crm"
                      style="background:#1a1a1a;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;"
                    >
                      View CRM
                    </a>`
                  }
                  <br/><br/>
                  <p style="color:#888;font-size:12px;">
                    You're receiving this because you have a pending followup on PlankMarket.
                    <a href="${appUrl}/seller/crm">Manage your followups</a>.
                  </p>
                `,
              });
              sentCount++;
            } catch (emailError) {
              console.error(
                `Failed to send followup reminder email to seller ${followup.sellerId} for followup ${followup.id}:`,
                emailError
              );
            }
          } catch (error) {
            console.error(
              `Failed to process followup reminder ${followup.id}:`,
              error
            );
          }
        }

        return sentCount;
      }
    );

    return { totalFollowups: pendingFollowups.length, remindersSent };
  }
);
