import { describe, expect, it } from "vitest";
import type { P1ShipmentStatus } from "../priority1";
import {
  buildDispatchRequestForOrder,
  computePalletsNeeded,
  formatPickupDate,
  freightFundingMatchesQuotedTerms,
  getSellerFreightFundingIneligibilityReason,
  getOrderDispatchIneligibilityReason,
  getNextBusinessDay,
  freightSnapshotMatchesListing,
  getShipmentIdentifier,
  getShippingBookingSnapshotKeyByToken,
  requireLiveDispatchShipmentId,
  isQuoteBookable,
  mapPriority1ShipmentStatus,
  mergeTrackingEvents,
  parseNmfcCode,
  quoteArtifactTtlSeconds,
  requireShippingStateMatchesZip,
  requireShippingBookingSnapshotForOrder,
  resolveListingFreightFunding,
  resolveUsStateForZip,
  selectTopShippingQuotes,
  shouldEmitProviderPickupEvent,
  type ShippingBookingSnapshot,
} from "../shipping-workflow";

function snapshot(
  overrides: Partial<ShippingBookingSnapshot> = {},
): ShippingBookingSnapshot {
  return {
    version: 1,
    quoteId: 12345,
    listingId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    buyerId: "b1b2c3d4-e5f6-7890-abcd-ef1234567890",
    quantitySqFt: 1800,
    destinationZip: "97201",
    carrierName: "Dry Run Freight Co.",
    carrierScac: "DRYF",
    carrierRate: 300,
    shippingPrice: 375,
    accessorialCodes: [],
    transitDays: 5,
    quoteExpiresAt: "2027-03-11T00:00:00.000Z",
    originLocation: {
      address: {
        addressLine1: "500 Seller Ave",
        city: "Salt Lake City",
        state: "UT",
        postalCode: "84101",
        country: "US",
      },
      contact: {
        companyName: "Seller Supply Co",
        contactName: "Seller Contact",
        phoneNumber: "555-999-8888",
        email: "seller@example.com",
      },
    },
    lineItems: [
      {
        freightClass: "125",
        packagingType: "Pallet",
        units: 3,
        pieces: 1,
        totalWeight: 4200,
        length: 48,
        width: 40,
        height: 52,
        description: "Dry Run Oak Flooring - Flooring",
        isStackable: false,
        isHazardous: false,
        isUsed: false,
        nmfcItemCode: "123456",
        nmfcSubCode: "01",
      },
    ],
    pickupWindow: { date: "2026-03-11", startTime: "08:00", endTime: "17:00" },
    deliveryWindow: { date: "2026-03-18", startTime: "08:00", endTime: "17:00" },
    ...overrides,
  };
}

function providerStatus(
  status: string,
  overrides: Partial<P1ShipmentStatus> = {},
): P1ShipmentStatus {
  return {
    id: 99901,
    carrierCode: "DRYF",
    carrierName: "Dry Run Freight Co.",
    status,
    actualPickupDate: null,
    actualDeliveryDate: null,
    shipmentIdentifiers: [],
    trackingStatuses: [],
    totalCost: 300,
    ...overrides,
  };
}

