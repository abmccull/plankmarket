import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/server/db";
import {
  auditEvents,
  listings,
  media,
  notifications,
  orders,
  users,
} from "@/server/db/schema";
import { listingFormSchema } from "@/lib/validators/listing";
import { computeListingQuality } from "@/lib/listing-quality";
import { inngest } from "@/lib/inngest/client";
import { buildListingCreatedEvent } from "@/lib/inngest/events";
import { appendAuditEvent } from "./audit-ledger";
import { assertListingCapacity, lockListingQuota } from "./listing-publication";
import { lockUsableListingPhotos } from "./listing-media";

// PostgreSQL retains microseconds; a Date round trip cannot identify the exact
// archived version that the admin reviewed.
export const restoreListingInput = z.object({
  listingId: z.string().uuid(),
  restorationVersion: z.string().datetime({ precision: 6 }),
});
const receiptSchema = z.object({
  listingId: z.string().uuid(),
  restorationId: z.string().regex(/^listing-restored:[a-f0-9]{64}$/),
  restoredAt: z.string().datetime(),
  publishedAt: z.string().datetime(),
  confirmationRequired: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
});
type Receipt = z.infer<typeof receiptSchema>;
type Input = z.infer<typeof restoreListingInput>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function restorationKey(input: Input) {
  return `listing-restored:${createHash("sha256").update(`${input.listingId}:${input.restorationVersion}`).digest("hex")}`;
}
function acceptedKey(restorationId: string) {
  return restorationId.replace(
    "listing-restored:",
    "listing-restoration-accepted:",
  );
}
function hasDatabaseCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; cause?: unknown };
  return (
    value.code === code ||
    (!!value.cause &&
      value.cause !== error &&
      hasDatabaseCode(value.cause, code))
  );
}
function readReceipt(
  intent: typeof auditEvents.$inferSelect,
  restorationId: string,
) {
  const parsed = receiptSchema.safeParse(intent.metadata.receipt);
  if (
    !parsed.success ||
    intent.action !== "listing.restored" ||
    intent.entityType !== "listing" ||
    parsed.data.listingId !== intent.entityId ||
    parsed.data.restorationId !== restorationId
  ) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "The restoration record needs review. Refresh listing status before trying again.",
    });
  }
  return parsed.data;
}
async function previousReceipt(
  tx: Database | Transaction,
  id: string,
): Promise<Receipt | null> {
  const intent = await tx.query.auditEvents.findFirst({
    where: eq(auditEvents.idempotencyKey, id),
  });
  return intent ? readReceipt(intent, id) : null;
}

/** Transport acceptance is separate from the committed restoration. Replays
 * never fabricate a first-publication event or mutate the original receipt. */
export async function enqueueListingRestoration(
  database: Database,
  restorationId: string,
) {
  const intent = await database.query.auditEvents.findFirst({
    where: eq(auditEvents.idempotencyKey, restorationId),
  });
  if (!intent) return false;
  const receipt = readReceipt(intent, restorationId);
  const accepted = await database.query.auditEvents.findFirst({
    where: eq(auditEvents.idempotencyKey, acceptedKey(restorationId)),
  });
  if (accepted) return true;
  const sellerId = z.string().uuid().parse(intent.metadata.sellerId);
  const listing = await database.query.listings.findFirst({
    where: eq(listings.id, receipt.listingId),
    columns: { sellerId: true },
  });
  if (!listing || listing.sellerId !== sellerId) return false;
  await inngest.send({
    ...buildListingCreatedEvent({ listingId: receipt.listingId, sellerId }),
    id: restorationId,
  });
  await database
    .insert(auditEvents)
    .values({
      actorType: "system",
      action: "listing.restoration_event_accepted",
      entityType: "listing",
      entityId: receipt.listingId,
      idempotencyKey: acceptedKey(restorationId),
      summary: "Restored listing alert event accepted for processing.",
      metadata: { eventId: restorationId },
    })
    .onConflictDoNothing();
  return true;
}

