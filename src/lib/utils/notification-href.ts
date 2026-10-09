import type { Notification } from "@/server/db/schema/notifications";
import type { UserRole } from "@/types";

export function getNotificationHref(
  notification: Pick<Notification, "id" | "type" | "data">,
  _role?: UserRole | null,
): string | null {
  // Kept for existing callers; account role never selects a transaction side.
  void _role;
  const data = notification.data as Record<string, unknown> | null;

  // A business may be either participant, regardless of its account role.
  // Resolve even legacy notifications against their owned transaction on the server.
  if (
    data?.type === "sample_request_created" ||
    data?.type === "sample_request_updated" ||
    data?.orderId !== undefined ||
    data?.offerId !== undefined ||
    data?.conversationId !== undefined
  ) {
    return isUuid(notification.id) ? `/notifications/${notification.id}` : null;
  }

  if (notification.type === "new_offer") {
    return "/offers";
  }

  // Listing match from saved search alert
  if (notification.type === "listing_match" && data?.savedSearchId) {
    if (typeof data.searchQuery === "string")
      return `/listings?${data.searchQuery}`;
    const match = Array.isArray(data.matchingListingIds)
      ? data.matchingListingIds.find(isUuid)
      : undefined;
    if (match) return `/listings/${match}`;
    return "/settings/saved-searches";
  }

  // Listing match with slug (preference-based)
  if (notification.type === "listing_match" && typeof data?.listingSlug === "string" && data.listingSlug) {
    return `/listings/${encodeURIComponent(data.listingSlug)}`;
  }

  // Listing match with only listingId
  if (notification.type === "listing_match" && isUuid(data?.listingId)) {
    return `/listings/${data.listingId}`;
  }

  // Listing expiring — seller manages their listings
  if (notification.type === "listing_expiring") {
    return "/seller/listings";
  }

  // The destination always reads the current owner's application; never trust a supplied URL.
  if (notification.type === "system" && isUuid(data?.sellerActivationId)) {
    return "/settings/selling";
  }

  // System notification with bulk upload batchId
  if (notification.type === "system" && data?.batchId) {
    return "/seller/listings";
  }

  // Seller request board responses
  if (
    data?.type === "response_accepted" ||
    data?.type === "response_declined"
  ) {
    return "/seller/request-board";
  }

  // Buyer request responses
  if (data?.type === "request_response") {
    return "/buyer/requests";
  }

  return null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
