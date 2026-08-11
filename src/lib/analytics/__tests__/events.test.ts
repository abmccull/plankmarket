/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  capture: vi.fn(),
  getPostHogServer: vi.fn(),
}));

vi.mock("@/lib/analytics/posthog-server", () => ({
  getPostHogServer: mocks.getPostHogServer,
}));

const { track } = await import("@/lib/analytics/events");

describe("server analytics tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPostHogServer.mockReturnValue({ capture: mocks.capture });
  });

  it("does not capture without an explicit consent signal", () => {
    track("buyer-123", "order_created", {
      order_id: "order-123",
      listing_id: "listing-123",
      seller_id: "seller-123",
      buyer_id: "buyer-123",
      total_amount: 5000,
      quantity_sqft: 100,
    });

    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("captures only when explicit consent is passed and sanitizes properties", () => {
    track(
      "buyer-123",
      "order_created",
      {
        order_id: "order-123",
        listing_id: "listing-123",
        seller_id: "seller-123",
        buyer_id: "buyer-123",
        total_amount: 5000,
        quantity_sqft: 100,
      },
      true,
    );

    expect(mocks.capture).toHaveBeenCalledWith({
      distinctId: "buyer-123",
      event: "order_created",
      properties: {
        order_id: "[redacted]",
        listing_id: "[redacted]",
        seller_id: "[redacted]",
        buyer_id: "[redacted]",
        total_amount: 5000,
        quantity_sqft: 100,
      },
    });
  });
});
