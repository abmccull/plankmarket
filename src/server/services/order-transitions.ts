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
