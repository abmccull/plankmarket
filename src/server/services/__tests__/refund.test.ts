import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test_dummy",
  },
}));

import { shouldReleaseInventoryOnRefund } from "../refund";

describe("shouldReleaseInventoryOnRefund", () => {
  it("releases inventory for full refunds before shipment", () => {
    expect(
      shouldReleaseInventoryOnRefund({
        orderStatus: "confirmed",
        isFullRefund: true,
      }),
    ).toBe(true);
  });

  it("does not release inventory for partial refunds", () => {
    expect(
      shouldReleaseInventoryOnRefund({
        orderStatus: "confirmed",
        isFullRefund: false,
      }),
    ).toBe(false);
  });

  it("does not release inventory after shipment", () => {
    expect(
      shouldReleaseInventoryOnRefund({
        orderStatus: "shipped",
        isFullRefund: true,
      }),
    ).toBe(false);
  });

  it("does not release inventory after delivery", () => {
    expect(
      shouldReleaseInventoryOnRefund({
        orderStatus: "delivered",
        isFullRefund: true,
      }),
    ).toBe(false);
  });
});
