import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@/server/db";
import { auditEvents, listings, orders, users } from "@/server/db/schema";
import { listingFormSchema } from "@/lib/validators/listing";
import { deriveListingTrustFields } from "@/lib/listing-trust";
import { FREE_LIMITS, isPro } from "@/lib/pro";
import { resolveAutomaticMarkdownPersistence } from "@/lib/selling-rules";
import { inngest } from "@/lib/inngest/client";
import { buildListingCreatedEvent } from "@/lib/inngest/events";
import { appendAuditEvent } from "./audit-ledger";
import { lockUsableListingPhotos } from "./listing-media";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** All paths that add active inventory share this lock before counting capacity. */
export async function lockListingQuota(tx: Transaction, sellerId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`listing-quota:${sellerId}`}, 0))`,
  );
}

export async function assertListingCapacity(
  tx: Transaction,
  sellerId: string,
  additional: number,
) {
  const seller = await tx.query.users.findFirst({
    where: eq(users.id, sellerId),
  });
  if (
    !seller?.active ||
    (seller.role !== "admin" &&
      (seller.role !== "seller" || seller.verificationStatus !== "verified"))
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "An active, verified seller account is required to publish.",
    });
  }
  if (isPro(seller) || additional === 0) return;
  const [count] = await tx
    .select({ value: sql<number>`count(*)::int` })
    .from(listings)
    .where(and(eq(listings.sellerId, sellerId), eq(listings.status, "active")));
  if (count.value + additional > FREE_LIMITS.activeListings) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Free accounts can have ${FREE_LIMITS.activeListings} active listings. You can publish ${Math.max(0, FREE_LIMITS.activeListings - count.value)} more. Archive unavailable inventory or upgrade to Pro.`,
    });
  }
}

export async function recordListingPublication(
  tx: Transaction,
  sellerId: string,
  listingId: string,
  previousStatus: "draft" | null = "draft",
) {
  await appendAuditEvent(tx, {
    actorType: "user",
    actorId: sellerId,
    action: "listing.published",
    entityType: "listing",
    entityId: listingId,
    idempotencyKey: `listing-published:${listingId}`,
    summary:
      "Seller published inventory; listing alerts are pending enqueue acceptance.",
    metadata: { sellerId, previousStatus, status: "active" },
  });
}

// Publication truth and enqueue acceptance are separate immutable ledger records.
// Stable provider event IDs and recipient delivery keys make uncertain retries safe.
export async function enqueueListingPublication(
  database: Database,
  listingId: string,
) {
  const intent = await database.query.auditEvents.findFirst({
    where: eq(auditEvents.idempotencyKey, `listing-published:${listingId}`),
  });
  if (!intent) return false; // A replay must not invent publication for old active stock.
  const acceptedKey = `listing-publication-accepted:${listingId}`;
  const accepted = await database.query.auditEvents.findFirst({
    where: eq(auditEvents.idempotencyKey, acceptedKey),
  });
  if (accepted) return true;
  const listing = await database.query.listings.findFirst({
    where: eq(listings.id, listingId),
    columns: { sellerId: true },
  });
  if (!listing) return false;
  await inngest.send(
    buildListingCreatedEvent({ listingId, sellerId: listing.sellerId }),
  );
  await database
    .insert(auditEvents)
    .values({
      actorType: "system",
      action: "listing.publication_event_accepted",
      entityType: "listing",
      entityId: listingId,
      idempotencyKey: acceptedKey,
      summary: "Listing alert event accepted for processing.",
      metadata: { eventId: `listing-created:${listingId}` },
    })
    .onConflictDoNothing();
  return true;
}

/** Publication is already durable. A slow alert provider must not hold the UI
 * open or make the seller repeat a successful inventory mutation. The ledger
 * recovery job retries any intent lacking an acceptance marker if this warm
 * attempt times out or the request process stops. */
