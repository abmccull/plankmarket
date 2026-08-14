import { describe, expect, it } from "vitest";
import { isStripeChargeRefunded } from "../stripe-charge-state";

describe("isStripeChargeRefunded", () => {
  it("treats refunded or partially refunded charges as refunded", () => {
    expect(isStripeChargeRefunded({ refunded: true, amount_refunded: 0 } as never)).toBe(true);
    expect(
      isStripeChargeRefunded({ refunded: false, amount_refunded: 25 } as never),
    ).toBe(true);
  });

  it("ignores missing or unexpanded charge ids", () => {
    expect(isStripeChargeRefunded(null)).toBe(false);
    expect(isStripeChargeRefunded("ch_123")).toBe(false);
    expect(
      isStripeChargeRefunded({ refunded: false, amount_refunded: 0 } as never),
    ).toBe(false);
  });
});
