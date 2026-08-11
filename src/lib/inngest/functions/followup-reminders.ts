import { inngest } from "../client";
import { PLANKMARKET_EVENTS } from "../events";
import { db } from "@/server/db";
import { followups } from "@/server/db/schema/crm";
import { notifications } from "@/server/db/schema/notifications";
import { users } from "@/server/db/schema/users";
import { eq, and, gt, inArray, lte, or, sql } from "drizzle-orm";
import { sendEmailOrThrow } from "@/lib/email/delivery";
import { buildEmailIdempotencyKey } from "@/lib/email/delivery-policy";
import { env } from "@/env";
import { escapeHtml } from "@/lib/utils";

const FOLLOWUP_REMINDER_BATCH_SIZE = 100;

interface FollowupReminderPageEvent {
  data: {
    scanStartedAt: string;
    afterDueAt?: string;
    afterFollowupId?: string;
  };
}

function buildFollowupCursorWhere(input: {
  scanStartedAt: Date;
  afterDueAt?: Date;
  afterFollowupId?: string;
}) {
  const baseWhere = and(
    eq(followups.status, "pending"),
    lte(followups.dueAt, input.scanStartedAt),
  );

  if (!input.afterDueAt || !input.afterFollowupId) {
    return baseWhere;
  }

  return and(
    baseWhere,
    or(
      gt(followups.dueAt, input.afterDueAt),
      and(
        eq(followups.dueAt, input.afterDueAt),
        gt(followups.id, input.afterFollowupId),
      ),
    ),
  );
}

async function loadPendingFollowupsPage(input: {
  scanStartedAt: Date;
  afterDueAt?: Date;
  afterFollowupId?: string;
}) {
  return db
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
    .where(buildFollowupCursorWhere(input))
    .orderBy(followups.dueAt, followups.id)
    .limit(FOLLOWUP_REMINDER_BATCH_SIZE + 1);
}

export const followupReminderScheduler = inngest.createFunction(
  {
    id: "followup-reminder-scheduler",
    name: "Queue Followup Reminder Notifications",
  },
  { cron: "0 8 * * *" },
  async ({ step }) => {
    const scanStartedAt = new Date().toISOString();
    await step.sendEvent("queue-followup-reminder-page", {
      id: `followup-reminder:${scanStartedAt}`,
      name: PLANKMARKET_EVENTS.followupReminderPage,
      data: { scanStartedAt },
    });
    return { queued: true, scanStartedAt };
  },
);

export async function processFollowupReminderPage(
  eventData: FollowupReminderPageEvent["data"],
) {
  const scanStartedAt = new Date(eventData.scanStartedAt);
  const afterDueAt = eventData.afterDueAt
    ? new Date(eventData.afterDueAt)
    : undefined;
  const pendingFollowupsRaw = await loadPendingFollowupsPage({
    scanStartedAt,
    afterDueAt,
    afterFollowupId: eventData.afterFollowupId,
  });
  const hasMore = pendingFollowupsRaw.length > FOLLOWUP_REMINDER_BATCH_SIZE;
  const pendingFollowups = pendingFollowupsRaw.slice(0, FOLLOWUP_REMINDER_BATCH_SIZE);

  let remindersSent = 0;
  const failures: unknown[] = [];
  const reminderDay = scanStartedAt.toISOString().slice(0, 10);
  const buyerIds = Array.from(
    new Set(
      pendingFollowups
        .map((followup) => followup.buyerId)
        .filter((buyerId): buyerId is string => Boolean(buyerId)),
    ),
  );
  const buyers =
    buyerIds.length > 0
      ? await db.query.users.findMany({
          where: inArray(users.id, buyerIds),
          columns: { id: true, name: true },
        })
      : [];
  const buyerNames = new Map(buyers.map((buyer) => [buyer.id, buyer.name ?? null]));

  for (const followup of pendingFollowups) {
    try {
      const buyerName = followup.buyerId
        ? (buyerNames.get(followup.buyerId) ?? null)
        : null;
      const dueDate = new Date(followup.dueAt).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const notificationMessage = buyerName
        ? `Your followup "${escapeHtml(followup.title)}" with ${escapeHtml(buyerName)} was due on ${dueDate}.`
        : `Your followup "${escapeHtml(followup.title)}" was due on ${dueDate}.`;

      try {
        const existingNotification = await db
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, followup.sellerId),
              eq(notifications.type, "system"),
              sql`${notifications.data}->>'followupId' = ${followup.id}`,
              sql`${notifications.data}->>'reminderDay' = ${reminderDay}`,
            ),
          )
          .limit(1);
        if (existingNotification.length === 0) {
          await db.insert(notifications).values({
            userId: followup.sellerId,
            type: "system",
            title: "Followup reminder",
            message: notificationMessage,
            data: {
              followupId: followup.id,
              reminderDay,
              conversationId: followup.conversationId ?? undefined,
              buyerId: followup.buyerId ?? undefined,
            },
          });
        }
      } catch (notifError) {
        failures.push(notifError);
        console.error(
          `Failed to create notification for followup ${followup.id}:`,
          notifError,
        );
      }

      const appUrl = env.NEXT_PUBLIC_APP_URL;
      const conversationLink = followup.conversationId
        ? `${appUrl}/messages/${followup.conversationId}`
        : null;

      try {
        await sendEmailOrThrow({
          category: "followup_reminder",
          idempotencyKey: buildEmailIdempotencyKey(
            "followup_reminder",
            followup.id,
            reminderDay,
          ),
          message: {
            from: env.EMAIL_FROM,
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
          },
        });
        remindersSent++;
      } catch (emailError) {
        failures.push(emailError);
        console.error(
          `Failed to send followup reminder email to seller ${followup.sellerId} for followup ${followup.id}:`,
          emailError,
        );
      }
    } catch (error) {
      failures.push(error);
      console.error(
        `Failed to process followup reminder ${followup.id}:`,
        error,
      );
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "One or more followup reminders could not be delivered",
    );
  }

  const lastFollowup = pendingFollowups.at(-1);

  return {
    totalFollowups: pendingFollowups.length,
    remindersSent,
    nextCursor:
      hasMore && lastFollowup
        ? {
            afterDueAt: lastFollowup.dueAt.toISOString(),
            afterFollowupId: lastFollowup.id,
          }
        : null,
  };
}

export const followupReminders = inngest.createFunction(
  { id: "followup-reminders", name: "Send Followup Reminder Notifications" },
  { event: PLANKMARKET_EVENTS.followupReminderPage },
  async ({ event, step }) => {
    const page = event.data as FollowupReminderPageEvent["data"];
    const result = await step.run("send-followup-reminder-page", async () => {
      return processFollowupReminderPage(page);
    });
    if (result.nextCursor) {
      await step.sendEvent("queue-next-followup-reminder-page", {
        id: `followup-reminder:${page.scanStartedAt}:${result.nextCursor.afterDueAt}:${result.nextCursor.afterFollowupId}`,
        name: PLANKMARKET_EVENTS.followupReminderPage,
        data: {
          scanStartedAt: page.scanStartedAt,
          afterDueAt: result.nextCursor.afterDueAt,
          afterFollowupId: result.nextCursor.afterFollowupId,
        },
      });
    }
    return result;
  },
);
