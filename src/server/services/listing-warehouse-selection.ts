import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import zipcodes from "zipcodes";
import type { ListingFormInput } from "@/lib/validators/listing";
import type { Database } from "../db";
import { users, warehouses } from "../db/schema";
import { lockSellerWarehouseMutations } from "./warehouse-mutation-lock";
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Called after publication replay resolution, inside the listing transaction. */
export async function resolveListingWarehouseSelection(
  tx: Transaction,
  sellerId: string,
  input: Pick<ListingFormInput, "warehouseId" | "warehouseRevision" | "locationCity" | "locationState" | "locationZip">,
) {
  if (!input.warehouseId) return null;

  // Bindings serialize before warehouse edits collect attached lots, so an edit
  // cannot miss the listing inserted here. Keep checkout's existing seller lock.
  await lockSellerWarehouseMutations(tx, sellerId);
  await tx.select({ id: users.id }).from(users).where(eq(users.id, sellerId)).for("update");
  const [warehouse] = await tx.select().from(warehouses).where(and(
    eq(warehouses.id, input.warehouseId), eq(warehouses.sellerId, sellerId), eq(warehouses.active, true),
  )).for("share");
  if (!warehouse) throw new TRPCError({ code: "NOT_FOUND", message: "This pickup warehouse is unavailable. Choose an active warehouse or use a manual location." });
  const sameText = (a: string | undefined, b: string) => a?.trim().toLowerCase() === b.trim().toLowerCase();
  if (warehouse.revision !== input.warehouseRevision ||
      !sameText(input.locationCity, warehouse.city) || !sameText(input.locationState, warehouse.state) ||
      input.locationZip?.trim() !== warehouse.zip) {
    throw new TRPCError({ code: "CONFLICT", message: "Pickup warehouse details changed. Review the current details before publishing." });
  }
  const coordinates = zipcodes.lookup(warehouse.zip);
  return {
    warehouseId: warehouse.id,
    locationCity: warehouse.city, locationState: warehouse.state, locationZip: warehouse.zip,
    locationLat: coordinates?.latitude ?? null, locationLng: coordinates?.longitude ?? null,
  };
}
