import type { Notification } from "@/server/db/schema/notifications";
import type { UserRole } from "@/types";

export function getNotificationHref(
  notification: Pick<Notification, "type" | "data">,
  role?: UserRole | null,
): string | null {
  const data = notification.data as Record<string, unknown> | null;

  // Offer — link to specific offer if available
  if (notification.type === "new_offer") {
    return data?.offerId ? `/offers/${data.offerId}` : "/offers";
  }

  // Listing match from saved search alert
  if (notification.type === "listing_match" && data?.savedSearchId) {
    return "/buyer/saved-searches";
  }

  // Listing match with slug (preference-based)
  if (notification.type === "listing_match" && data?.listingSlug) {
    return `/listings/${data.listingSlug}`;
  }

  // Listing match with only listingId
  if (notification.type === "listing_match" && data?.listingId) {
    return `/listings/${data.listingId}`;
  }

  // Listing expiring — seller manages their listings
  if (notification.type === "listing_expiring") {
    return "/seller/listings";
  }

  // Order-related notifications
  if (data?.orderId) {
    const base = role === "seller" ? "/seller" : "/buyer";
    return `${base}/orders/${data.orderId}`;
  }

  // System notification with bulk upload batchId
  if (notification.type === "system" && data?.batchId) {
    return "/seller/listings";
  }

  // Conversation messages
  if (data?.conversationId) {
    return `/messages?conversation=${data.conversationId}`;
  }

  // Seller request board responses
  if (data?.type === "response_accepted" || data?.type === "response_declined") {
    return "/seller/request-board";
  }

  // Buyer request responses
  if (data?.type === "request_response") {
    return "/buyer/requests";
  }

  return null;
}
