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
