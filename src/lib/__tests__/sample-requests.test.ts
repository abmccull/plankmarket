import { describe, expect, it } from "vitest";

import {
  SAMPLE_REQUEST_STATUS_TRANSITIONS,
  SampleRequestTransitionError,
  applySampleRequestAction,
  canActorAccessSampleAddress,
  getAllowedSampleRequestActions,
  getNextSampleRequestStatus,
  isSampleRequestTerminalStatus,
  isValidSampleRequestTransition,
} from "@/lib/sample-requests";

describe("sample request transition graph", () => {
  it("defines the direct seller-to-buyer sample workflow", () => {
    expect(SAMPLE_REQUEST_STATUS_TRANSITIONS).toEqual({
      requested: ["approved", "declined", "cancelled"],
      approved: ["shipped", "cancelled"],
      shipped: ["delivered"],
      declined: [],
      cancelled: [],
      delivered: [],
    });
  });

  it("validates only the expected forward transitions", () => {
    expect(isValidSampleRequestTransition("requested", "approved")).toBe(true);
    expect(isValidSampleRequestTransition("requested", "declined")).toBe(true);
    expect(isValidSampleRequestTransition("requested", "cancelled")).toBe(true);
    expect(isValidSampleRequestTransition("approved", "shipped")).toBe(true);
    expect(isValidSampleRequestTransition("approved", "cancelled")).toBe(true);
    expect(isValidSampleRequestTransition("shipped", "delivered")).toBe(true);

    expect(isValidSampleRequestTransition("requested", "shipped")).toBe(false);
    expect(isValidSampleRequestTransition("approved", "delivered")).toBe(false);
    expect(isValidSampleRequestTransition("cancelled", "approved")).toBe(false);
  });

  it("marks declined, cancelled, and delivered as terminal", () => {
    expect(isSampleRequestTerminalStatus("requested")).toBe(false);
    expect(isSampleRequestTerminalStatus("approved")).toBe(false);
    expect(isSampleRequestTerminalStatus("shipped")).toBe(false);
    expect(isSampleRequestTerminalStatus("declined")).toBe(true);
    expect(isSampleRequestTerminalStatus("cancelled")).toBe(true);
    expect(isSampleRequestTerminalStatus("delivered")).toBe(true);
  });

  it("maps each action to its target status", () => {
    expect(getNextSampleRequestStatus("approve")).toBe("approved");
    expect(getNextSampleRequestStatus("decline")).toBe("declined");
    expect(getNextSampleRequestStatus("cancel")).toBe("cancelled");
    expect(getNextSampleRequestStatus("ship")).toBe("shipped");
    expect(getNextSampleRequestStatus("deliver")).toBe("delivered");
  });
});

describe("sample request role permissions", () => {
  it("allows only the buyer to cancel while the request is pending", () => {
    expect(
      getAllowedSampleRequestActions({
        status: "requested",
        actorRole: "buyer",
      }),
    ).toEqual(["cancel"]);

    expect(
      getAllowedSampleRequestActions({
        status: "requested",
        actorRole: "seller",
      }),
    ).toEqual(["approve", "decline"]);
  });

  it("allows seller and admin fulfillment actions after approval", () => {
    expect(
      getAllowedSampleRequestActions({
        status: "approved",
        actorRole: "seller",
      }),
    ).toEqual(["ship", "cancel"]);

    expect(
      getAllowedSampleRequestActions({
        status: "approved",
        actorRole: "admin",
      }),
    ).toEqual(["ship", "cancel"]);
  });

  it("allows only buyer or admin to mark a shipped sample as delivered", () => {
    expect(
      getAllowedSampleRequestActions({
        status: "shipped",
        actorRole: "buyer",
      }),
    ).toEqual(["deliver"]);

    expect(
      getAllowedSampleRequestActions({
        status: "shipped",
        actorRole: "seller",
      }),
    ).toEqual([]);
  });
});

