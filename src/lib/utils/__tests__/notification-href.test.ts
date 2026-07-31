import { describe, expect, it } from "vitest";
import { getNotificationHref } from "../notification-href";

describe("getNotificationHref sample requests", () => {
  it("routes a newly created sample request to the seller fulfillment page", () => {
    expect(
      getNotificationHref(
        {
          type: "system",
          data: {
            type: "sample_request_created",
            sampleRequestId: "11111111-1111-4111-8111-111111111111",
          },
        },
        "seller",
      ),
    ).toBe("/seller/samples");
  });

  it("routes sample updates to the receiving buyer's sample page", () => {
    expect(
      getNotificationHref(
        {
          type: "system",
          data: {
            type: "sample_request_updated",
            sampleRequestId: "11111111-1111-4111-8111-111111111111",
            action: "approve",
          },
        },
        "buyer",
      ),
    ).toBe("/buyer/samples");
  });

  it("routes buyer-originated sample updates to the receiving seller's sample page", () => {
    expect(
      getNotificationHref(
        {
          type: "system",
          data: {
            type: "sample_request_updated",
            sampleRequestId: "11111111-1111-4111-8111-111111111111",
            action: "cancel",
          },
        },
        "seller",
      ),
    ).toBe("/seller/samples");
  });
});
