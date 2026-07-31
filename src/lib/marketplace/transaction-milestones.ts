export type MilestoneState =
  | "complete"
  | "current"
  | "upcoming"
  | "attention"
  | "stopped";

export type TransactionAudience = "buyer" | "seller";

type DateValue = Date | string | null;

export interface TransactionOrderState {
  status: string;
  paymentStatus: string | null;
  sellerTransferStatus:
    | "awaiting_payment"
    | "scheduled_after_pickup"
    | "transferred"
    | "refunded";
  selectedQuoteId: string | null;
  trackingNumber: string | null;
  confirmedAt: DateValue;
  shippedAt: DateValue;
  deliveredAt: DateValue;
  cancelledAt: DateValue;
  refundedAt: DateValue;
  shipment: {
    status: string;
    dispatchedAt: DateValue;
    pickupDate: DateValue;
    deliveredAt: DateValue;
  } | null;
  dispute: {
    status: string;
    createdAt: DateValue;
    updatedAt: DateValue;
  } | null;
}

export interface TransactionMilestone {
  id: "payment" | "freight" | "pickup" | "transfer" | "delivery";
  title: string;
  description: string;
  state: MilestoneState;
  date: DateValue;
}

const CAPTURED_PAYMENT_STATUSES = new Set([
  "succeeded",
  "partially_refunded",
  "refunded",
]);

const PICKED_UP_SHIPMENT_STATUSES = new Set([
  "in_transit",
  "out_for_delivery",
  "delivered",
]);

const CLOSED_DISPUTE_STATUSES = new Set([
  "resolved_buyer",
  "resolved_seller",
  "closed",
]);