async function tryEnqueueRestoration(
  database: Database,
  restorationId: string,
) {
  const delivery = enqueueListingRestoration(database, restorationId).then(
    (accepted) => !accepted,
    () => {
      console.error("Listing restored; alert enqueue awaits recovery", {
        restorationId,
      });
      return true;
    },
  );
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

export async function restoreArchivedListing(
  database: Database,
  adminId: string,
  input: Input,
) {
  const id = restorationKey(input);
  const committed = await previousReceipt(database, id);
  if (committed) {
    return {
      success: true as const,
      ...committed,
      replayed: true,
      alertsPending: await tryEnqueueRestoration(database, id),
    };
  }
  // Choosing a quota lock requires the seller ID. The locked listing is reread
  // below and may not silently move to another seller while we wait.
  const owner = await database.query.listings.findFirst({
    where: eq(listings.id, input.listingId),
    columns: { sellerId: true },
  });
  if (!owner)
    throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found." });
  let result: { receipt: Receipt; replayed: boolean };
  try {
    result = await database.transaction(async (tx) => {
      await lockListingQuota(tx, owner.sellerId);
      const [listing] = await tx
        .select({
          ...getTableColumns(listings),
          restorationVersion: sql<string>`to_char(${listings.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          expiryElapsed: sql<boolean>`${listings.expiresAt} is not null and ${listings.expiresAt} <= clock_timestamp()`,
        })
        .from(listings)
        .where(eq(listings.id, input.listingId))
        .for("update");
      // Check the immutable episode first: an old retry after another archive
      // returns its original receipt and must never restore the newer archive.
      const previous = await previousReceipt(tx, id);
      if (previous) return { receipt: previous, replayed: true };
      if (!listing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found.",
        });
      if (
        listing.sellerId !== owner.sellerId ||
        listing.restorationVersion !== input.restorationVersion
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This listing changed since you reviewed it. Refresh and review its current stock, price, and status before restoring.",
        });
      }
      if (listing.status !== "archived")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Only an archived listing can be restored. Refresh its current status.",
        });
      if (listing.expiryElapsed)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This listing's original expiry has passed. Restoration cannot renew it; the seller must create a current listing.",
        });
      // Checkout locks listing -> user; deauthorization can lock user -> listing.
      // NOWAIT pins eligibility without adding a reversed blocking lock order.
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, listing.sellerId))
        .for("share", { noWait: true });
      const photos = await lockUsableListingPhotos(tx, listing);
      const [unsafeAttachment] = await tx
        .select({ id: media.id })
        .from(media)
        .where(
          and(
            eq(media.listingId, listing.id),
            sql`(${media.uploaderId} is distinct from ${listing.sellerId} or ${media.buyerRequestId} is not null)`,
          ),
        )
        .limit(1);
      if (unsafeAttachment)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This listing has a photo with invalid ownership or another attachment. The seller must replace it before restoration.",
        });
      if (!photos.length)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Add at least one saved product photo before restoring this listing. Claim evidence, documents, and photos awaiting deletion do not qualify.",
        });
      const parsed = listingFormSchema.safeParse(
        Object.fromEntries(
          Object.entries(listing).map(([key, value]) => [
            key,
            value ?? undefined,
          ]),
        ),
      );
      if (!parsed.success)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Finish this listing before restoring. ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
        });
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
      if (reservation)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "An order is reserving this inventory. Resolve the order before restoring the listing.",
        });
      await assertListingCapacity(tx, listing.sellerId, 1);
      const quality = computeListingQuality({
        ...listing,
        photoCount: photos.length,
      });
      // Preserve stock confirmation, expiry, pricing schedule and all commercial
      // fields. Administrative review is not a seller availability confirmation.
      const [persisted] = await tx
        .update(listings)
        .set({
          status: "active",
          updatedAt: sql`now()`,
          qualityScore: quality.score,
          shipReady: quality.shipReady,
        })
        .where(
          and(
            eq(listings.id, listing.id),
            sql`(${listings.expiresAt} is null or ${listings.expiresAt} > clock_timestamp())`,
          ),
        )
        .returning({
          restoredAt: sql<string>`to_char(${listings.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          publishedAt: sql<string>`to_char(${listings.publishedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          expiresAt: sql<
            string | null
          >`to_char(${listings.expiresAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
          confirmationRequired: sql<boolean>`${listings.lastConfirmedAt} is null or ${listings.confirmationDueAt} is null or ${listings.confirmationDueAt} < clock_timestamp()`,
        });
      if (!persisted)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This listing's original expiry passed while restoration was being checked. It remains archived; the seller must create a current listing.",
        });
      const receipt: Receipt = {
        listingId: listing.id,
        restorationId: id,
        ...persisted,
      };
      await appendAuditEvent(tx, {
        actorType: "admin",
        actorId: adminId,
        action: "listing.restored",
        entityType: "listing",
        entityId: listing.id,
        idempotencyKey: id,
        summary:
          "Administrator restored reviewed inventory without renewing seller confirmation, expiry, or pricing schedule; alerts await enqueue acceptance.",
        metadata: {
          sellerId: listing.sellerId,
          reviewedVersion: input.restorationVersion,
          previousStatus: "archived",
          status: "active",
          receipt,
        },
      });
      await tx.insert(notifications).values({
        userId: listing.sellerId,
        type: "system",
        title: "Listing restored",
        message: receipt.confirmationRequired
          ? `Your listing "${listing.title}" was restored after review. Confirm its current availability in your listings before buyers can see it. Its original expiry and pricing schedule are unchanged.`
          : `Your listing "${listing.title}" was restored after review. Its availability confirmation, original expiry, and pricing schedule are unchanged.`,
        data: { listingId: listing.id, restorationId: id },
        read: false,
      });
      return { receipt, replayed: false };
    });
  } catch (error) {
    if (hasDatabaseCode(error, "55P03"))
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "The seller account is being updated. Refresh listing status and retry restoration after that update finishes.",
      });
    throw error;
  }
  const alertsPending = await tryEnqueueRestoration(database, id);
  return {
    success: true as const,
    ...result.receipt,
    replayed: result.replayed,
    alertsPending,
  };
}
