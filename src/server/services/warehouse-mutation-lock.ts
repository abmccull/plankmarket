import { sql } from "drizzle-orm";
import type { Database } from "../db";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Serialize warehouse bindings before collecting and locking attached listings. */
export async function lockSellerWarehouseMutations(tx: Transaction, sellerId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`warehouse-mutations:${sellerId}`}, 0))`);
}
