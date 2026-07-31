import { describe, expect, it } from "vitest";
import {
  canCreatePendingOrder,
  MAX_PENDING_UNPAID_ORDERS,
} from "../pending-order-policy";

describe("pending order reservation policy", () => {
  it("allows buyers below the reservation cap", () => {
    expect(canCreatePendingOrder(0)).toBe(true);
    expect(canCreatePendingOrder(MAX_PENDING_UNPAID_ORDERS - 1)).toBe(true);
  });

  it("blocks the cap and invalid counts", () => {
    expect(canCreatePendingOrder(MAX_PENDING_UNPAID_ORDERS)).toBe(false);
    expect(canCreatePendingOrder(MAX_PENDING_UNPAID_ORDERS + 1)).toBe(false);
    expect(canCreatePendingOrder(-1)).toBe(false);
    expect(canCreatePendingOrder(1.5)).toBe(false);
  });
});