export async function tryEnqueueListingPublications(
  database: Database,
  ids: string[],
) {
  const delivery = (async () => {
    let pending = false;
    for (const id of ids) {
      try {
        await enqueueListingPublication(database, id);
      } catch {
        pending = true;
        console.error("Listing published; alert enqueue awaits recovery", {
          listingId: id,
        });
      }
    }
    return pending;
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      delivery,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), 1500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function publishDraftListings(
  database: Database,
  sellerId: string,
  requestedIds: string[],
  expectedUpdatedAt: Record<string, Date> = {},
) {
  const ids = [...new Set(requestedIds)].sort();
  const result = await database.transaction(async (tx) => {
    await lockListingQuota(tx, sellerId);
    const selected = await tx
      .select()
      .from(listings)
      .where(and(inArray(listings.id, ids), eq(listings.sellerId, sellerId)))
      .orderBy(asc(listings.id))
      .for("update");
    if (selected.length !== ids.length) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message:
          "One or more selected listings are unavailable. Refresh your inventory and try again.",
      });
    }
    if (
      selected.some((listing) => !["draft", "active"].includes(listing.status))
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Only drafts can be published. Archived, sold, and expired listings cannot be republished here.",
      });
    }
    const publishedIds: string[] = [];
    const alreadyPublishedIds = selected
      .filter((listing) => listing.status === "active")
      .map((listing) => listing.id);
    const skippedDetails: { id: string; title: string; message: string }[] = [];
    const ready: {
      listing: typeof listings.$inferSelect;
      photoCount: number;
    }[] = [];
    for (const listing of selected.filter((item) => item.status === "draft")) {
      const expected = expectedUpdatedAt[listing.id];
      if (expected && listing.updatedAt.getTime() !== expected.getTime()) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A selected draft changed since you reviewed it. Refresh and review its quantity, condition, and price before publishing.",
        });
      }
      const photos = await lockUsableListingPhotos(tx, listing);
      const parsed = listingFormSchema.safeParse(
        Object.fromEntries(
          Object.entries(listing).map(([key, value]) => [
            key,
            value ?? undefined,
          ]),
        ),
      );
      const [reservation] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.listingId, listing.id),
            isNull(orders.inventoryReleasedAt),
            inArray(orders.status, [
              "pending",
              "confirmed",
              "processing",
              "shipped",
              "cancelled",
            ]),
          ),
        )
        .limit(1);
      const message = reservation
        ? "An order is reserving this inventory. Resolve the order before publishing."
        : !photos.length
          ? "Add at least one saved product photo before publishing."
          : !parsed.success
            ? parsed.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join("; ")
            : null;
      if (message)
        skippedDetails.push({ id: listing.id, title: listing.title, message });
      else ready.push({ listing, photoCount: photos.length });
    }
    if (!ready.length && !alreadyPublishedIds.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Finish these drafts before publishing. ${skippedDetails.map((item) => `${item.title}: ${item.message}`).join(" ")}`,
      });
    }
    await assertListingCapacity(tx, sellerId, ready.length);
    // Match the database publication trigger's transaction timestamp, including
    // requests that waited for the quota/listing lock before becoming active.
    const [clock] = await tx.execute<{ now: string }>(sql`select now() as now`);
    const now = new Date(clock.now);
    for (const { listing, photoCount } of ready) {
      const markdown = resolveAutomaticMarkdownPersistence({
        next: listing,
        now,
      });
      await tx
        .update(listings)
        .set({
          ...markdown,
          status: "active",
          publishedAt: now,
          updatedAt: now,
          expiresAt: new Date(now.getTime() + 90 * 86400000),
          ...deriveListingTrustFields(
            { ...listing, status: "active", photoCount },
            now,
          ),
        })
        .where(
          and(
            eq(listings.id, listing.id),
            eq(listings.sellerId, sellerId),
            eq(listings.status, "draft"),
          ),
        );
      await recordListingPublication(tx, sellerId, listing.id);
      publishedIds.push(listing.id);
    }
    return {
      publishedIds,
      alreadyPublishedIds,
      skippedDetails,
      publishedCount: publishedIds.length,
      skippedCount: skippedDetails.length,
    };
  });
  const alertsPending = await tryEnqueueListingPublications(database, [
    ...result.publishedIds,
    ...result.alreadyPublishedIds,
  ]);
  return { ...result, alertsPending };
}

export async function reconfirmListing(
  database: Database,
  sellerId: string,
  id: string,
  expectedUpdatedAt?: Date,
) {
  return database.transaction(async (tx) => {
    const [listing] = await tx
      .select()
      .from(listings)
      .where(and(eq(listings.id, id), eq(listings.sellerId, sellerId)))
      .for("update");
    if (!listing)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Listing not found or unavailable to your account.",
      });
    if (listing.status !== "active" || listing.totalSqFt <= 0)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Only active listings with remaining stock can be confirmed.",
      });
    if (
      expectedUpdatedAt &&
      listing.updatedAt.getTime() !== expectedUpdatedAt.getTime()
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "This inventory changed since you opened it. Refresh and review the remaining quantity before confirming.",
      });
    }
    const photos = await lockUsableListingPhotos(tx, listing);
    if (!photos.length)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Add at least one saved product photo in Edit listing before confirming availability.",
      });
    const now = new Date();
    const [updated] = await tx
      .update(listings)
      .set({
        updatedAt: now,
        ...deriveListingTrustFields(
          { ...listing, photoCount: photos.length },
          now,
        ),
      })
      .where(and(eq(listings.id, id), eq(listings.sellerId, sellerId)))
      .returning();
    await appendAuditEvent(tx, {
      actorType: "user",
      actorId: sellerId,
      action: "listing.availability_confirmed",
      entityType: "listing",
      entityId: id,
      summary:
        "Seller confirmed the remaining inventory without changing quantity or reservations.",
      metadata: {
        quantitySqFt: listing.totalSqFt,
        condition: listing.condition,
        previousConfirmedAt: listing.lastConfirmedAt,
        confirmedAt: now,
      },
    });
    return updated;
  });
}
