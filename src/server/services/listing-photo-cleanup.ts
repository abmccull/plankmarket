import { sql } from "drizzle-orm";
import { db, type Database } from "@/server/db";
import { lockListingFormDrafts } from "./listing-form-drafts";
import { privateListingPhotoStorage } from "./listing-photo-storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Upload = { id: string; ownerId: string; draftId: string; readyMediaId: string | null; incomingPath: string; frozenPath: string; intent: string | null; deletedAt: string | null };
export interface ListingPhotoCleanupResult { selected: number; claimed: number; confirmed: number; failed: number; stale: number; budgetExhausted: boolean; hasMore: boolean }
const emptyResult = (): ListingPhotoCleanupResult => ({ selected: 0, claimed: 0, confirmed: 0, failed: 0, stale: 0, budgetExhausted: false, hasMore: false });
function budget(options: { budgetMs?: number; deadlineAt?: number } = {}) {
  const start = Date.now(), duration = Math.min(options.budgetMs ?? 25_000, 25_000, (options.deadlineAt ?? start + 25_000) - start);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Private photo cleanup time budget exhausted");
  const deadlineAt = start + duration, timeout = new Error("Private photo cleanup time budget exhausted");
  let expired = false, timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => { expired = true; reject(timeout); }, duration); timer.unref?.(); });
  void deadline.catch(() => {});
  const check = () => { if (expired || Date.now() >= deadlineAt) throw timeout; };
  return { deadlineAt, timeout, check, expired: () => expired || Date.now() >= deadlineAt,
    close: () => clearTimeout(timer!),
    async run<T>(operation: () => PromiseLike<T>): Promise<T> {
      check(); const result = await Promise.race([Promise.resolve().then(() => { check(); return operation(); }), deadline]); check(); return result;
    },
  };
}
// Alias u is always listing_photo_uploads. Compare UUID identity, not JSON spelling.
const retained = sql`(
  exists(select 1 from public.media m where m.id=u.ready_media_id and (m.listing_id is not null or m.buyer_request_id is not null))
  or exists(select 1 from public.dispute_evidence e where e.media_id=u.ready_media_id)
  or exists(select 1 from public.listing_form_drafts d where d.id=u.draft_id and d.state in ('editing','published')
    and exists(select 1 from jsonb_array_elements_text(d.snapshot->'uploadedMediaIds') selected(value) where lower(selected.value)=u.ready_media_id::text))
)`;
const uploadColumns = sql`u.id,u.owner_id as "ownerId",u.draft_id as "draftId",u.ready_media_id as "readyMediaId",
  u.incoming_path as "incomingPath",u.frozen_path as "frozenPath",u.deletion_requested_at::text as intent,u.deleted_at::text as "deletedAt"`;

/** Full Database only: durable intent MUST commit before any provider operation. */
export async function deletePrivateListingPhoto(params: {
  database?: Database; uploadId: string; ownerId?: string; deadlineAt?: number;
}): Promise<"deleted" | "retained" | "not_found"> {
  if (!UUID.test(params.uploadId) || (params.ownerId && !UUID.test(params.ownerId))) return "not_found";
  const database = params.database ?? db, time = budget({ deadlineAt: params.deadlineAt });
  try {
    const [identity] = await time.run(() => database.execute<Upload>(sql`select ${uploadColumns} from public.listing_photo_uploads u
      where u.id=${params.uploadId}::uuid ${params.ownerId ? sql`and u.owner_id=${params.ownerId}::uuid` : sql``}`));
    if (!identity) return "not_found";
    if (identity.deletedAt) return "deleted";
    const admission = await time.run(() => database.transaction(async tx => {
      await time.run(() => lockListingFormDrafts(tx, identity.ownerId));
      await time.run(() => tx.execute(sql`select id from public.listing_form_drafts where id=${identity.draftId}::uuid and seller_id=${identity.ownerId}::uuid for update`));
      // Re-read under the draft lock before selecting the media lock. Never ledger -> media.
      const [current] = await time.run(() => tx.execute<Upload>(sql`select ${uploadColumns} from public.listing_photo_uploads u where u.id=${identity.id}::uuid`));
      if (!current) return { outcome: "not_found" as const };
      if (current.readyMediaId) await time.run(() => tx.execute(sql`select id from public.media where id=${current.readyMediaId}::uuid for update`));
      const [locked] = await time.run(() => tx.execute<Upload>(sql`select ${uploadColumns} from public.listing_photo_uploads u where u.id=${identity.id}::uuid for update`));
      if (!locked) return { outcome: "not_found" as const };
      if (locked.deletedAt) return { outcome: "deleted" as const };
      const [reference] = await time.run(() => tx.execute<{ retained: boolean }>(sql`select ${retained} as retained from public.listing_photo_uploads u where u.id=${locked.id}::uuid`));
      if (reference?.retained !== false) return { outcome: "retained" as const };
      const [claim] = await time.run(() => tx.execute<Upload>(sql`update public.listing_photo_uploads u set deletion_requested_at=coalesce(u.deletion_requested_at,clock_timestamp())
        where u.id=${locked.id}::uuid and u.deleted_at is null returning ${uploadColumns}`));
      if (!claim?.intent) throw new Error("Private photo deletion claim unavailable");
      if (claim.readyMediaId) await time.run(() => tx.execute(sql`update public.media set deletion_claim_token=${claim.id},deletion_claimed_at=${claim.intent}::timestamptz where id=${claim.readyMediaId}::uuid`));
      time.check(); return { outcome: "claimed" as const, claim };
    }));
    if (admission.outcome !== "claimed") return admission.outcome;
    const { claim } = admission;
    const storage = await time.run(() => privateListingPhotoStorage({ deadlineAt: time.deadlineAt, database }));
    const response = await time.run(() => storage.remove([claim.incomingPath, claim.frozenPath]));
    if (response.error) throw new Error("Private photo deletion is awaiting provider confirmation", { cause: response.error });
    const saved = await time.run(() => database.execute<{ id: string }>(sql`update public.listing_photo_uploads set deleted_at=clock_timestamp()
      where id=${claim.id}::uuid and deletion_requested_at=${claim.intent}::timestamptz and deleted_at is null returning id`));
    if (!saved.length) {
      const [reconciled] = await time.run(() => database.execute<{ deleted: boolean }>(sql`select deleted_at is not null as deleted from public.listing_photo_uploads where id=${claim.id}::uuid`));
      if (!reconciled?.deleted) throw new Error("Private photo deletion receipt unavailable");
    }
    return "deleted";
  } finally { time.close(); }
}

