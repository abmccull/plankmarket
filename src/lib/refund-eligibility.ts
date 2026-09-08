export function canIssuePartialOrderRefund(params: { stripeTransferId: string | null }): boolean {
  return Boolean(params.stripeTransferId);
}
export function getRefundEligibility(order: { paymentStatus: string | null; stripePaymentIntentId: string | null; stripeTransferId: string | null; totalPrice: number; refundedAmount: number | null }) {
  const remainingCents = Math.max(0, Math.round(order.totalPrice * 100) - Math.round((order.refundedAmount ?? 0) * 100));
  const canRefund = Boolean(order.stripePaymentIntentId) && ["succeeded", "partially_refunded"].includes(order.paymentStatus ?? "") && remainingCents > 0;
  const canPartialRefund = canRefund && canIssuePartialOrderRefund(order);
  return { canRefund, canPartialRefund, remainingCents, reason: !canRefund ? "No captured refundable balance is recorded. Reconcile payment status before choosing a refund." : !canPartialRefund ? "Only the full remaining balance can be refunded before a seller transfer is recorded. Reconcile any unrecorded transfer before offering a partial settlement." : null };
}
