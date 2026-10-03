import { createHash } from "node:crypto";
import { and, eq, desc } from "drizzle-orm";
import type { Database } from "@/server/db";
import { resaleRules, resaleCertificates, users } from "@/server/db/schema";
import { resolveResaleDecision, type PurchasePurpose } from "@/lib/resale-exemption";
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export function buyerIdentityFingerprint(buyer: { businessName: string | null; businessAddress: string | null; businessCity: string | null; businessState: string | null; businessZip: string | null }) {
  return createHash("sha256").update(JSON.stringify([buyer.businessName, buyer.businessAddress, buyer.businessCity, buyer.businessState, buyer.businessZip].map(v => (v ?? "").trim().toUpperCase().replace(/\s+/g, " ")))).digest("hex");
}
/** Shared locks hold the exact identity, rule and certificate through order commit.
 * Reviews use the same identity -> rule -> certificate order to avoid deadlocks. */
export async function resolveCheckoutResale(tx: Transaction, input: { buyerId: string; state: string; purpose: PurchasePurpose }) {
  const [buyer] = await tx.select().from(users).where(eq(users.id, input.buyerId)).for("share");
  const [rule] = await tx.select().from(resaleRules).where(eq(resaleRules.state, input.state)).for("share");
  const certificates = input.purpose === "resale" ? await tx.select().from(resaleCertificates).where(and(eq(resaleCertificates.buyerId, input.buyerId), eq(resaleCertificates.state, input.state))).orderBy(desc(resaleCertificates.createdAt)).for("share") : [];
  return resolveResaleDecision({ ...input, buyerIdentityFingerprint: buyerIdentityFingerprint(buyer), rule, certificates });
}
