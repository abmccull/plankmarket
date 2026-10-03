import { eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db";
import { listings, users } from "@/server/db/schema";
import { isListingVisibleToBuyers } from "@/lib/listing-freshness";
import { isListingTerritoryVisibleToViewer } from "@/server/security/listing-visibility";

export type ListingPhotoActor = { id: string; assuranceLevel: "aal1" | "aal2" | null };
export type AuthorizedListingPhoto = {
  mediaId: string; ownerId: string; fileName: string; mimeType: "image/jpeg" | "image/png" | "image/webp";
  fileSize: number; frozenPath: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Server-only metadata decision. Never pass its frozenPath to a public DTO. */
export async function authorizeListingPhotoRead(
  database: Database, mediaId: string, actor: ListingPhotoActor | null,
): Promise<AuthorizedListingPhoto | null> {
  if (!UUID.test(mediaId) || (actor && !UUID.test(actor.id))) return null;
  const current = actor ? await database.query.users.findFirst({ where: eq(users.id, actor.id) }) : null;
  if (actor && !current?.active) return null;
  const [row] = await database.execute<AuthorizedListingPhoto & { listingId: string | null; originalListingId: string | null; isEvidence: boolean }>(sql`
    select m.id as "mediaId",u.owner_id as "ownerId",u.file_name as "fileName",u.mime_type as "mimeType",
      u.file_size as "fileSize",u.frozen_path as "frozenPath",m.listing_id as "listingId",
      exists(select 1 from public.dispute_evidence where media_id=m.id) as "isEvidence",
      case when d.state='published' and exists (
        select 1 from jsonb_array_elements_text(d.snapshot->'uploadedMediaIds') selected(value)
        where lower(selected.value)=m.id::text
      ) then d.published_listing_id else null end as "originalListingId"
    from public.media m join public.listing_photo_uploads u on u.id=m.listing_photo_upload_id and u.ready_media_id=m.id
    join public.listing_form_drafts d on d.id=u.draft_id and d.seller_id=u.owner_id and d.generation=u.draft_generation
    where m.id=${mediaId}::uuid and m.storage_provider='supabase_listing' and m.uploader_id=u.owner_id
      and m.deletion_claim_token is null and u.ready_at is not null and u.deletion_requested_at is null and u.deleted_at is null`);
  if (!row) return null;
  const metadata: AuthorizedListingPhoto = {
    mediaId: row.mediaId, ownerId: row.ownerId, fileName: row.fileName,
    mimeType: row.mimeType, fileSize: row.fileSize, frozenPath: row.frozenPath,
  };
  const assuredAdmin = current?.role === "admin" && actor?.assuranceLevel === "aal2";
  // Even an admin who owns the media needs assurance for a private path.
  if (assuredAdmin || (current?.role !== "admin" && current?.id === row.ownerId)) return metadata;
  // Evidence stays private even when the same media is attached to a public lot.
  // A conversation alone does not establish participation in the disputed order.
  if (row.isEvidence) {
    if (!current || current.role === "admin") return null;
    const [participant] = await database.execute<{ allowed: boolean }>(sql`select exists(
      select 1 from public.dispute_evidence e
      join public.disputes d on d.id=e.dispute_id
      join public.orders o on o.id=d.order_id
      where e.media_id=${mediaId}::uuid and (o.buyer_id=${current.id}::uuid or o.seller_id=${current.id}::uuid)
    ) as allowed`);
    return participant?.allowed === true ? metadata : null;
  }
  // An unassured admin gets ordinary anonymous public scope, never helper's admin override.
  const publicViewer = current?.role === "admin" ? null : current;
  if (row.listingId) {
    const listing = await database.query.listings.findFirst({ where: eq(listings.id, row.listingId) });
    if (listing && isListingVisibleToBuyers(listing) && isListingTerritoryVisibleToViewer(listing, publicViewer)) return metadata;
  }
  if (!current || current.role === "admin" || !row.originalListingId) return null;
  const [participant] = await database.execute<{ allowed: boolean }>(sql`select (
    exists(select 1 from public.orders where listing_id=${row.originalListingId}::uuid and (buyer_id=${current.id}::uuid or seller_id=${current.id}::uuid))
    or exists(select 1 from public.conversations where listing_id=${row.originalListingId}::uuid and (buyer_id=${current.id}::uuid or seller_id=${current.id}::uuid))
  ) as allowed`);
  return participant?.allowed === true ? metadata : null;
}
