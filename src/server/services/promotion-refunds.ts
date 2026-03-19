interface PromotionRefundInput {
  pricePaid: number | string;
  startsAt: Date | string;
  promotionExpiresAt: Date | string;
  listingStatus: string;
  listingExpiresAt: Date | string | null;
  listingSoldAt: Date | string | null;
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
