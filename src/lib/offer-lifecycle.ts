export const OFFER_RESPONSE_WINDOW_MS = 48 * 60 * 60 * 1000;

export const OFFER_RESPONSE_DEADLINE_EVENT =
  "offer/response-deadline-set" as const;

export function buildOfferResponseDeadlineEvent(
  offerId: string,
  expiresAt: Date,
) {
  const expiresAtIso = expiresAt.toISOString();

  return {
    id: `offer-response-deadline:${offerId}:${expiresAt.getTime()}`,
    name: OFFER_RESPONSE_DEADLINE_EVENT,
    data: {
      offerId,
      expiresAt: expiresAtIso,
    },
  };
}
