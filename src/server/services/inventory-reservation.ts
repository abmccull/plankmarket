import type { Database } from "@/server/db";
import { and, eq } from "drizzle-orm";
import { listings, orders } from "@/server/db/schema";

type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

interface ReleaseReservedInventoryInput {
  db: DbExecutor;
  orderId: string;
  reason: string;
}

interface ReleaseReservedInventoryResult {
  released: boolean;
  reason: string;
}

function roundQuantity(value: number): number {
  return Math.round(value * 10000) / 10000;
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

    const restoredTotalSqFt = roundQuantity(
      Number(row.listingTotalSqFt) + Number(row.quantitySqFt),
    );
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
