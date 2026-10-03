import { sql } from "drizzle-orm";
import { db, type Database } from "@/server/db";
import { privateVerificationStorage, verificationDocumentObjectPaths } from "./verification-documents";

export interface VerificationResidueResult {
  selected: number;
  claimed: number;
  confirmed: number;
  failed: number;
  stale: number;
  budgetExhausted: boolean;
  hasMore: boolean;
}

// A confirmed delete cannot cancel an upload already admitted by the provider.
// Keep recovery keys indefinitely and periodically remove any late bytes.
const dueResidue = sql`deleted_at is not null and (
  residue_last_attempt_at is null
  or (residue_last_success_at >= residue_last_attempt_at and residue_last_success_at <= clock_timestamp() - interval '23 hours')
  or ((residue_last_success_at is null or residue_last_success_at < residue_last_attempt_at) and residue_last_attempt_at <= clock_timestamp() - interval '15 minutes')
)`;

/** Full Database only: claims must commit before storage I/O, outside a transaction. */
export async function purgeDeletedVerificationResidue(
  database: Database = db,
  options: { budgetMs?: number } = {},
): Promise<VerificationResidueResult> {
  const budgetMs = Math.min(options.budgetMs ?? 25_000, 25_000);
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new Error("Invalid private cleanup time budget");
  const deadlineAt = Date.now() + budgetMs;
  const timeout = new Error("Private residual cleanup time budget exhausted");
  let expired = false;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { expired = true; reject(timeout); }, budgetMs);
    timer.unref?.();
  });
  void deadline.catch(() => {});
  const assertTime = () => { if (expired || Date.now() >= deadlineAt) throw timeout; };
  async function within<T>(operation: () => PromiseLike<T>): Promise<T> {
    assertTime();
    const value = await Promise.race([
      Promise.resolve().then(() => { assertTime(); return operation(); }),
      deadline,
    ]);
    assertTime();
    return value;
  }
  const result: VerificationResidueResult = {
    selected: 0, claimed: 0, confirmed: 0, failed: 0, stale: 0, budgetExhausted: false, hasMore: false,
  };
  try {
    const candidates = await within(() => database.execute<{ id: string }>(sql`
      select id from public.verification_documents where ${dueResidue}
      order by residue_last_attempt_at asc nulls first, deleted_at, id limit 50`));
    result.selected = candidates.length;
    for (const candidate of candidates) {
      try {
        // The predicate is rechecked under the UPDATE row lock. Other workers
        // cannot claim this attempt until the failure/success cadence is due.
        const [claim] = await within(() => database.execute<{
          id: string; userId: string; objectPath: string; purpose: string; attempt: string;
        }>(sql`update public.verification_documents set residue_last_attempt_at=clock_timestamp()
          where id=${candidate.id}::uuid and ${dueResidue}
          returning id,user_id as "userId",object_path as "objectPath",purpose,residue_last_attempt_at::text as attempt`));
        if (!claim) continue;
        result.claimed++;
        const storage = await within(() => privateVerificationStorage({ deadlineAt }));
        const response = await within(() => storage.remove(verificationDocumentObjectPaths(claim)));
        if (response.error) { result.failed++; continue; }
        // Preserve PostgreSQL microseconds: never parse the fencing token into Date.
        const saved = await within(() => database.execute<{ id: string }>(sql`
          update public.verification_documents set residue_last_success_at=clock_timestamp()
          where id=${claim.id}::uuid and deleted_at is not null
            and residue_last_attempt_at=${claim.attempt}::timestamptz returning id`));
        if (saved.length === 1) result.confirmed++;
        else result.stale++;
      } catch (error) {
        result.failed++;
        if (error === timeout || expired || Date.now() >= deadlineAt) throw timeout;
        // The durable attempt moves this row behind unattempted candidates.
      }
    }
    const remaining = await within(() => database.execute<{ id: string }>(sql`
      select id from public.verification_documents where ${dueResidue} limit 1`));
    result.hasMore = remaining.length > 0;
  } catch (error) {
    if (error !== timeout) throw error;
    result.budgetExhausted = true;
    result.hasMore = true;
    // An already-issued SQL/provider request may still finish. No continuation
    // issues another request after this function returns.
  } finally {
    clearTimeout(timer!);
  }
  return result;
}
