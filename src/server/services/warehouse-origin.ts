import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { db } from "@/server/db";
import { users, warehouses, type Warehouse } from "@/server/db/schema";
import { normalizeUsZip, requireShippingStateMatchesZip, type ShippingBookingSnapshot } from "./shipping-workflow";
type Database = typeof db;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type OriginListing = { sellerId: string; warehouseId: string | null; locationZip: string | null; locationCity: string | null; locationState: string | null };
type Seller = { id: string; name: string; email: string; phone: string | null; businessName: string | null; businessAddress: string | null; businessCity: string | null; businessState: string | null; businessZip: string | null };
export type WarehouseOrigin = { identity: string; revision: string; location: ShippingBookingSnapshot["originLocation"]; pickupStart: string; pickupEnd: string; hasLoadingDock: boolean; hasForklift: boolean; coordinateSource: "zip_centroid" | "legacy_unverified"; latitude: number | null; longitude: number | null };
const normalized = (s: string | null) => (s ?? "").trim().toUpperCase();
export function resolveWarehouseOrigin(listing: OriginListing, seller: Seller, warehouse: Warehouse | null): WarehouseOrigin {
  const fail = () => { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Choose an active pickup warehouse with complete address and contact details before checkout." }); };
  if (seller.id !== listing.sellerId) return fail();
  if (listing.warehouseId && (!warehouse || warehouse.id !== listing.warehouseId || warehouse.sellerId !== listing.sellerId || !warehouse.active)) return fail();
  const w = listing.warehouseId ? warehouse : null;
  if (!w && (!seller.businessAddress || !seller.businessCity || !seller.businessState || !seller.businessZip || !seller.phone || normalized(listing.locationCity) !== normalized(seller.businessCity) || normalized(listing.locationState) !== normalized(seller.businessState) || !listing.locationZip || normalizeUsZip(listing.locationZip) !== normalizeUsZip(seller.businessZip))) return fail();
  const postalCode = normalizeUsZip(w?.zip ?? seller.businessZip!);
  const state = w?.state ?? seller.businessState!;
  requireShippingStateMatchesZip({ shippingState: state, shippingZip: postalCode });
  const location = { address: { addressLine1: w?.address ?? seller.businessAddress!, city: w?.city ?? seller.businessCity!, state, postalCode, country: "US" }, contact: { companyName: seller.businessName || seller.name, contactName: w?.contactName ?? seller.name, phoneNumber: w?.phone ?? seller.phone!, email: seller.email } };
  if (!location.address.addressLine1.trim() || !location.contact.contactName.trim() || location.contact.phoneNumber.trim().length < 7) return fail();
  // Include seller contact changes even when the warehouse revision is stable.
  const operations = {pickupStart:w?.pickupStart ?? "08:00",pickupEnd:w?.pickupEnd ?? "17:00",hasLoadingDock:w?.hasLoadingDock ?? false,hasForklift:w?.hasForklift ?? false,coordinateSource:w ? "zip_centroid" as const : "legacy_unverified" as const,latitude:w?.latitude ?? null,longitude:w?.longitude ?? null};
  const revision = createHash("sha256").update(JSON.stringify({ revision: w?.revision ?? 0, location, operations })).digest("hex");
  return { identity: w ? `warehouse:${w.id}` : `legacy:${seller.id}`, revision, location, ...operations };
}
export async function loadWarehouseOrigin(database: Database | Transaction, listing: OriginListing): Promise<WarehouseOrigin> {
  const [seller] = await database.select().from(users).where(eq(users.id, listing.sellerId));
  if (!seller) throw new TRPCError({ code: "NOT_FOUND", message: "Seller unavailable" });
  // Under checkout's transaction this shares the warehouse lock until reservation commits.
  const [warehouse] = listing.warehouseId ? await database.select().from(warehouses).where(and(eq(warehouses.id, listing.warehouseId), eq(warehouses.sellerId, listing.sellerId))).for("share") : [];
  return resolveWarehouseOrigin(listing, seller, warehouse ?? null);
}
export function requireCurrentWarehouseOrigin(snapshot: ShippingBookingSnapshot, origin: WarehouseOrigin) {
  if (snapshot.originIdentity !== origin.identity || snapshot.originRevision !== origin.revision || JSON.stringify(snapshot.originLocation.address) !== JSON.stringify(origin.location.address) || JSON.stringify(snapshot.originLocation.contact) !== JSON.stringify(origin.location.contact)) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pickup information changed. Request fresh shipping options before paying." });
  }
}
