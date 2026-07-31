import type { Database } from "@/server/db";
import { and, eq } from "drizzle-orm";
import { listings, orders } from "@/server/db/schema";

type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
type ListingInventoryStatus = "active" | "sold";

const INVENTORY_QUANTITY_SCALE = 10_000;
const INVENTORY_QUANTITY_TOLERANCE = 1 / INVENTORY_QUANTITY_SCALE;

interface ReleaseReservedInventoryInput {
  db: DbExecutor;
  orderId: string;
  reason: string;
}

interface ReleaseReservedInventoryResult {
  released: boolean;
  reason: string;
}

interface ReserveListingInventoryInput {
  db: DbExecutor;
  listingId: string;
  availableQuantity: number;
  reservedQuantity: number;
  reservedAt?: Date;
}

export interface ListingInventoryReservation {
  remainingQuantity: number;
  status: ListingInventoryStatus;
}

function roundQuantity(value: number): number {
  return Math.round(value * INVENTORY_QUANTITY_SCALE) / INVENTORY_QUANTITY_SCALE;
}

function assertValidQuantity(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite, non-negative number`);
  }
}

/**
 * Calculates the available inventory persisted on a listing after checkout.
 * A full-lot reservation must persist zero availability. Keeping the original
 * quantity on a sold listing causes a later cancellation to add the same
 * inventory a second time.
 */
export function calculateInventoryAfterReservation(params: {
  availableQuantity: number;
  reservedQuantity: number;
}): ListingInventoryReservation {
  assertValidQuantity(params.availableQuantity, "Available quantity");
  assertValidQuantity(params.reservedQuantity, "Reserved quantity");

  if (params.reservedQuantity <= 0) {
    throw new Error("Reserved quantity must be greater than zero");
  }

  if (
    params.reservedQuantity >
    params.availableQuantity + INVENTORY_QUANTITY_TOLERANCE
  ) {
    throw new Error("Reserved quantity exceeds available inventory");
  }

  const roundedRemainingQuantity = Math.max(
    0,
    roundQuantity(params.availableQuantity - params.reservedQuantity),
  );
  const isSold =
    roundedRemainingQuantity <= INVENTORY_QUANTITY_TOLERANCE;
  const remainingQuantity = isSold ? 0 : roundedRemainingQuantity;

  return {
    remainingQuantity,
    status: isSold ? "sold" : "active",
  };
}

export function calculateInventoryAfterRelease(params: {
  availableQuantity: number;
  reservedQuantity: number;
  listingStatus: string;
}): number {
  assertValidQuantity(params.availableQuantity, "Available quantity");
  assertValidQuantity(params.reservedQuantity, "Reserved quantity");

  // Orders created before full-lot reservations began persisting zero left the
  // original quantity on a sold listing. In that legacy state the inventory is
  // already present and must only be reopened, not added again.
  if (
    params.listingStatus === "sold" &&
    params.availableQuantity > INVENTORY_QUANTITY_TOLERANCE
  ) {
    return roundQuantity(params.availableQuantity);
  }

  return roundQuantity(params.availableQuantity + params.reservedQuantity);
}

export async function reserveListingInventory({
  db,
  listingId,
  availableQuantity,
  reservedQuantity,
  reservedAt = new Date(),
}: ReserveListingInventoryInput): Promise<ListingInventoryReservation> {
  const nextInventory = calculateInventoryAfterReservation({
    availableQuantity,
    reservedQuantity,
  });

  const [updated] = await db
    .update(listings)
    .set({
      totalSqFt: nextInventory.remainingQuantity,
      status: nextInventory.status,
      soldAt: nextInventory.status === "sold" ? reservedAt : null,
      updatedAt: reservedAt,
    })
    .where(
      and(
        eq(listings.id, listingId),
        eq(listings.status, "active"),
        eq(listings.totalSqFt, availableQuantity),
      ),
    )
    .returning({ id: listings.id });

  if (!updated) {
    throw new Error(
      "Listing inventory changed while the checkout reservation was being created",
    );
  }

  return nextInventory;
}

export async function releaseReservedInventory({
  db,
  orderId,
  reason,
}: ReleaseReservedInventoryInput): Promise<ReleaseReservedInventoryResult> {
  const execute = async (tx: DbExecutor) => {
    const [row] = await tx
      .select({
        orderId: orders.id,
        listingId: orders.listingId,
        quantitySqFt: orders.quantitySqFt,
        orderStatus: orders.status,
        orderNotes: orders.notes,
        inventoryReleasedAt: orders.inventoryReleasedAt,
        listingTotalSqFt: listings.totalSqFt,
        listingStatus: listings.status,
      })
      .from(orders)
      .innerJoin(
        listings,
        and(eq(listings.id, orders.listingId), eq(orders.id, orderId)),
      )
      .for("update");

    if (!row) {
      return { released: false, reason: "order_not_found" };
    }

    if (row.inventoryReleasedAt) {
      return { released: false, reason: "already_released" };
    }

    if (row.orderStatus === "delivered") {
      return { released: false, reason: "order_already_delivered" };
    }

    if (row.orderStatus !== "cancelled" && row.orderStatus !== "refunded") {
      return { released: false, reason: "order_not_releasable" };
    }

    const restoredTotalSqFt = calculateInventoryAfterRelease({
      availableQuantity: Number(row.listingTotalSqFt),
      reservedQuantity: Number(row.quantitySqFt),
      listingStatus: row.listingStatus,
    });
    const shouldReopenListing =
      row.listingStatus === "sold" && restoredTotalSqFt > 0;

    await tx
      .update(listings)
      .set({
        totalSqFt: restoredTotalSqFt,
        status: shouldReopenListing ? "active" : row.listingStatus,
        soldAt: shouldReopenListing ? null : undefined,
        updatedAt: new Date(),
      })
      .where(eq(listings.id, row.listingId));

    const releaseNote = `[Inventory released: ${reason}]`;
    await tx
      .update(orders)
      .set({
        inventoryReleasedAt: new Date(),
        updatedAt: new Date(),
        notes: row.orderNotes
          ? `${row.orderNotes}\n${releaseNote}`
          : releaseNote,
      })
      .where(eq(orders.id, row.orderId));

    return { released: true, reason: "released" };
  };

  if ("transaction" in db && typeof db.transaction === "function") {
    return db.transaction((tx) => execute(tx));
  }

  return execute(db);
}
