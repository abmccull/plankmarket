import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    PRIORITY1_DRY_RUN: "true",
    PRIORITY1_API_KEY: "dry-run-key",
  },
}));

import { priority1 } from "../priority1";

describe("priority1 dry-run", () => {
  afterEach(() => {
    delete process.env.PRIORITY1_DRY_RUN_STATUS;
  });

  it("returns deterministic dry-run rate quotes", async () => {
    const response = await priority1.getRates({
      originZipCode: "84101",
      destinationZipCode: "97201",
      pickupDate: "2026-03-11T00:00:00.000Z",
      items: [
        {
          freightClass: "125",
          packagingType: "Pallet",
          units: 2,
          pieces: 1,
          totalWeight: 1400,
          length: 48,
          width: 40,
          height: 52,
          isStackable: true,
          isHazardous: false,
          isUsed: false,
          isMachinery: false,
        },
      ],
    });

    expect(response.rateQuotes).toHaveLength(4);
    expect(response.rateQuotes[0]?.carrierName).toBe("Dry Run Freight Co.");
    expect(response.rateQuotes[0]?.rateQuoteDetail.total).toBeGreaterThan(0);
    expect(response.invalidRateQuotes).toEqual([]);
  });

  it("dispatches a dry-run shipment with mock ids and documents", async () => {
    const response = await priority1.dispatch({
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
      destinationLocation: {
        address: {
          addressLine1: "123 Buyer St",
          city: "Portland",
          state: "OR",
          postalCode: "97201",
          country: "US",
        },
        contact: {
          companyName: "Buyer LLC",
          contactName: "Buyer Contact",
          phoneNumber: "555-111-2222",
          email: "buyer@example.com",
        },
      },
      lineItems: [
        {
          freightClass: "125",
          packagingType: "Pallet",
          units: 2,
          pieces: 1,
          totalWeight: 2800,
          length: 48,
          width: 40,
          height: 52,
          description: "Dry Run Oak Flooring - Flooring",
          isStackable: false,
          isHazardous: false,
          isUsed: false,
        },
      ],
      pickupWindow: {
        date: "03/11/2026",
        startTime: "08:00",
        endTime: "17:00",
      },
      shipmentIdentifiers: [
        {
          type: "CUSTOMER_REFERENCE",
          value: "PM-SHIPTEST1",
          primaryForType: false,
        },
      ],
      quoteId: 12345,
      insuranceAmount: 0,
    });

    expect(response.id).toBeGreaterThanOrEqual(99000);
    expect(response.shipmentIdentifiers.some((id) => id.type === "BILL_OF_LADING")).toBe(true);
    expect(response.capacityProviderBolUrl).toContain("dry-run.local/bol");
  });

  it("supports forced dry-run tracking statuses", async () => {
    process.env.PRIORITY1_DRY_RUN_STATUS = "Delivered";

    const response = await priority1.getStatus({
      identifierType: "BILL_OF_LADING",
      identifierValue: "DRY-99901",
    });

    expect(response.shipments[0]?.status).toBe("Delivered");
    expect(response.shipments[0]?.trackingStatuses.at(-1)?.status).toBe("Delivered");
  });

  it("returns placeholder documents in dry-run mode", async () => {
    const response = await priority1.getDocuments({
      shipmentImageTypeId: "DeliveryReceipt",
      imageFormatTypeId: "PDF",
      proNumber: "DRY-99901",
    });

    expect(response.imageUrl).toContain("dry-run.local/documents/DeliveryReceipt/DRY-99901.pdf");
  });
});
