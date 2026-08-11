import { describe, expect, it } from "vitest";
import {
  hasPersistedProviderPickupEvidence,
  hasPersistedPickupTrackingEvent,
  isProviderConfirmedPickup,
} from "../payout-eligibility";

describe("isProviderConfirmedPickup", () => {
  const validEvent = {
    orderId: "order-1",
    pickedUpAt: "2026-07-11T18:00:00.000Z",
    pickupConfirmed: true as const,
    source: "priority1" as const,
  };

  it("accepts a valid provider-confirmed event", () => {
    expect(isProviderConfirmedPickup(validEvent)).toBe(true);
  });

  it("rejects an untrusted source or invalid pickup time", () => {
    expect(
      isProviderConfirmedPickup({ ...validEvent, source: "manual" as never }),
    ).toBe(false);
    expect(
      isProviderConfirmedPickup({ ...validEvent, pickedUpAt: "not-a-date" }),
    ).toBe(false);
  });
});

describe("hasPersistedPickupTrackingEvent", () => {
  it("accepts live pickup-or-later tracking events with a valid timestamp", () => {
    expect(
      hasPersistedPickupTrackingEvent([
        {
          timestamp: "2026-07-11T18:00:00.000Z",
          status: "in_transit",
          location: "Salt Lake City, UT",
          description: "Picked up by carrier",
        },
      ]),
    ).toBe(true);
    expect(
      hasPersistedPickupTrackingEvent([
        {
          timestamp: "2026-07-12T09:30:00.000Z",
          status: "delivered",
        },
      ]),
    ).toBe(true);
  });

  it("rejects empty, malformed, and pre-pickup tracking arrays", () => {
    expect(hasPersistedPickupTrackingEvent([])).toBe(false);
    expect(
      hasPersistedPickupTrackingEvent([
        {
          timestamp: "not-a-date",
          status: "in_transit",
        },
      ]),
    ).toBe(false);
    expect(
      hasPersistedPickupTrackingEvent([
        {
          timestamp: "2026-07-11T18:00:00.000Z",
          status: "dispatched",
        },
      ]),
    ).toBe(false);
    expect(hasPersistedPickupTrackingEvent(null)).toBe(false);
  });
});

describe("hasPersistedProviderPickupEvidence", () => {
  const validEvidence = {
    selectedQuoteId: "123",
    shipmentQuoteId: "123",
    priority1ShipmentId: "456",
    shipmentStatus: "in_transit",
    shipmentIsDryRun: false,
    shipmentTrackingEvents: [
      {
        timestamp: "2026-07-11T18:00:00.000Z",
        status: "in_transit",
        location: "Salt Lake City, UT",
        description: "Picked up by carrier",
      },
    ],
  };

  it("requires matching live Priority1 pickup-or-later evidence", () => {
    expect(hasPersistedProviderPickupEvidence(validEvidence)).toBe(true);
    expect(
      hasPersistedProviderPickupEvidence({
        ...validEvidence,
        shipmentStatus: "delivered",
      }),
    ).toBe(true);
  });

  it("accepts order.shippedAt when tracking statuses are empty", () => {
    expect(
      hasPersistedProviderPickupEvidence({
        ...validEvidence,
        shipmentTrackingEvents: [],
        orderShippedAt: new Date("2026-07-11T18:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      hasPersistedProviderPickupEvidence({
        ...validEvidence,
        shipmentTrackingEvents: [],
        orderShippedAt: null,
      }),
    ).toBe(false);
  });

  it("rejects dry-run, pre-pickup, missing-ID, quote-mismatch, and proofless rows", () => {
    expect(
      hasPersistedProviderPickupEvidence({
        ...validEvidence,
        shipmentIsDryRun: true,
      }),
    ).toBe(false);
    expect(
      hasPersistedProviderPickupEvidence({
        ...validEvidence,
        shipmentStatus: "dispatched",
      }),
    ).toBe(false);
    expect(
      hasPersistedProviderPickupEvidence({
        ...validEvidence,
        priority1ShipmentId: null,
      }),
    ).toBe(false);
    expect(
      hasPersistedProviderPickupEvidence({
        ...validEvidence,
        shipmentQuoteId: "different",
      }),
    ).toBe(false);
    expect(
      hasPersistedProviderPickupEvidence({
        ...validEvidence,
        shipmentTrackingEvents: [],
      }),
    ).toBe(false);
  });
});
