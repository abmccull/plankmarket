export interface ProviderConfirmedPickupEventData {
  orderId: string;
  pickedUpAt: string;
  pickupConfirmed: true;
  source: "priority1";
}

interface PersistedTrackingEventLike {
  timestamp?: unknown;
  status?: unknown;
}

const PICKUP_EVIDENCE_STATUSES = new Set([
  "in_transit",
  "out_for_delivery",
  "delivered",
]);

export function isProviderConfirmedPickup(
  data: Partial<ProviderConfirmedPickupEventData>,
): data is ProviderConfirmedPickupEventData {
  return (
    typeof data.orderId === "string" &&
    typeof data.pickedUpAt === "string" &&
    data.pickupConfirmed === true &&
    data.source === "priority1" &&
    !Number.isNaN(new Date(data.pickedUpAt).getTime())
  );
}

export function hasPersistedPickupTrackingEvent(
  trackingEvents: unknown,
): boolean {
  if (!Array.isArray(trackingEvents)) return false;

  return trackingEvents.some((event): boolean => {
    if (!event || typeof event !== "object") return false;

    const candidate = event as PersistedTrackingEventLike;
    return (
      typeof candidate.timestamp === "string" &&
      !Number.isNaN(new Date(candidate.timestamp).getTime()) &&
      typeof candidate.status === "string" &&
      PICKUP_EVIDENCE_STATUSES.has(candidate.status)
    );
  });
}

export function hasPersistedProviderPickupEvidence(params: {
  selectedQuoteId: string | null;
  shipmentQuoteId: string | null;
  priority1ShipmentId: string | null;
  shipmentStatus: string;
  shipmentIsDryRun: boolean;
  shipmentTrackingEvents: unknown;
  /** Order-level shippedAt set after provider-confirmed pickup emission. */
  orderShippedAt?: Date | string | null;
}): boolean {
  if (
    !params.selectedQuoteId ||
    params.shipmentQuoteId !== params.selectedQuoteId ||
    !params.priority1ShipmentId ||
    params.shipmentIsDryRun ||
    !["in_transit", "out_for_delivery", "delivered"].includes(
      params.shipmentStatus,
    )
  ) {
    return false;
  }

  // Prefer explicit tracking-event evidence; also accept order.shippedAt set
  // when Priority1 confirmed pickup via actualPickupDate without statuses.
  if (hasPersistedPickupTrackingEvent(params.shipmentTrackingEvents)) {
    return true;
  }
  if (params.orderShippedAt == null) return false;
  const shippedAtMs =
    params.orderShippedAt instanceof Date
      ? params.orderShippedAt.getTime()
      : new Date(params.orderShippedAt).getTime();
  return Number.isFinite(shippedAtMs);
}
