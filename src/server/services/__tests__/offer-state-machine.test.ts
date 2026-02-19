// src/server/services/__tests__/offer-state-machine.test.ts
//
// Tests the offer state-machine and turn-validation rules extracted
// from src/server/routers/offer.ts without touching the database.
//
// Key rules under test:
//  1. Only "pending" or "countered" offers can be accepted / rejected / countered
//  2. "withdrawn" and "expired" and "rejected" and "accepted" are terminal — no further actions
//  3. Turn-based validation: the last actor cannot act again; must be buyer or seller
//  4. Buyer is the only party who can withdraw
//  5. Total price = Math.round(pricePerSqFt * quantitySqFt * 100) / 100
//  6. Counter increments currentRound

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Types mirroring the DB shape used in offer.ts
// ---------------------------------------------------------------------------
type OfferStatus =
  | "pending"
  | "countered"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "expired";

interface OfferForValidation {
  id: string;
  buyerId: string;
  sellerId: string;
  lastActorId: string | null;
  status: OfferStatus;
  expiresAt: Date | null;
  offerPricePerSqFt: number;
  counterPricePerSqFt: number | null;
  quantitySqFt: number;
  currentRound: number;
}

// ---------------------------------------------------------------------------
// Pure domain helpers (mirror the logic in offer.ts but without DB/TRPC)
// ---------------------------------------------------------------------------

class OfferValidationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "OfferValidationError";
  }
}

/** Mirrors validateTurn() in offer.ts */
function validateTurn(
  offer: Pick<OfferForValidation, "lastActorId" | "buyerId" | "sellerId">,
  currentUserId: string
): void {
  if (!offer.lastActorId) {
    throw new OfferValidationError("BAD_REQUEST", "Offer has not been initialized properly");
  }

  if (offer.lastActorId === currentUserId) {
    throw new OfferValidationError(
      "FORBIDDEN",
      "It's not your turn. Wait for the other party to respond."
    );
  }

  if (currentUserId !== offer.buyerId && currentUserId !== offer.sellerId) {
    throw new OfferValidationError("FORBIDDEN", "You are not a party to this offer");
  }
}

/** Mirrors the status check + expiry check used before accept/reject/counter */
function validateOfferIsActionable(offer: Pick<OfferForValidation, "status" | "expiresAt">, action: string): void {
  if (offer.status !== "pending" && offer.status !== "countered") {
    throw new OfferValidationError("BAD_REQUEST", `This offer cannot be ${action}`);
  }
  if (offer.expiresAt && new Date() > offer.expiresAt) {
    throw new OfferValidationError("BAD_REQUEST", "This offer has expired");
  }
}

/** Mirrors the withdraw status check in offer.ts withdrawOffer */
function validateWithdrawable(
  offer: Pick<OfferForValidation, "status" | "buyerId">,
  currentUserId: string
): void {
  if (offer.buyerId !== currentUserId) {
    throw new OfferValidationError("FORBIDDEN", "You can only withdraw your own offers");
  }
  if (offer.status !== "pending" && offer.status !== "countered") {
    throw new OfferValidationError("BAD_REQUEST", "You can only withdraw pending or countered offers");
  }
}

/** Mirrors the total price formula in offer.ts */
function computeOfferTotalPrice(pricePerSqFt: number, quantitySqFt: number): number {
  return Math.round(pricePerSqFt * quantitySqFt * 100) / 100;
}

/** Mirrors the counter round increment in offer.ts counterOffer */
function applyCounter(
  offer: Pick<OfferForValidation, "currentRound" | "quantitySqFt">,
  newPricePerSqFt: number,
  actorId: string
): { status: OfferStatus; currentRound: number; counterPricePerSqFt: number; lastActorId: string } {
  return {
    status: "countered",
    currentRound: offer.currentRound + 1,
    counterPricePerSqFt: newPricePerSqFt,
    lastActorId: actorId,
  };
}