export function getTransactionMilestones(
  order: TransactionOrderState,
  audience: TransactionAudience,
): TransactionMilestone[] {
  const paymentCaptured = CAPTURED_PAYMENT_STATUSES.has(
    order.paymentStatus ?? "",
  );
  const refunded =
    order.status === "refunded" ||
    order.paymentStatus === "refunded" ||
    Boolean(order.refundedAt);
  const partiallyRefunded = order.paymentStatus === "partially_refunded";
  const cancelledBeforePayment =
    order.status === "cancelled" && !paymentCaptured;
  const shipmentException = order.shipment?.status === "exception";
  const freightBooked = Boolean(
    order.shipment?.dispatchedAt ||
      (order.shipment && order.shipment.status !== "pending"),
  );
  const manualFreightRecorded = Boolean(
    !order.selectedQuoteId && (order.trackingNumber || order.shippedAt),
  );
  const bookingComplete = freightBooked || manualFreightRecorded;
  const pickupConfirmed = Boolean(
    order.shippedAt ||
      (order.shipment &&
        PICKED_UP_SHIPMENT_STATUSES.has(order.shipment.status)),
  );
  const transferComplete = order.sellerTransferStatus === "transferred";
  const delivered = Boolean(
    order.deliveredAt ||
      order.shipment?.deliveredAt ||
      order.shipment?.status === "delivered",
  );
  const hasOpenDispute = Boolean(
    order.dispute && !CLOSED_DISPUTE_STATUSES.has(order.dispute.status),
  );
  const hasClosedDispute = Boolean(
    order.dispute && CLOSED_DISPUTE_STATUSES.has(order.dispute.status),
  );

  const paymentDescription = refunded
    ? "Stripe records the platform charge as refunded."
    : partiallyRefunded
      ? "Stripe records a partial refund against the platform charge."
    : paymentCaptured
      ? audience === "buyer"
        ? "Stripe processed your platform charge."
        : "Stripe processed the buyer's platform charge."
      : "Waiting for Stripe to confirm the platform charge.";

  const freightDescription = order.selectedQuoteId
    ? bookingComplete
      ? "The selected freight quote has been booked with the carrier."
      : "The selected quote is booked only after payment and quote checks pass."
    : bookingComplete
      ? "Manually coordinated carrier details have been recorded on the order."
      : "This order uses manually coordinated freight; carrier details appear when recorded.";

  const pickupDescription = pickupConfirmed
    ? order.selectedQuoteId
      ? "The tracked carrier workflow records pickup or in-transit evidence."
      : "The order is recorded as shipped in the manual freight workflow."
    : order.selectedQuoteId
      ? "Provider-tracked pickup is required before the seller transfer workflow can begin."
      : "The seller records shipment when manually coordinated freight is picked up.";

  const transferDescription = transferComplete
    ? audience === "seller"
      ? "PlankMarket recorded the separate Stripe Connect transfer to your account."
      : "PlankMarket recorded the separate Stripe Connect transfer to the seller."
    : refunded
      ? "No new seller transfer is scheduled for a refunded payment."
      : hasOpenDispute
        ? "The separate seller transfer is paused while the reported issue is under review."
      : pickupConfirmed
        ? "After the configured post-pickup delay, PlankMarket rechecks refund and dispute state before initiating a separate Stripe Connect transfer."
        : "The separate seller transfer is scheduled only after recorded pickup and the configured delay.";

  const deliveryDescription = hasOpenDispute
    ? "A transaction issue has been reported through PlankMarket and is under review."
    : hasClosedDispute
      ? "A reported transaction issue has a recorded resolution."
      : delivered
        ? "Delivery is recorded. Report damage or shortages through PlankMarket with supporting evidence under the reporting terms."
        : shipmentException
          ? "The carrier reports a shipment exception. Follow tracking updates and use the order record to report a transaction issue."
        : "Track delivery, inspect the freight before signing, and report damage or shortages through PlankMarket.";

  return [
    {
      id: "payment",
      title: refunded
        ? "Payment refunded"
        : partiallyRefunded
          ? "Payment partially refunded"
          : "Platform charge",
      description: paymentDescription,
      state: refunded
        ? "attention"
        : partiallyRefunded
          ? "attention"
        : paymentCaptured
          ? "complete"
          : cancelledBeforePayment
            ? "stopped"
            : "current",
      date: order.confirmedAt,
    },
    {
      id: "freight",
      title: order.selectedQuoteId ? "Freight booking" : "Freight coordination",
      description: freightDescription,
      state: bookingComplete
          ? "complete"
          : shipmentException
            ? "attention"
          : cancelledBeforePayment || refunded
            ? "stopped"
            : paymentCaptured
              ? "current"
              : "upcoming",
      date: order.shipment?.dispatchedAt ?? null,
    },
    {
      id: "pickup",
      title: "Carrier pickup",
      description: pickupDescription,
      state: pickupConfirmed
          ? "complete"
          : shipmentException
            ? "attention"
          : cancelledBeforePayment || refunded
            ? "stopped"
            : bookingComplete
              ? "current"
              : "upcoming",
      date: order.shippedAt,
    },
    {
      id: "transfer",
      title: "Delayed seller transfer",
      description: transferDescription,
      state: transferComplete
        ? "complete"
        : refunded || order.sellerTransferStatus === "refunded"
          ? "stopped"
          : hasOpenDispute
            ? "attention"
          : pickupConfirmed
            ? "current"
            : cancelledBeforePayment
              ? "stopped"
              : "upcoming",
      date: null,
    },
    {
      id: "delivery",
      title: hasOpenDispute ? "Issue reported" : "Delivery and issue reporting",
      description: deliveryDescription,
      state: hasOpenDispute
        ? "attention"
        : shipmentException && !delivered
          ? "attention"
        : delivered || hasClosedDispute
          ? "complete"
          : cancelledBeforePayment || refunded
            ? "stopped"
            : pickupConfirmed
              ? "current"
              : "upcoming",
      date:
        order.dispute?.createdAt ??
        order.deliveredAt ??
        order.shipment?.deliveredAt ??
        null,
    },
  ];
}
