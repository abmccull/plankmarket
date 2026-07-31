const DAY_MS = 24 * 60 * 60 * 1000;

export const LISTING_CONFIRMATION_WINDOW_DAYS = 14;
export const LISTING_CONFIRMATION_WARNING_DAYS = 3;

export type ListingFreshnessStatus =
  | "fresh"
  | "reconfirm_soon"
  | "overdue"
  | "unconfirmed";

type MaybeDate = Date | string | null | undefined;

function toDate(value: MaybeDate): Date | null {
  if (!value) return null;
  const next = value instanceof Date ? value : new Date(value);
  return Number.isNaN(next.getTime()) ? null : next;
}

export function getNextListingConfirmationDueAt(
  confirmedAt: Date,
  windowDays = LISTING_CONFIRMATION_WINDOW_DAYS,
): Date {
  return new Date(confirmedAt.getTime() + windowDays * DAY_MS);
}

export function getListingFreshnessStatus(input: {
  lastConfirmedAt?: MaybeDate;
  confirmationDueAt?: MaybeDate;
  now?: MaybeDate;
  warningDays?: number;
}): ListingFreshnessStatus {
  const lastConfirmedAt = toDate(input.lastConfirmedAt);
  const confirmationDueAt = toDate(input.confirmationDueAt);
  const now = toDate(input.now) ?? new Date();

  if (!lastConfirmedAt || !confirmationDueAt) {
    return "unconfirmed";
  }

  if (confirmationDueAt.getTime() < now.getTime()) {
    return "overdue";
  }

  const warningDays = input.warningDays ?? LISTING_CONFIRMATION_WARNING_DAYS;
  const warningThreshold = new Date(
    confirmationDueAt.getTime() - warningDays * DAY_MS,
  );

  if (warningThreshold.getTime() <= now.getTime()) {
    return "reconfirm_soon";
  }

  return "fresh";
}

export function isListingVisibleToBuyers(input: {
  status?: string | null;
  lastConfirmedAt?: MaybeDate;
  confirmationDueAt?: MaybeDate;
  now?: MaybeDate;
}): boolean {
  if (input.status !== "active") return false;

  const freshnessStatus = getListingFreshnessStatus(input);
  return freshnessStatus === "fresh" || freshnessStatus === "reconfirm_soon";
}
