export const MAX_PENDING_UNPAID_ORDERS = 3;

export function canCreatePendingOrder(currentPendingCount: number): boolean {
  return (
    Number.isInteger(currentPendingCount) &&
    currentPendingCount >= 0 &&
    currentPendingCount < MAX_PENDING_UNPAID_ORDERS
  );
}
