export const PLANKMARKET_EVENTS = {
  userRegistered: "user/registered",
  verificationSubmitted: "verification/submitted",
  listingCreated: "listing/created",
  checkoutStarted: "checkout/started",
  orderPaid: "order/paid",
  orderConfirmed: "order/confirmed",
  orderPickedUp: "order/picked-up",
  offerCreated: "offer/created",
  offerAccepted: "offer/accepted",
  offerResponseDeadlineSet: "offer/response-deadline-set",
  subscriptionActivated: "subscription/activated",
  subscriptionPaymentFailed: "subscription/payment-failed",
  subscriptionExpired: "subscription/expired",
} as const;

export type PlankMarketEventSchemas = {
  "user/registered": {
    data: {
      userId: string;
      email: string;
      name: string;
      role: "buyer" | "seller";
    };
  };
  "verification/submitted": {
    data: { userId: string; submissionId: string };
  };
  "listing/created": {
    data: { listingId: string; sellerId: string };
  };
  "checkout/started": {
    data: {
      checkoutId: string;
      buyerId: string;
      listingId: string;
      quantitySqFt: number;
      totalPrice: number;
    };
  };
  "order/paid": {
    data: { orderId: string };
  };
  "order/confirmed": {
    data: { orderId: string; buyerId: string };
  };
  "order/picked-up": {
    data: {
      orderId: string;
      pickedUpAt: string;
      pickupConfirmed: true;
      source: "priority1";
    };
  };
  "offer/created": {
    data: { offerId: string };
  };
  "offer/accepted": {
    data: {
      offerId: string;
      buyerId: string;
      sellerId: string;
      listingId: string;
      listingTitle: string;
      acceptedPrice: string;
      quantity: string;
      estimatedTotal: string;
      expiresAt: string;
    };
  };
  "offer/response-deadline-set": {
    data: { offerId: string; expiresAt: string };
  };
  "subscription/activated": {
    data: { userId: string };
  };
  "subscription/payment-failed": {
    data: { userId: string };
  };
  "subscription/expired": {
    data: { userId: string };
  };
};

export function buildListingCreatedEvent(input: {
  listingId: string;
  sellerId: string;
}) {
  return {
    id: `listing-created:${input.listingId}`,
    name: PLANKMARKET_EVENTS.listingCreated,
    data: input,
  } as const;
}

export function buildCheckoutStartedEvent(input: {
  checkoutId: string;
  buyerId: string;
  listingId: string;
  quantitySqFt: number;
  totalPrice: number;
  paymentIntentId: string;
}) {
  const { paymentIntentId, ...data } = input;
  return {
    id: `checkout-started:${data.checkoutId}:${paymentIntentId}`,
    name: PLANKMARKET_EVENTS.checkoutStarted,
    data,
  } as const;
}

export function buildOrderPaidEvent(orderId: string, paymentIntentId: string) {
  return {
    id: `order-paid:${paymentIntentId}`,
    name: PLANKMARKET_EVENTS.orderPaid,
    data: { orderId },
  } as const;
}

export function buildOrderConfirmedEvent(input: {
  orderId: string;
  buyerId: string;
  paymentIntentId: string;
}) {
  return {
    id: `order-confirmed:${input.paymentIntentId}`,
    name: PLANKMARKET_EVENTS.orderConfirmed,
    data: { orderId: input.orderId, buyerId: input.buyerId },
  } as const;
}
