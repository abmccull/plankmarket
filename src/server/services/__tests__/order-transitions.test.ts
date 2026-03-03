// src/server/services/__tests__/order-transitions.test.ts
//
// Tests the order status state machine extracted from order.ts.
// Covers valid transitions, invalid transitions, and edge cases.

import { describe, it, expect } from "vitest";
import {
  VALID_STATUS_TRANSITIONS,
  isValidTransition,
} from "../order-transitions";

// ---------------------------------------------------------------------------
// Valid transitions (8 tests)
// ---------------------------------------------------------------------------
describe("isValidTransition — valid transitions", () => {
  it("allows pending -> confirmed", () => {
    expect(isValidTransition("pending", "confirmed")).toBe(true);
  });

  it("allows pending -> cancelled", () => {
    expect(isValidTransition("pending", "cancelled")).toBe(true);
  });

  it("allows confirmed -> processing", () => {
    expect(isValidTransition("confirmed", "processing")).toBe(true);
  });

  it("allows confirmed -> cancelled", () => {
    expect(isValidTransition("confirmed", "cancelled")).toBe(true);
  });

  it("allows processing -> shipped", () => {
    expect(isValidTransition("processing", "shipped")).toBe(true);
  });

  it("allows processing -> cancelled", () => {
    expect(isValidTransition("processing", "cancelled")).toBe(true);
  });

  it("allows shipped -> delivered", () => {
    expect(isValidTransition("shipped", "delivered")).toBe(true);
  });

  it("allows delivered -> refunded", () => {
    expect(isValidTransition("delivered", "refunded")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid transitions (8 tests)
// ---------------------------------------------------------------------------
describe("isValidTransition — invalid transitions", () => {
  it("rejects pending -> shipped (skipping intermediate statuses)", () => {
    expect(isValidTransition("pending", "shipped")).toBe(false);
  });

  it("rejects pending -> delivered (skipping intermediate statuses)", () => {
    expect(isValidTransition("pending", "delivered")).toBe(false);
  });

  it("rejects confirmed -> delivered (skipping processing/shipped)", () => {
    expect(isValidTransition("confirmed", "delivered")).toBe(false);
  });

  it("rejects shipped -> confirmed (backward transition)", () => {
    expect(isValidTransition("shipped", "confirmed")).toBe(false);
  });

  it("rejects delivered -> pending (backward transition)", () => {
    expect(isValidTransition("delivered", "pending")).toBe(false);
  });

  it("rejects cancelled -> confirmed (terminal status)", () => {
    expect(isValidTransition("cancelled", "confirmed")).toBe(false);
  });

  it("rejects cancelled -> cancelled (terminal self-transition)", () => {
    expect(isValidTransition("cancelled", "cancelled")).toBe(false);
  });

  it("rejects refunded -> pending (terminal status)", () => {
    expect(isValidTransition("refunded", "pending")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases (4 tests)
// ---------------------------------------------------------------------------
describe("isValidTransition — edge cases", () => {
  it("rejects same-status transition (pending -> pending)", () => {
    expect(isValidTransition("pending", "pending")).toBe(false);
  });

  it("returns false for an unknown source status", () => {
    expect(isValidTransition("unknown_status", "confirmed")).toBe(false);
  });

  it("returns false for an empty string source status", () => {
    expect(isValidTransition("", "confirmed")).toBe(false);
  });

  it("VALID_STATUS_TRANSITIONS defines all 7 statuses", () => {
    const expectedStatuses = [
      "pending",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
    ];
    expect(Object.keys(VALID_STATUS_TRANSITIONS).sort()).toEqual(
      expectedStatuses.sort(),
    );
  });
});
