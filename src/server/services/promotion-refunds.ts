interface PromotionRefundInput {
  pricePaid: number | string;
  startsAt: Date | string;
  promotionExpiresAt: Date | string;
  listingStatus: string;
  listingExpiresAt: Date | string | null;
  listingSoldAt: Date | string | null;
}

interface PromotionCancellationRefundInput {
  pricePaid: number | string;
  startsAt: Date | string;
  promotionExpiresAt: Date | string;
  cancelledAt: Date | string;
}

const BASE_REFUND_RETRY_DELAY_MS = 15 * 60 * 1000;
const MAX_REFUND_RETRY_DELAY_MS = 6 * 60 * 60 * 1000;

export function getPromotionRefundIdempotencyKey(
  promotionId: string,
): string {
  return `promotion-expiry-refund:${promotionId}`;
}

export function getPromotionRefundRetryAt(
  attemptCount: number,
  from: Date,
): Date {
  const exponent = Math.max(0, attemptCount - 1);
  const delayMs = Math.min(
    MAX_REFUND_RETRY_DELAY_MS,
    BASE_REFUND_RETRY_DELAY_MS * 2 ** exponent,
  );
  return new Date(from.getTime() + delayMs);
}

function toDate(value: Date | string | null): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

export function getPromotionEndedAt(params: {
  listingStatus: string;
  listingExpiresAt: Date | string | null;
  listingSoldAt: Date | string | null;
}): Date | null {
  if (params.listingStatus === "sold") {
    return toDate(params.listingSoldAt);
  }

  if (params.listingStatus === "expired") {
    return toDate(params.listingExpiresAt);
  }

  return null;
}

export function calculateProratedPromotionRefundCents(
  input: PromotionRefundInput,
): number {
  const endedAt = getPromotionEndedAt({
    listingStatus: input.listingStatus,
    listingExpiresAt: input.listingExpiresAt,
    listingSoldAt: input.listingSoldAt,
  });

  if (!endedAt) {
    return 0;
  }

  const startsAt = toDate(input.startsAt);
  const promotionExpiresAt = toDate(input.promotionExpiresAt);
  if (!startsAt || !promotionExpiresAt || endedAt >= promotionExpiresAt) {
    return 0;
  }

  const totalMs = promotionExpiresAt.getTime() - startsAt.getTime();
  if (totalMs <= 0) {
    return 0;
  }

  const usedMs = Math.max(0, endedAt.getTime() - startsAt.getTime());
  const unusedRatio = Math.max(0, 1 - usedMs / totalMs);

  return Math.round(Number(input.pricePaid) * unusedRatio * 100);
}

export function calculatePromotionCancellationRefundCents(
  input: PromotionCancellationRefundInput,
): number {
  const startsAt = toDate(input.startsAt);
  const promotionExpiresAt = toDate(input.promotionExpiresAt);
  const cancelledAt = toDate(input.cancelledAt);
  if (!startsAt || !promotionExpiresAt || !cancelledAt) return 0;

  const totalMs = promotionExpiresAt.getTime() - startsAt.getTime();
  if (totalMs <= 0) return 0;

  const remainingMs = Math.max(
    0,
    promotionExpiresAt.getTime() - cancelledAt.getTime(),
  );
  const remainingRatio = Math.min(1, remainingMs / totalMs);
  return Math.round(Number(input.pricePaid) * remainingRatio * 100);
}