describe("sample request transitions", () => {
  it("records an auditable approval with a trimmed reason", () => {
    const result = applySampleRequestAction({
      state: { status: "requested" },
      actorRole: "seller",
      action: "approve",
      reason: "  stock verified and sample is ready to pull ",
      occurredAt: "2026-07-30T10:00:00.000Z",
    });

    expect(result).toEqual({
      kind: "transition",
      status: "approved",
      audit: {
        action: "approve",
        actorRole: "seller",
        fromStatus: "requested",
        toStatus: "approved",
        reason: "stock verified and sample is ready to pull",
        occurredAt: new Date("2026-07-30T10:00:00.000Z"),
        idempotent: false,
      },
    });
  });

  it("allows the buyer to cancel a pending request", () => {
    const result = applySampleRequestAction({
      state: { status: "requested" },
      actorRole: "buyer",
      action: "cancel",
      reason: "Job changed before seller approved the request",
    });

    expect(result.status).toBe("cancelled");
    expect(result.audit.fromStatus).toBe("requested");
    expect(result.audit.toStatus).toBe("cancelled");
  });

  it("allows seller cancellation after approval when a sample can no longer be fulfilled", () => {
    const result = applySampleRequestAction({
      state: { status: "approved" },
      actorRole: "seller",
      action: "cancel",
      reason: "Inventory was allocated elsewhere before the sample shipped",
    });

    expect(result.status).toBe("cancelled");
  });

  it("rejects an action when the actor role is not allowed for the current state", () => {
    expect(() =>
      applySampleRequestAction({
        state: { status: "approved" },
        actorRole: "buyer",
        action: "ship",
        reason: "Attempting fulfillment from the wrong role",
      }),
    ).toThrowError(SampleRequestTransitionError);

    expect(() =>
      applySampleRequestAction({
        state: { status: "approved" },
        actorRole: "buyer",
        action: "ship",
        reason: "Attempting fulfillment from the wrong role",
      }),
    ).toThrowError("buyer cannot ship a sample request from approved.");
  });

  it("rejects non-forward transitions even when the target status exists", () => {
    expect(() =>
      applySampleRequestAction({
        state: { status: "requested" },
        actorRole: "seller",
        action: "deliver",
        reason: "Skipping shipment should not be possible",
      }),
    ).toThrowError("seller cannot deliver a sample request from requested.");
  });

  it("requires a non-empty transition reason for auditability", () => {
    expect(() =>
      applySampleRequestAction({
        state: { status: "requested" },
        actorRole: "seller",
        action: "approve",
        reason: "   ",
      }),
    ).toThrowError("Sample request transitions require an audit reason.");
  });

  it("treats same-terminal actions as idempotent noops", () => {
    const result = applySampleRequestAction({
      state: { status: "delivered" },
      actorRole: "buyer",
      action: "deliver",
      reason: "Carrier marked the sample delivered again",
    });

    expect(result).toEqual({
      kind: "noop",
      status: "delivered",
      audit: {
        action: "deliver",
        actorRole: "buyer",
        fromStatus: "delivered",
        toStatus: "delivered",
        reason: "Carrier marked the sample delivered again",
        occurredAt: null,
        idempotent: true,
      },
    });
  });

  it("blocks different actions once the sample request is terminal", () => {
    expect(() =>
      applySampleRequestAction({
        state: { status: "cancelled" },
        actorRole: "seller",
        action: "ship",
        reason: "A cancelled request cannot resume fulfillment",
      }),
    ).toThrowError("Sample request is already cancelled.");
  });
});

describe("sample address visibility", () => {
  it("keeps the buyer's own address visible to the buyer", () => {
    expect(
      canActorAccessSampleAddress({
        actorRole: "buyer",
        status: "requested",
      }),
    ).toBe(true);
  });

  it("does not reveal the buyer address before seller approval even if consent was captured", () => {
    expect(
      canActorAccessSampleAddress({
        actorRole: "seller",
        status: "requested",
        buyerConsentedToShareAddressAt: "2026-07-30T09:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("does not reveal the buyer address after approval without explicit consent", () => {
    expect(
      canActorAccessSampleAddress({
        actorRole: "seller",
        status: "approved",
      }),
    ).toBe(false);
  });

  it("reveals the buyer address to seller/admin only after approval and explicit buyer consent", () => {
    expect(
      canActorAccessSampleAddress({
        actorRole: "seller",
        status: "approved",
        buyerConsentedToShareAddressAt: "2026-07-30T09:00:00.000Z",
      }),
    ).toBe(true);

    expect(
      canActorAccessSampleAddress({
        actorRole: "admin",
        status: "shipped",
        buyerConsentedToShareAddressAt: "2026-07-30T09:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("stops revealing the buyer address on cancelled or declined requests", () => {
    expect(
      canActorAccessSampleAddress({
        actorRole: "seller",
        status: "cancelled",
        buyerConsentedToShareAddressAt: "2026-07-30T09:00:00.000Z",
      }),
    ).toBe(false);

    expect(
      canActorAccessSampleAddress({
        actorRole: "admin",
        status: "declined",
        buyerConsentedToShareAddressAt: "2026-07-30T09:00:00.000Z",
      }),
    ).toBe(false);
  });
});