const abandoned = sql`u.deleted_at is null and (u.deletion_requested_at is not null or u.created_at<=clock_timestamp()-interval '7 days') and not ${retained}`;
export async function purgeAbandonedListingPhotos(database: Database = db, options: { budgetMs?: number } = {}): Promise<ListingPhotoCleanupResult> {
  const time = budget(options), result = emptyResult();
  try {
    const rows = await time.run(() => database.execute<{ id: string }>(sql`select u.id from public.listing_photo_uploads u where ${abandoned} order by u.created_at,u.id limit 50`));
    result.selected = rows.length;
    for (const row of rows) {
      try {
        result.claimed++;
        const outcome = await time.run(() => deletePrivateListingPhoto({ database, uploadId: row.id, deadlineAt: time.deadlineAt }));
        if (outcome === "deleted") result.confirmed++; else result.stale++;
      } catch { result.failed++; if (time.expired()) throw time.timeout; }
    }
    const remaining = await time.run(() => database.execute<{ id: string }>(sql`select u.id from public.listing_photo_uploads u where ${abandoned} limit 1`));
    result.hasMore = remaining.length > 0;
  } catch (error) { if (error !== time.timeout) throw error; result.budgetExhausted = true; result.hasMore = true; }
  finally { time.close(); }
  return result;
}
const residueDue = sql`deleted_at is not null and (
  residue_last_attempt_at is null
  or (residue_last_success_at>=residue_last_attempt_at and residue_last_success_at<=clock_timestamp()-interval '23 hours')
  or ((residue_last_success_at is null or residue_last_success_at<residue_last_attempt_at) and residue_last_attempt_at<=clock_timestamp()-interval '15 minutes')
)`;
export async function purgeDeletedListingPhotoResidue(database: Database = db, options: { budgetMs?: number } = {}): Promise<ListingPhotoCleanupResult> {
  const time = budget(options), result = emptyResult();
  try {
    const rows = await time.run(() => database.execute<{ id: string }>(sql`select id from public.listing_photo_uploads where ${residueDue} order by residue_last_attempt_at asc nulls first,deleted_at,id limit 50`));
    result.selected = rows.length;
    for (const row of rows) {
      try {
        const [claim] = await time.run(() => database.execute<{ id: string; incoming: string; frozen: string; attempt: string }>(sql`
          update public.listing_photo_uploads set residue_last_attempt_at=clock_timestamp() where id=${row.id}::uuid and ${residueDue}
          returning id,incoming_path as incoming,frozen_path as frozen,residue_last_attempt_at::text as attempt`));
        if (!claim) continue;
        result.claimed++;
        const storage = await time.run(() => privateListingPhotoStorage({ deadlineAt: time.deadlineAt, database }));
        const response = await time.run(() => storage.remove([claim.incoming, claim.frozen]));
        if (response.error) { result.failed++; continue; }
        // Preserve exact microsecond claim; SQL guard requires that same receipt value.
        const saved = await time.run(() => database.execute<{ id: string }>(sql`update public.listing_photo_uploads set residue_last_success_at=${claim.attempt}::timestamptz
          where id=${claim.id}::uuid and deleted_at is not null and residue_last_attempt_at=${claim.attempt}::timestamptz returning id`));
        if (saved.length === 1) result.confirmed++; else result.stale++;
      } catch { result.failed++; if (time.expired()) throw time.timeout; }
    }
    const remaining = await time.run(() => database.execute<{ id: string }>(sql`select id from public.listing_photo_uploads where ${residueDue} limit 1`));
    result.hasMore = remaining.length > 0;
  } catch (error) { if (error !== time.timeout) throw error; result.budgetExhausted = true; result.hasMore = true; }
  finally { time.close(); }
  return result;
}
