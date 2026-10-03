import { asc, eq, and, sql, lte, or, gt } from "drizzle-orm";
import { inngest } from "../client";
import { PLANKMARKET_EVENTS } from "../events";
import { db } from "@/server/db";
import { auditEvents, listings } from "@/server/db/schema";
import { enqueueListingPublication } from "@/server/services/listing-publication";
import { enqueueListingRestoration } from "@/server/services/listing-restoration";

/** Recover committed publications and restorations after interrupted enqueue. */
export const listingPublicationRecovery = inngest.createFunction(
  { id: "listing-publication-recovery", retries: 2, concurrency: { limit: 1 } },
  { cron: "*/5 * * * *" },
  async ({ step }) =>
    step.sendEvent("start-publication-recovery", {
      name: PLANKMARKET_EVENTS.listingPublicationRecoveryPage,
      data: { scanStartedAt: new Date().toISOString() },
    }),
);

export const listingPublicationRecoveryPage = inngest.createFunction(
  {
    id: "listing-publication-recovery-page",
    retries: 2,
    concurrency: { limit: 1 },
  },
  { event: PLANKMARKET_EVENTS.listingPublicationRecoveryPage },
  async ({ event, step }) => {
    const { scanStartedAt, afterCreatedAt, afterId } = event.data;
    const pending = await step.run("load-pending-publications", () =>
      db
        .select({
          listingId: listings.id,
          id: auditEvents.id,
          action: auditEvents.action,
          intentKey: auditEvents.idempotencyKey,
          createdAt: sql<string>`${auditEvents.createdAt}::text`,
        })
        .from(auditEvents)
        .innerJoin(
          listings,
          eq(sql`${listings.id}::text`, auditEvents.entityId),
        )
        .where(
          and(
            or(
              and(
                eq(auditEvents.action, "listing.published"),
                sql`not exists (select 1 from audit_events accepted where accepted.idempotency_key = 'listing-publication-accepted:' || ${auditEvents.entityId})`,
              ),
              and(
                eq(auditEvents.action, "listing.restored"),
                sql`not exists (select 1 from audit_events accepted where accepted.idempotency_key = replace(${auditEvents.idempotencyKey}, 'listing-restored:', 'listing-restoration-accepted:'))`,
              ),
            ),
            lte(auditEvents.createdAt, new Date(scanStartedAt)),
            afterCreatedAt && afterId
              ? or(
                  sql`${auditEvents.createdAt} > ${afterCreatedAt}::timestamptz`,
                  and(
                    sql`${auditEvents.createdAt} = ${afterCreatedAt}::timestamptz`,
                    gt(auditEvents.id, afterId),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(asc(auditEvents.createdAt), asc(auditEvents.id))
        .limit(50),
    );
    let accepted = 0;
    let failed = 0;
    for (const item of pending) {
      try {
        if (
          await step.run(`enqueue-${item.id}`, () =>
            item.action === "listing.restored"
              ? item.intentKey
                ? enqueueListingRestoration(db, item.intentKey)
                : false
              : enqueueListingPublication(db, item.listingId),
          )
        )
          accepted++;
      } catch {
        failed++;
      }
    }
    if (failed)
      console.error("Listing publication recovery requires retry", { failed });
    // Continue past failures so an early poisoned record cannot starve later
    // sellers. Exact database timestamps preserve cursor precision across steps.
    const last = pending.at(-1);
    if (pending.length === 50 && last)
      await step.sendEvent("next-publication-page", {
        id: `listing-publication-page:${scanStartedAt}:${last.id}`,
        name: PLANKMARKET_EVENTS.listingPublicationRecoveryPage,
        data: {
          scanStartedAt,
          afterCreatedAt: last.createdAt,
          afterId: last.id,
        },
      });
    return { selected: pending.length, accepted, failed };
  },
);
