export const PAYMENT_INTENT_PREPARATION_LEASE_MS = 5 * 60 * 1000;

export function hasActivePaymentIntentPreparation(params: {
  claimToken: string | null | undefined;
  claimedAt: Date | string | null | undefined;
  now?: Date;
}): boolean {
  if (!params.claimToken || !params.claimedAt) return false;

  const claimedAt =
    params.claimedAt instanceof Date
      ? params.claimedAt
      : new Date(params.claimedAt);
  if (Number.isNaN(claimedAt.getTime())) return false;

  const now = params.now ?? new Date();
  return (
    claimedAt.getTime() + PAYMENT_INTENT_PREPARATION_LEASE_MS > now.getTime()
  );
}

export type PaymentIntentFinalizationLoss =
  | "already_finalized"
  | "newer_claim"
  | "cancel_orphan";

export function classifyPaymentIntentFinalizationLoss(params: {
  expectedClaimToken: string;
  preparedPaymentIntentId: string;
  current: {
    paymentIntentClaimToken: string | null;
    stripePaymentIntentId: string | null;
    status: string;
    paymentStatus: string;
    escrowStatus: string;
    inventoryReleasedAt: Date | string | null;
  } | null;
  economicsMatch: boolean;
}): PaymentIntentFinalizationLoss {
  const current = params.current;
  if (
    current?.stripePaymentIntentId === params.preparedPaymentIntentId &&
    !current.paymentIntentClaimToken &&
    current.status === "pending" &&
    current.escrowStatus === "held" &&
    !current.inventoryReleasedAt &&
    params.economicsMatch &&
    !["succeeded", "refunded", "partially_refunded"].includes(
      current.paymentStatus,
    )
  ) {
    return "already_finalized";
  }

  if (
    current?.paymentIntentClaimToken &&
    current.paymentIntentClaimToken !== params.expectedClaimToken &&
    current.status === "pending"
  ) {
    return "newer_claim";
  }

  return "cancel_orphan";
}
