import { sql } from "drizzle-orm";
import { listings } from "@/server/db/schema/listings";

/**
 * Database counterpart to getDirectPurchaseUnitPrice().
 *
 * `buyNowPrice` is a per-square-foot direct-purchase price. When it is absent,
 * direct checkout falls back to the seller's ask price. Catalog filters,
 * ordering, saved-search matching, and any aggregate labeled "direct purchase"
 * must use this expression so they cannot silently disagree with checkout.
 */
export function getDirectPurchaseUnitPriceSql() {
  return sql<number>`coalesce(
    ${listings.buyNowPrice},
    ${listings.askPricePerSqFt}
  )`;
}

export function getDirectPurchaseLotValueSql() {
  return sql<number>`(
    ${getDirectPurchaseUnitPriceSql()} * ${listings.totalSqFt}
  )`;
}
