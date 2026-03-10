import { describe, expect, it } from "vitest";
import type { P1ShipmentStatus } from "../priority1";
import {
  buildDispatchRequestForOrder,
  computePalletsNeeded,
  formatPickupDate,
  getNextBusinessDay,
  mapPriority1ShipmentStatus,
} from "../shipping-workflow";

describe("shipping-workflow", () => {
  it("computes pallets needed from quantity and pallet packing", () => {
    expect(
      computePalletsNeeded({
        quantitySqFt: 1800,
        sqFtPerBox: 20,
        boxesPerPallet: 30,
        totalPallets: 8,
      }),
    ).toBe(3);
  });

  it("formats next business day pickup date", () => {
    const friday = new Date("2026-03-13T12:00:00Z");
    const pickupDate = getNextBusinessDay(friday);

    expect(pickupDate.getUTCDay()).toBe(1);
    expect(formatPickupDate(pickupDate)).toBe("03/16/2026");
  });

  it("builds a valid dispatch request for an order", () => {
    const { pickupDate, request } = buildDispatchRequestForOrder(
      {
        order: {
          orderNumber: "PM-SHIPTEST1",
          selectedQuoteId: "12345",
          shippingAddress: "123 Buyer St",
          shippingCity: "Portland",
          shippingState: "OR",
          shippingZip: "97201",
          shippingName: "Buyer Contact",
          shippingPhone: "555-111-2222",
          quantitySqFt: 1800,
        },
        listing: {
          title: "Dry Run Oak Flooring",
          sqFtPerBox: 20,
          boxesPerPallet: 30,
          totalPallets: 8,
          freightClass: "125",
          palletWeight: 1400,
          palletLength: 48,
          palletWidth: 40,
          palletHeight: 52,
          nmfcCode: "123456",
          locationCity: "Salt Lake City",
          locationState: "UT",
          locationZip: "84101",
        },
        seller: {
          businessAddress: "500 Seller Ave",
          businessName: "Seller Supply Co",
          name: "Seller Contact",
          phone: "555-999-8888",
          email: "seller@example.com",
        },
        buyer: {
          businessName: "Buyer LLC",
          name: "Buyer User",
          phone: "555-000-1111",
          email: "buyer@example.com",
        },
      },
      new Date("2026-03-10T14:00:00Z"),
    );

    expect(formatPickupDate(pickupDate)).toBe("03/11/2026");
    expect(request.quoteId).toBe(12345);
    expect(request.lineItems[0]?.units).toBe(3);
    expect(request.lineItems[0]?.totalWeight).toBe(4200);
    expect(request.originLocation.contact.companyName).toBe("Seller Supply Co");
    expect(request.destinationLocation.contact.companyName).toBe("Buyer LLC");
    expect(request.shipmentIdentifiers[0]?.value).toBe("PM-SHIPTEST1");
  });

  it("maps in-transit updates and pickup transition correctly", () => {
    const status: P1ShipmentStatus = {
      id: 99901,
      carrierCode: "DRYF",
      carrierName: "Dry Run Freight Co.",
      status: "InTransit",
      actualPickupDate: new Date().toISOString(),
      actualDeliveryDate: null,
      shipmentIdentifiers: [],
      trackingStatuses: [
        {
          timeStamp: new Date().toISOString(),
          city: "Denver",
          state: "CO",
          postalCode: "80202",
          status: "InTransit",
          statusReason: "In transit to destination",
        },
      ],
      totalCost: 0,
    };

    const update = mapPriority1ShipmentStatus("dispatched", status);

    expect(update.mappedStatus).toBe("in_transit");
    expect(update.pickedUp).toBe(true);
    expect(update.delivered).toBe(false);
    expect(update.trackingEvents).toHaveLength(1);
  });

  it("maps delivered updates correctly", () => {
    const status: P1ShipmentStatus = {
      id: 99902,
      carrierCode: "DRYF",
      carrierName: "Dry Run Freight Co.",
      status: "Delivered",
      actualPickupDate: new Date().toISOString(),
      actualDeliveryDate: new Date().toISOString(),
      shipmentIdentifiers: [],
      trackingStatuses: [
        {
          timeStamp: new Date().toISOString(),
          city: "Portland",
          state: "OR",
          postalCode: "97201",
          status: "Delivered",
          statusReason: "Delivered to consignee",
        },
      ],
      totalCost: 0,
    };

    const update = mapPriority1ShipmentStatus("in_transit", status);

    expect(update.mappedStatus).toBe("delivered");
    expect(update.pickedUp).toBe(false);
    expect(update.delivered).toBe(true);
  });
});
