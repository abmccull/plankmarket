/** Browser-safe contract; private storage paths are never public media references. */
export const LISTING_PHOTO_BUCKET = "listing-photos";
export const MAX_LISTING_PHOTO_BYTES = 4 * 1024 * 1024;
export const LISTING_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const LISTING_PHOTO_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_LISTING_PHOTO_PREPARATIONS_PER_DAY = 200;
export const MAX_OUTSTANDING_LISTING_PHOTO_UPLOADS = 40;
export function listingPhotoHref(mediaId: string) {
  return `/api/listing-photos/${mediaId.toLowerCase()}`;
}
export function isPrivateListingPhotoHref(value: unknown): value is string {
  return typeof value === "string" && /^\/api\/listing-photos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
