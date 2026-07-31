/** Valid order status transitions (state machine) */
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

interface PaymentIntentTransitionState {
  orderStatus: string;
  paymentStatus: string | null | undefined;
  storedPaymentIntentId: string | null | undefined;
  eventPaymentIntentId: string;
  inventoryReleasedAt: Date | string | null | undefined;
}

const RETRYABLE_PAYMENT_STATUSES = new Set(["pending", "failed", "processing"]);

function hasMatchingPaymentIntent(
  state: PaymentIntentTransitionState,
): boolean {
  return (
    Boolean(state.storedPaymentIntentId) &&
    state.storedPaymentIntentId === state.eventPaymentIntentId
  );
}

/**
 * Payment success may only confirm the still-reserved pending order that owns
 * the PaymentIntent. This prevents late or out-of-order Stripe events from
 * resurrecting cancelled/refunded orders or inventory that has been released.
 */
export function canApplyPaymentIntentSucceeded(
  state: PaymentIntentTransitionState,
): boolean {
  return (
    hasMatchingPaymentIntent(state) &&
    state.orderStatus === "pending" &&
    !state.inventoryReleasedAt &&
    RETRYABLE_PAYMENT_STATUSES.has(state.paymentStatus ?? "pending")
  );
}

/** A failed attempt is retryable and must never regress a captured payment. */
export function canApplyPaymentIntentFailed(
  state: PaymentIntentTransitionState,
): boolean {
  return (
    hasMatchingPaymentIntent(state) &&
    state.orderStatus === "pending" &&
    !state.inventoryReleasedAt &&
    RETRYABLE_PAYMENT_STATUSES.has(state.paymentStatus ?? "pending")
  );
}

export function canApplyPaymentIntentProcessing(
  state: PaymentIntentTransitionState,
): boolean {
  return (
    hasMatchingPaymentIntent(state) &&
    state.orderStatus === "pending" &&
    !state.inventoryReleasedAt &&
    (state.paymentStatus === "pending" || state.paymentStatus === "failed")
  );
}

export function canApplyPaymentIntentCanceled(
  state: PaymentIntentTransitionState,
): boolean {
  return (
    hasMatchingPaymentIntent(state) &&
    state.orderStatus === "pending" &&
    !state.inventoryReleasedAt &&
    RETRYABLE_PAYMENT_STATUSES.has(state.paymentStatus ?? "pending")
  );
}

export function isStripePaymentIntentCancelable(status: string): boolean {
  return (
    status === "requires_payment_method" ||
    status === "requires_confirmation" ||
    status === "requires_action" ||
    status === "requires_capture"
  );
}

function hasCapturedPayment(paymentStatus: string | null | undefined): boolean {
  return paymentStatus === "succeeded" || paymentStatus === "partially_refunded";
}

export function canSellerUpdateOrderStatus(params: {
  currentStatus: string;
  nextStatus: string;
  paymentStatus: string | null | undefined;
}): boolean {
  const { currentStatus, nextStatus, paymentStatus } = params;

  if (!isValidTransition(currentStatus, nextStatus)) {
    return false;
  }

  if (nextStatus === "cancelled") {
    return !hasCapturedPayment(paymentStatus);
  }

  if (nextStatus === "confirmed") {
    return hasCapturedPayment(paymentStatus);
  }

  if (
    nextStatus === "processing" ||
    nextStatus === "shipped" ||
    nextStatus === "delivered"
  ) {
    return hasCapturedPayment(paymentStatus);
  }

  return true;
}