// ---------------------------------------------------------------------------
// Test factories
// ---------------------------------------------------------------------------
const BUYER_ID = "buyer-001";
const SELLER_ID = "seller-001";
const THIRD_PARTY_ID = "third-party-999";

function makePendingOffer(overrides: Partial<OfferForValidation> = {}): OfferForValidation {
  return {
    id: "offer-abc",
    buyerId: BUYER_ID,
    sellerId: SELLER_ID,
    lastActorId: BUYER_ID, // buyer made the initial offer
    status: "pending",
    expiresAt: null, // offers don't expire by default
    offerPricePerSqFt: 2.5,
    counterPricePerSqFt: null,
    quantitySqFt: 100,
    currentRound: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateTurn
// ---------------------------------------------------------------------------
describe("validateTurn", () => {
  it("should allow the non-last-actor party to act", () => {
    const offer = makePendingOffer({ lastActorId: BUYER_ID });
    // Seller has not acted yet → seller's turn
    expect(() => validateTurn(offer, SELLER_ID)).not.toThrow();
  });

  it("should throw FORBIDDEN when the last actor tries to act again", () => {
    const offer = makePendingOffer({ lastActorId: BUYER_ID });
    expect(() => validateTurn(offer, BUYER_ID)).toThrowError(
      "It's not your turn. Wait for the other party to respond."
    );
  });

  it("should throw FORBIDDEN for a third party not in the offer", () => {
    const offer = makePendingOffer({ lastActorId: BUYER_ID });
    expect(() => validateTurn(offer, THIRD_PARTY_ID)).toThrowError(
      "You are not a party to this offer"
    );
  });

  it("should throw BAD_REQUEST when lastActorId is null (uninitialised offer)", () => {
    const offer = makePendingOffer({ lastActorId: null });
    expect(() => validateTurn(offer, SELLER_ID)).toThrowError(
      "Offer has not been initialized properly"
    );
  });

  it("should allow the seller to act after the buyer countered", () => {
    const offer = makePendingOffer({ lastActorId: SELLER_ID, status: "countered" });
    expect(() => validateTurn(offer, BUYER_ID)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// validateOfferIsActionable (accept / reject / counter gate)
// ---------------------------------------------------------------------------
describe("validateOfferIsActionable", () => {
  it("should pass for a pending offer that has not expired", () => {
    const offer = makePendingOffer({ status: "pending" });
    expect(() => validateOfferIsActionable(offer, "accepted")).not.toThrow();
  });

  it("should pass for a countered offer that has not expired", () => {
    const offer = makePendingOffer({ status: "countered" });
    expect(() => validateOfferIsActionable(offer, "accepted")).not.toThrow();
  });

  it("should throw for an already accepted offer", () => {
    const offer = makePendingOffer({ status: "accepted" });
    expect(() => validateOfferIsActionable(offer, "accepted")).toThrowError(
      "This offer cannot be accepted"
    );
  });

  it("should throw for an already rejected offer", () => {
    const offer = makePendingOffer({ status: "rejected" });
    expect(() => validateOfferIsActionable(offer, "rejected")).toThrowError(
      "This offer cannot be rejected"
    );
  });

  it("should throw for a withdrawn offer", () => {
    const offer = makePendingOffer({ status: "withdrawn" });
    expect(() => validateOfferIsActionable(offer, "countered")).toThrowError(
      "This offer cannot be countered"
    );
  });

  it("should pass for an offer with no expiration (expiresAt is null)", () => {
    const offer = makePendingOffer({ status: "pending", expiresAt: null });
    expect(() => validateOfferIsActionable(offer, "accepted")).not.toThrow();
  });

  it("should throw for an expired offer (expiresAt in the past)", () => {
    const pastDate = new Date("2020-01-01");
    const offer = makePendingOffer({ status: "pending", expiresAt: pastDate });
    expect(() => validateOfferIsActionable(offer, "accepted")).toThrowError(
      "This offer has expired"
    );
  });

  it("should throw for an already expired status", () => {
    const offer = makePendingOffer({ status: "expired" });
    expect(() => validateOfferIsActionable(offer, "accepted")).toThrowError(
      "This offer cannot be accepted"
    );
  });
});

// ---------------------------------------------------------------------------
// validateWithdrawable
// ---------------------------------------------------------------------------
describe("validateWithdrawable", () => {
  it("should allow buyer to withdraw a pending offer", () => {
    const offer = makePendingOffer({ status: "pending" });
    expect(() => validateWithdrawable(offer, BUYER_ID)).not.toThrow();
  });

  it("should allow buyer to withdraw a countered offer", () => {
    const offer = makePendingOffer({ status: "countered" });
    expect(() => validateWithdrawable(offer, BUYER_ID)).not.toThrow();
  });

  it("should throw FORBIDDEN when the seller tries to withdraw", () => {
    const offer = makePendingOffer({ status: "pending" });
    expect(() => validateWithdrawable(offer, SELLER_ID)).toThrowError(
      "You can only withdraw your own offers"
    );
  });

  it("should throw FORBIDDEN for a third party trying to withdraw", () => {
    const offer = makePendingOffer({ status: "pending" });
    expect(() => validateWithdrawable(offer, THIRD_PARTY_ID)).toThrowError(
      "You can only withdraw your own offers"
    );
  });

  it("should throw BAD_REQUEST when trying to withdraw an accepted offer", () => {
    const offer = makePendingOffer({ status: "accepted" });
    expect(() => validateWithdrawable(offer, BUYER_ID)).toThrowError(
      "You can only withdraw pending or countered offers"
    );
  });

  it("should throw BAD_REQUEST when trying to withdraw a rejected offer", () => {
    const offer = makePendingOffer({ status: "rejected" });
    expect(() => validateWithdrawable(offer, BUYER_ID)).toThrowError(
      "You can only withdraw pending or countered offers"
    );
  });

  it("should throw BAD_REQUEST when trying to withdraw a withdrawn offer", () => {
    const offer = makePendingOffer({ status: "withdrawn" });
    expect(() => validateWithdrawable(offer, BUYER_ID)).toThrowError(
      "You can only withdraw pending or countered offers"
    );
  });

  it("should throw BAD_REQUEST when trying to withdraw an expired offer", () => {
    const offer = makePendingOffer({ status: "expired" });
    expect(() => validateWithdrawable(offer, BUYER_ID)).toThrowError(
      "You can only withdraw pending or countered offers"
    );
  });
});

// ---------------------------------------------------------------------------
// Offer total price computation
// ---------------------------------------------------------------------------
describe("computeOfferTotalPrice", () => {
  it("should compute price per sqft times quantity", () => {
    expect(computeOfferTotalPrice(2.5, 100)).toBe(250);
  });

  it("should round to two decimal places", () => {
    // 1.111 * 3 = 3.333 → 3.33
    expect(computeOfferTotalPrice(1.111, 3)).toBe(3.33);
  });

  it("should return 0 for zero price", () => {
    expect(computeOfferTotalPrice(0, 100)).toBe(0);
  });

  it("should return 0 for zero quantity", () => {
    expect(computeOfferTotalPrice(5, 0)).toBe(0);
  });

  it("should handle large values", () => {
    expect(computeOfferTotalPrice(5.75, 10000)).toBe(57500);
  });
});

// ---------------------------------------------------------------------------
// Counter-offer logic (round increment, status, actor tracking)
// ---------------------------------------------------------------------------
describe("applyCounter (counter-offer state transition)", () => {
  it("should set status to 'countered'", () => {
    const offer = makePendingOffer({ currentRound: 1 });
    const result = applyCounter(offer, 2.0, SELLER_ID);
    expect(result.status).toBe("countered");
  });

  it("should increment currentRound by 1", () => {
    const offer = makePendingOffer({ currentRound: 1 });
    const result = applyCounter(offer, 2.0, SELLER_ID);
    expect(result.currentRound).toBe(2);
  });

  it("should set the new counter price", () => {
    const offer = makePendingOffer();
    const result = applyCounter(offer, 3.0, SELLER_ID);
    expect(result.counterPricePerSqFt).toBe(3.0);
  });

  it("should record the acting party as lastActorId", () => {
    const offer = makePendingOffer({ lastActorId: BUYER_ID });
    const result = applyCounter(offer, 2.0, SELLER_ID);
    expect(result.lastActorId).toBe(SELLER_ID);
  });

  it("should allow multiple rounds of countering", () => {
    const offer = makePendingOffer({ currentRound: 1, lastActorId: BUYER_ID });

    // Round 2: seller counters
    const round2 = applyCounter(offer, 2.0, SELLER_ID);
    expect(round2.currentRound).toBe(2);
    expect(round2.lastActorId).toBe(SELLER_ID);

    // Round 3: buyer counters back
    const offerAfterR2 = { ...offer, currentRound: round2.currentRound, lastActorId: round2.lastActorId };
    const round3 = applyCounter(offerAfterR2, 2.25, BUYER_ID);
    expect(round3.currentRound).toBe(3);
    expect(round3.lastActorId).toBe(BUYER_ID);
  });
});

// ---------------------------------------------------------------------------
// Full state transition flows
// ---------------------------------------------------------------------------
describe("Offer state transition flows", () => {
  it("happy path: buyer offers → seller counters → buyer accepts", () => {
    // 1. Buyer makes initial offer (status: pending, lastActorId: BUYER_ID)
    const offer = makePendingOffer({ status: "pending", lastActorId: BUYER_ID });

    // 2. Seller can act — validates turn (seller's turn)
    expect(() => validateTurn(offer, SELLER_ID)).not.toThrow();
    expect(() => validateOfferIsActionable(offer, "countered")).not.toThrow();

    // 3. Seller counters
    const afterCounter = applyCounter(offer, 2.2, SELLER_ID);
    expect(afterCounter.status).toBe("countered");
    expect(afterCounter.lastActorId).toBe(SELLER_ID);

    // 4. Now buyer's turn
    const counterOffer = { ...offer, ...afterCounter, status: "countered" as OfferStatus };
    expect(() => validateTurn(counterOffer, BUYER_ID)).not.toThrow();
    expect(() => validateOfferIsActionable(counterOffer, "accepted")).not.toThrow();
    // Buyer accepts — no further state change to model here; just verify no errors thrown
  });

  it("should not allow double-act: seller cannot counter their own counter", () => {
    const offer = makePendingOffer({ status: "countered", lastActorId: SELLER_ID });
    expect(() => validateTurn(offer, SELLER_ID)).toThrowError("It's not your turn");
  });

  it("should block any action on a rejected offer", () => {
    const offer = makePendingOffer({ status: "rejected" });
    expect(() => validateOfferIsActionable(offer, "accepted")).toThrowError("cannot be accepted");
    expect(() => validateOfferIsActionable(offer, "rejected")).toThrowError("cannot be rejected");
    expect(() => validateOfferIsActionable(offer, "countered")).toThrowError("cannot be countered");
  });

  it("should block any action on an accepted offer", () => {
    const offer = makePendingOffer({ status: "accepted" });
    expect(() => validateOfferIsActionable(offer, "accepted")).toThrowError("cannot be accepted");
    expect(() => validateOfferIsActionable(offer, "rejected")).toThrowError("cannot be rejected");
    expect(() => validateOfferIsActionable(offer, "countered")).toThrowError("cannot be countered");
  });

  it("should block withdrawal on a terminal status but not on countered", () => {
    const acceptedOffer = makePendingOffer({ status: "accepted" });
    expect(() => validateWithdrawable(acceptedOffer, BUYER_ID)).toThrowError(
      "You can only withdraw pending or countered offers"
    );

    const counteredOffer = makePendingOffer({ status: "countered" });
    expect(() => validateWithdrawable(counteredOffer, BUYER_ID)).not.toThrow();
  });
});