describe("shipping-workflow", () => {
  it("resolves nationwide seller-funded freight from the persisted listing shape", () => {
    expect(
      resolveListingFreightFunding({
        listing: {
          freightPaymentMode: "seller_pays",
          sellerFreightStates: [],
          freightDropCharge: 125,
        },
        fullFreightCharge: 875,
        destinationState: "OR",
      }),
    ).toMatchObject({
      appliedMode: "seller_pays",
      buyerFreightCharge: 125,
      sellerFreightContribution: 750,
    });
  });

  it("uses non-empty seller freight states as selected-state sponsorship", () => {
    const listing = {
      freightPaymentMode: "seller_pays" as const,
      sellerFreightStates: ["CO", "NM"],
      freightDropCharge: 75,
    };

    expect(
      resolveListingFreightFunding({
        listing,
        fullFreightCharge: 725,
        destinationState: "CO",
      }),
    ).toMatchObject({
      appliedMode: "seller_pays_selected_states",
      buyerFreightCharge: 75,
      sellerFreightContribution: 650,
    });
    expect(
      resolveListingFreightFunding({
        listing,
        fullFreightCharge: 725,
        destinationState: "UT",
      }),
    ).toMatchObject({
      appliedMode: "buyer_pays",
      buyerFreightCharge: 725,
      sellerFreightContribution: 0,
    });
  });

  it("fails closed to buyer-funded freight for malformed persisted config", () => {
    expect(
      resolveListingFreightFunding({
        listing: {
          freightPaymentMode: "seller_pays",
          sellerFreightStates: { state: "OR" },
          freightDropCharge: 100,
        },
        fullFreightCharge: 500,
        destinationState: "OR",
      }),
    ).toMatchObject({
      appliedMode: "buyer_pays",
      buyerFreightCharge: 500,
      sellerFreightContribution: 0,
    });
  });

  it("normalizes the destination state from ZIP and rejects mismatched address state", () => {
    expect(resolveUsStateForZip("97201-1234")).toBe("OR");
    expect(
      requireShippingStateMatchesZip({
        shippingState: " or ",
        shippingZip: "97201",
      }),
    ).toBe("OR");
    expect(() =>
      requireShippingStateMatchesZip({
        shippingState: "WA",
        shippingZip: "97201",
      }),
    ).toThrow("does not match");
  });

  it("blocks seller-funded freight that would leave no transferable payout", () => {
    expect(
      getSellerFreightFundingIneligibilityReason({
        sellerFreightContribution: 900,
        sellerPayout: 0,
      }),
    ).toContain("no transferable seller payout");
    expect(
      getSellerFreightFundingIneligibilityReason({
        sellerFreightContribution: 900,
        sellerPayout: -25,
      }),
    ).toContain("buyer drop charge");
    expect(
      getSellerFreightFundingIneligibilityReason({
        sellerFreightContribution: 0,
        sellerPayout: -0.3,
      }),
    ).toBeNull();
  });

  it("requires order-time freight funding to match the buyer's quoted terms", () => {
    const applied = resolveListingFreightFunding({
      listing: {
        freightPaymentMode: "seller_pays",
        sellerFreightStates: [],
        freightDropCharge: 125,
      },
      fullFreightCharge: 875,
      destinationState: "OR",
    });

    expect(
      freightFundingMatchesQuotedTerms({
        applied,
        quoted: {
          freightFundingMode: "seller_pays",
          buyerFreightCharge: 125,
          sellerFreightContribution: 750,
        },
      }),
    ).toBe(true);
    expect(
      freightFundingMatchesQuotedTerms({
        applied,
        quoted: {
          freightFundingMode: "buyer_pays",
          buyerFreightCharge: 875,
          sellerFreightContribution: 0,
        },
      }),
    ).toBe(false);
  });

  it("requires paid held inventory with no dispute immediately before dispatch", () => {
    const eligible = {
      paymentStatus: "succeeded",
      escrowStatus: "held",
      orderStatus: "confirmed",
      inventoryReleasedAt: null,
      hasOpenDispute: false,
    };
    expect(getOrderDispatchIneligibilityReason(eligible)).toBeNull();
    expect(
      getOrderDispatchIneligibilityReason({
        ...eligible,
        escrowStatus: "refunded",
      }),
    ).toContain("hold status");
    expect(
      getOrderDispatchIneligibilityReason({
        ...eligible,
        hasOpenDispute: true,
      }),
    ).toContain("open dispute");
    expect(
      getOrderDispatchIneligibilityReason({
        ...eligible,
        inventoryReleasedAt: new Date(),
      }),
    ).toContain("inventory");
  });
  it("computes pallets only from complete server-owned packing data", () => {
    expect(
      computePalletsNeeded({
        quantitySqFt: 1800,
        sqFtPerBox: 20,
        boxesPerPallet: 30,
        totalPallets: 8,
      }),
    ).toBe(3);
    expect(() =>
      computePalletsNeeded({
        quantitySqFt: 1800,
        sqFtPerBox: null,
        boxesPerPallet: 30,
        totalPallets: 8,
      }),
    ).toThrow("incomplete");
  });

  it("formats Priority1 date windows as yyyy-MM-dd in freight business TZ", () => {
    // Friday noon UTC = Friday in America/Chicago
    const friday = new Date("2026-03-13T12:00:00Z");
    const pickupDate = getNextBusinessDay(friday);
    expect(pickupDate.getUTCDay()).toBe(1); // Monday
    expect(formatPickupDate(pickupDate)).toBe("2026-03-16");
  });

  it("does not advance the business day for late US evenings on UTC hosts", () => {
    // Thursday 11pm America/Chicago ≈ Friday 04:00 UTC
    const thursdayEveningChicago = new Date("2026-03-13T04:00:00Z");
    const pickupDate = getNextBusinessDay(thursdayEveningChicago);
    // Next business day from Thursday Chicago is Friday, not Monday
    expect(formatPickupDate(pickupDate)).toBe("2026-03-13");
    expect(pickupDate.getUTCDay()).toBe(5);
  });

  it("skips US freight holidays when computing next business day", () => {
    // 2026-07-03 is July 4 observed (Friday). From Thu Jul 2, next business is Mon Jul 6.
    const beforeHoliday = new Date("2026-07-02T17:00:00Z");
    const pickupDate = getNextBusinessDay(beforeHoliday);
    expect(formatPickupDate(pickupDate)).toBe("2026-07-06");
  });

  it("refuses to treat a missing or non-positive Priority1 id as a live booking", () => {
    expect(() => requireLiveDispatchShipmentId(undefined)).toThrow(
      /did not include a shipment ID/,
    );
    expect(() => requireLiveDispatchShipmentId(0)).toThrow(
      /did not include a shipment ID/,
    );
    expect(() => requireLiveDispatchShipmentId("45110272")).toThrow(
      /did not include a shipment ID/,
    );
    expect(requireLiveDispatchShipmentId(45110272)).toBe(45110272);
  });

  it("prefers the primary non-null shipment identifier", () => {
    expect(
      getShipmentIdentifier(
        [
          { type: "PRO", value: null, primaryForType: false },
          { type: "PRO", value: "REAL-PRO", primaryForType: true },
          { type: "PRO", value: "OTHER-PRO", primaryForType: false },
        ],
        "PRO",
      ),
    ).toBe("REAL-PRO");
    expect(
      getShipmentIdentifier(
        [{ type: "BILL_OF_LADING", value: null, primaryForType: true }],
        "BILL_OF_LADING",
      ),
    ).toBeUndefined();
  });

  it("rejects freight snapshot drift against the current listing", () => {
    const current = snapshot();
    expect(
      freightSnapshotMatchesListing({
        snapshot: current,
        listing: {
          locationZip: "84101",
          freightClass: "125",
          palletWeight: 1400,
          palletLength: 48,
          palletWidth: 40,
          palletHeight: 52,
        },
        palletsNeeded: 3,
      }),
    ).toBe(true);
    expect(
      freightSnapshotMatchesListing({
        snapshot: current,
        listing: {
          locationZip: "84101",
          freightClass: "70",
          palletWeight: 1400,
          palletLength: 48,
          palletWidth: 40,
          palletHeight: 52,
        },
        palletsNeeded: 3,
      }),
    ).toBe(false);
  });

  it("only emits NMFC fields when item and subcode are paired", () => {
    expect(parseNmfcCode("123456")).toBeUndefined();
    expect(parseNmfcCode("123456-01")).toEqual({
      nmfcItemCode: "123456",
      nmfcSubCode: "01",
    });
  });

  it("builds dispatch from the immutable quote snapshot", () => {
    const { pickupDate, request } = buildDispatchRequestForOrder(
      {
        order: {
          orderNumber: "PM-SHIPTEST1",
          selectedQuoteId: "12345",
          shippingAddress: "123 Buyer St",
          shippingCity: "Portland",
          shippingState: "OR",
          shippingZip: "97201-1234",
          shippingName: "Buyer Contact",
          shippingPhone: "555-111-2222",
        },
        buyer: {
          businessName: "Buyer LLC",
          name: "Buyer User",
          phone: "555-000-1111",
          email: "buyer@example.com",
        },
        snapshot: snapshot(),
      },
      new Date("2026-03-10T14:00:00Z"),
    );

    expect(formatPickupDate(pickupDate)).toBe("2026-03-11");
    expect(request.quoteId).toBe(12345);
    expect(request.pickupWindow.date).toBe("2026-03-11");
    expect(request.deliveryWindow.date).toBe("2026-03-18");
    expect(request.destinationLocation.address.postalCode).toBe("97201");
    expect(request.lineItems[0]?.isStackable).toBe(false);
    expect(request.lineItems[0]?.nmfcSubCode).toBe("01");
  });

  it("validates the durable snapshot against order pricing and expiry", () => {
    const durableSnapshot = snapshot();
    const order = {
      selectedQuoteId: "12345",
      listingId: durableSnapshot.listingId,
      buyerId: durableSnapshot.buyerId,
      quantitySqFt: "1800.0000",
      shippingZip: "97201-1234",
      carrierRate: "300.0000",
      shippingPrice: "375.0000",
      selectedCarrier: "Dry Run Freight Co.",
      quoteExpiresAt: new Date(durableSnapshot.quoteExpiresAt),
    };

    expect(
      requireShippingBookingSnapshotForOrder({
        snapshot: durableSnapshot,
        order,
        now: new Date("2026-03-10T14:00:00Z"),
      }),
    ).toEqual(durableSnapshot);
    expect(() =>
      requireShippingBookingSnapshotForOrder({
        snapshot: durableSnapshot,
        order: { ...order, carrierRate: "299.0000" },
        now: new Date("2026-03-10T14:00:00Z"),
      }),
    ).toThrow("MANUAL_REVIEW_REQUIRED");
    expect(() =>
      requireShippingBookingSnapshotForOrder({
        snapshot: durableSnapshot,
        order,
        now: new Date("2027-03-11T00:00:00Z"),
      }),
    ).toThrow("re-quote");
  });

  it("maps out-for-delivery before delivered and maps cancellation", () => {
    expect(
      mapPriority1ShipmentStatus(
        "in_transit",
        providerStatus("Out for Delivery"),
      ).mappedStatus,
    ).toBe("out_for_delivery");
    expect(
      mapPriority1ShipmentStatus("in_transit", providerStatus("Canceled"))
        .mappedStatus,
    ).toBe("cancelled");
  });

  it("treats a first delivered observation as provider-confirmed pickup", () => {
    const update = mapPriority1ShipmentStatus(
      "dispatched",
      providerStatus("Delivered", {
        actualPickupDate: "2026-03-11T16:00:00.000Z",
        actualDeliveryDate: "2026-03-14T17:00:00.000Z",
      }),
    );
    expect(update.mappedStatus).toBe("delivered");
    expect(update.pickupConfirmed).toBe(true);
    expect(update.pickupConfirmedAt?.toISOString()).toBe(
      "2026-03-11T16:00:00.000Z",
    );
    expect(update.deliveredAt?.toISOString()).toBe(
      "2026-03-14T17:00:00.000Z",
    );
  });

  it("uses only pickup-or-later provider events for the pickup timestamp", () => {
    const update = mapPriority1ShipmentStatus(
      "dispatched",
      providerStatus("In Transit", {
        trackingStatuses: [
          {
            status: "Dispatched",
            statusReason: "Carrier accepted booking",
            timeStamp: "2026-03-11T10:00:00.000Z",
            city: "Denver",
            state: "CO",
          },
          {
            status: "In Transit",
            statusReason: "Picked up",
            timeStamp: "2026-03-11T12:00:00.000Z",
            city: "Denver",
            state: "CO",
          },
        ],
      }),
    );

    expect(update.pickupConfirmedAt?.toISOString()).toBe(
      "2026-03-11T12:00:00.000Z",
    );
  });

  it("does not treat status-only provider progress as pickup evidence", () => {
    const update = mapPriority1ShipmentStatus(
      "dispatched",
      providerStatus("Out for Delivery"),
    );

    expect(update.mappedStatus).toBe("out_for_delivery");
    expect(update.pickupConfirmed).toBe(false);
    expect(update.pickupConfirmedAt).toBeNull();
  });

  it("never emits a payout-triggering pickup event in dry-run or terminal orders", () => {
    const statusUpdate = mapPriority1ShipmentStatus(
      "dispatched",
      providerStatus("In Transit", {
        trackingStatuses: [
          {
            status: "PickedUp",
            statusReason: "Picked up by carrier",
            timeStamp: "2026-03-11T12:00:00.000Z",
            city: "Denver",
            state: "CO",
          },
        ],
      }),
    );
    expect(
      shouldEmitProviderPickupEvent({
        statusUpdate,
        orderStatus: "confirmed",
        shippedAt: null,
        dryRun: false,
      }),
    ).toBe(true);
    expect(
      shouldEmitProviderPickupEvent({
        statusUpdate,
        orderStatus: "confirmed",
        shippedAt: null,
        dryRun: true,
      }),
    ).toBe(false);
    expect(
      shouldEmitProviderPickupEvent({
        statusUpdate,
        orderStatus: "refunded",
        shippedAt: null,
        dryRun: false,
      }),
    ).toBe(false);
    expect(
      shouldEmitProviderPickupEvent({
        statusUpdate: mapPriority1ShipmentStatus(
          "dispatched",
          providerStatus("In Transit"),
        ),
        orderStatus: "confirmed",
        shippedAt: null,
        dryRun: false,
      }),
    ).toBe(false);
  });

  it("merges tracking history without dropping or duplicating events", () => {
    const first = {
      timestamp: "2026-03-11T16:00:00.000Z",
      status: "in_transit",
      location: "Denver, CO",
      description: "Picked up",
    };
    const second = {
      timestamp: "2026-03-12T16:00:00.000Z",
      status: "out_for_delivery",
      location: "Portland, OR",
      description: "Out for delivery",
    };
    expect(mergeTrackingEvents([first], [first, second])).toEqual([
      first,
      second,
    ]);
  });

  it("isQuoteBookable enforces the configured safety buffer", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    // Default dispatch buffer = 5m
    expect(isQuoteBookable("2026-07-31T12:10:00.000Z", now)).toBe(true);
    expect(isQuoteBookable("2026-07-31T12:04:00.000Z", now)).toBe(false);
    expect(isQuoteBookable("2026-07-31T11:59:00.000Z", now)).toBe(false);
  });

  it("quoteArtifactTtlSeconds caps to offer-bookable residual (minus 20m buffer)", () => {
    const now = Date.parse("2026-07-31T12:00:00.000Z");
    // Within offer buffer (20m) → unbookable for mint
    expect(quoteArtifactTtlSeconds("2026-07-31T12:15:00.000Z", now)).toBeNull();
    // 60m residual → 40m offer-bookable residual = 2400s → capped 1800
    expect(quoteArtifactTtlSeconds("2026-07-31T13:00:00.000Z", now)).toBe(1800);
    // 40m residual → 20m offer-bookable residual = 1200s
    expect(
      quoteArtifactTtlSeconds("2026-07-31T12:40:00.000Z", now, 1800),
    ).toBe(1200);
  });

  it("scopes booking snapshots by quote token", () => {
    expect(getShippingBookingSnapshotKeyByToken("abc")).toBe(
      "shipping-booking-snapshot:token:abc",
    );
  });

  it("selectTopShippingQuotes picks cheapest, fastest, and best value", () => {
    const selected = selectTopShippingQuotes(
      [
        { quoteId: 1, shippingPrice: 100, transitDays: 5 },
        { quoteId: 2, shippingPrice: 200, transitDays: 1 },
        { quoteId: 3, shippingPrice: 150, transitDays: 3 },
        { quoteId: 4, shippingPrice: 180, transitDays: 2 },
      ],
      3,
    );
    expect(selected.map((q) => q.quoteId)).toEqual([1, 3, 2]);
  });
});
