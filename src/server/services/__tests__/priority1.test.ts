import { afterEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  PRIORITY1_DRY_RUN: "true",
  PRIORITY1_API_KEY: "dry-run-key",
  NODE_ENV: "test",
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

import {
  priority1,
  type DispatchRequest,
  type P1ShipmentStatus,
  type StatusResponse,
} from "../priority1";
import { selectPriority1Shipment } from "../priority1-selection";

function makeDispatchRequest(): DispatchRequest {
  return {
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
      date: "2026-03-11",
      startTime: "08:00",
      endTime: "17:00",
    },
    deliveryWindow: {
      date: "2026-03-18",
      startTime: "08:00",
      endTime: "17:00",
    },
    shipmentIdentifiers: [
      {
        type: "CUSTOMER_REFERENCE",
        value: "PM-SHIPTEST1",
        primaryForType: true,
      },
    ],
    quoteId: 12345,
    insuranceAmount: 0,
  };
}

function useLiveResponse(body: unknown, options?: { raw?: boolean }) {
  mockEnv.PRIORITY1_DRY_RUN = "false";
  const responseBody = options?.raw ? String(body) : JSON.stringify(body);
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: vi.fn().mockResolvedValue(responseBody),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function makeLiveDispatchResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 9001,
    shipmentIdentifiers: [
      {
        type: "CUSTOMER_REFERENCE",
        value: "PM-SHIPTEST1",
        primaryForType: true,
      },
      { type: "PRO", value: "PRO-9001", primaryForType: true },
    ],
    capacityProviderBolUrl: "https://priority1.example/bol/9001.pdf",
    capacityProviderPalletLabelUrl: null,
    capacityProviderPalletLabelExtendedUrl: null,
    capacityProviderPalletLabelsUrl: null,
    pickupNote: null,
    estimatedDeliveryDate: "2026-03-18T17:00:00.000Z",
    infoMessages: null,
    shipmentInsurance: 0,
    totalCost: 300,
    ...overrides,
  };
}

function makeLiveStatusResponse(
  overrides: Partial<P1ShipmentStatus> = {},
): StatusResponse {
  return {
    shipments: [
      {
        id: 9001,
        carrierCode: "TEST",
        carrierName: "Test Freight",
        status: "In Transit",
        actualPickupDate: "2026-03-11T12:00:00.000Z",
        actualDeliveryDate: null,
        shipmentIdentifiers: [
          {
            type: "CUSTOMER_REFERENCE",
            value: "PM-SHIPTEST1",
            primaryForType: true,
          },
        ],
        trackingStatuses: [
          {
            timeStamp: "2026-03-11T12:00:00.000Z",
            city: "Salt Lake City",
            state: "UT",
            status: "PickedUp",
            statusReason: "Picked up by carrier",
          },
        ],
        totalCost: 300,
        ...overrides,
      },
    ],
  };
}

describe("priority1 dry-run", () => {
  afterEach(() => {
    delete process.env.PRIORITY1_DRY_RUN_STATUS;
    delete process.env.VERCEL_ENV;
    mockEnv.PRIORITY1_DRY_RUN = "true";
    mockEnv.NODE_ENV = "test";
    vi.unstubAllGlobals();
  });

  it("hard-fails dry-run mode in production", async () => {
    mockEnv.NODE_ENV = "production";
    await expect(
      priority1.getRates({
        originZipCode: "84101",
        destinationZipCode: "97201",
        pickupDate: "2026-03-11T00:00:00.000Z",
        items: [],
      }),
    ).rejects.toThrow("must never be enabled in production");
  });

  it("allows dry-run mode in a Vercel preview build", async () => {
    mockEnv.NODE_ENV = "production";
    process.env.VERCEL_ENV = "preview";

    await expect(
      priority1.getSuggestedClass({
        totalWeight: 1200,
        width: 40,
        height: 48,
        length: 48,
        units: 1,
      }),
    ).resolves.toEqual({ suggestedClass: "125" });
  });

  it("does not call the live suggested-class endpoint in dry-run mode", async () => {
    await expect(
      priority1.getSuggestedClass({
        totalWeight: 1200,
        width: 40,
        height: 48,
        length: 48,
        units: 1,
      }),
    ).resolves.toEqual({ suggestedClass: "125" });
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
    const response = await priority1.dispatch(makeDispatchRequest());

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
    expect(response.shipments[0]?.trackingStatuses?.at(-1)?.status).toBe(
      "Delivered",
    );
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

describe("priority1 live response validation", () => {
  afterEach(() => {
    mockEnv.PRIORITY1_DRY_RUN = "true";
    mockEnv.NODE_ENV = "test";
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("accepts a valid suggested class and rejects malformed classes", async () => {
    useLiveResponse({ suggestedClass: "125" });
    await expect(
      priority1.getSuggestedClass({
        totalWeight: 1200,
        width: 40,
        height: 48,
        length: 48,
        units: 1,
      }),
    ).resolves.toEqual({ suggestedClass: "125" });

    useLiveResponse({ suggestedClass: "not-a-freight-class" });
    await expect(
      priority1.getSuggestedClass({
        totalWeight: 1200,
        width: 40,
        height: 48,
        length: 48,
        units: 1,
      }),
    ).rejects.toMatchObject({ name: "Priority1ApiError", status: 502 });
  });

  it("normalizes valid rate arrays and rejects malformed carrier cost", async () => {
    const validResponse = {
      id: 44,
      rateQuotes: [
        {
          id: 441,
          carrierName: "Test Freight",
          carrierCode: "TEST",
          serviceLevel: null,
          transitDays: 4,
          deliveryDate: "2026-03-18T17:00:00.000Z",
          effectiveDate: "2026-03-10T17:00:00.000Z",
          expirationDate: "2026-03-10T18:00:00.000Z",
          rateQuoteDetail: { total: 300, charges: null },
        },
      ],
      invalidRateQuotes: null,
    };
    const request = {
      originZipCode: "84101",
      destinationZipCode: "97201",
      pickupDate: "2026-03-11T00:00:00.000Z",
      items: [],
    };

    useLiveResponse(validResponse);
    const result = await priority1.getRates(request);
    expect(result.rateQuotes[0]?.rateQuoteDetail.charges).toEqual([]);
    expect(result.invalidRateQuotes).toEqual([]);

    useLiveResponse({
      ...validResponse,
      rateQuotes: [
        {
          ...validResponse.rateQuotes[0],
          rateQuoteDetail: { total: "300", charges: [] },
        },
      ],
    });
    await expect(priority1.getRates(request)).rejects.toMatchObject({
      name: "Priority1ApiError",
      status: 502,
    });

    useLiveResponse({
      ...validResponse,
      rateQuotes: [
        validResponse.rateQuotes[0],
        validResponse.rateQuotes[0],
      ],
    });
    await expect(priority1.getRates(request)).rejects.toThrow(
      "duplicate rate quote IDs",
    );
  });

  it.each([
    ["shipment ID", { id: 0 }],
    [
      "identifier type",
      {
        shipmentIdentifiers: [
          { type: "PRO_NUMBER", value: "9001", primaryForType: true },
        ],
      },
    ],
    ["shipment cost", { totalCost: -1 }],
  ])("rejects malformed dispatch %s", async (_label, override) => {
    useLiveResponse(makeLiveDispatchResponse(override));
    await expect(
      priority1.dispatch(makeDispatchRequest()),
    ).rejects.toMatchObject({ name: "Priority1ApiError", status: 502 });
  });

  it("accepts a validated live dispatch response", async () => {
    useLiveResponse(makeLiveDispatchResponse());
    const response = await priority1.dispatch(makeDispatchRequest());
    expect(response.id).toBe(9001);
    expect(response.totalCost).toBe(300);
    expect(response.shipmentIdentifiers[1]?.type).toBe("PRO");
  });

  it("rejects malformed status events before they become pickup evidence", async () => {
    useLiveResponse(
      makeLiveStatusResponse({
        trackingStatuses: [
          {
            timeStamp: "not-a-date",
            city: "Salt Lake City",
            state: "UT",
            status: "PickedUp",
            statusReason: "Picked up by carrier",
          },
        ],
      }),
    );
    await expect(
      priority1.getStatus({
        identifierType: "CUSTOMER_REFERENCE",
        identifierValue: "PM-SHIPTEST1",
      }),
    ).rejects.toMatchObject({ name: "Priority1ApiError", status: 502 });
  });

  it("rejects sentinel pickup dates before they become payout timestamps", async () => {
    useLiveResponse(
      makeLiveStatusResponse({
        actualPickupDate: "0001-01-01T00:00:00.000Z",
      }),
    );
    await expect(
      priority1.getStatus({
        identifierType: "CUSTOMER_REFERENCE",
        identifierValue: "PM-SHIPTEST1",
      }),
    ).rejects.toMatchObject({ name: "Priority1ApiError", status: 502 });
  });

  it("requires status results to match the requested identifier", async () => {
    useLiveResponse(
      makeLiveStatusResponse({
        shipmentIdentifiers: [
          {
            type: "CUSTOMER_REFERENCE",
            value: "PM-DIFFERENT",
            primaryForType: true,
          },
        ],
      }),
    );
    await expect(
      priority1.getStatus({
        identifierType: "CUSTOMER_REFERENCE",
        identifierValue: "PM-SHIPTEST1",
      }),
    ).rejects.toThrow("no returned shipment matched");
  });

  it("selects the exact persisted shipment ID from duplicate customer-reference results", () => {
    const first = makeLiveStatusResponse().shipments[0]!;
    const second = { ...first, id: 9002 };

    expect(
      selectPriority1Shipment(
        { shipments: [first, second] },
        "9002",
      )?.id,
    ).toBe(9002);
    expect(() =>
      selectPriority1Shipment({ shipments: [first, second] }),
    ).toThrow("expected exactly one Priority1 shipment candidate");
    expect(() =>
      selectPriority1Shipment({ shipments: [first, second] }, "9999"),
    ).toThrow("MANUAL_REVIEW_REQUIRED");
  });

  it("retries retryable status failures with bounded backoff", async () => {
    mockEnv.PRIORITY1_DRY_RUN = "false";
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: vi.fn().mockResolvedValue(
          JSON.stringify({ message: "temporary outage" }),
        ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        text: vi.fn().mockResolvedValue(JSON.stringify(makeLiveStatusResponse())),
      });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = priority1.getStatus({
      identifierType: "CUSTOMER_REFERENCE",
      identifierValue: "PM-SHIPTEST1",
    });
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toMatchObject({
      shipments: [{ id: 9001 }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not automatically retry dispatch mutations", async () => {
    mockEnv.PRIORITY1_DRY_RUN = "false";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
      text: vi.fn().mockResolvedValue(
        JSON.stringify({ message: "ambiguous dispatch result" }),
      ),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(priority1.dispatch(makeDispatchRequest())).rejects.toMatchObject({
      name: "Priority1ApiError",
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts a validated status response", async () => {
    useLiveResponse(makeLiveStatusResponse());
    const response = await priority1.getStatus({
      identifierType: "CUSTOMER_REFERENCE",
      identifierValue: "PM-SHIPTEST1",
    });
    expect(response.shipments[0]?.id).toBe(9001);
    expect(response.shipments[0]?.trackingStatuses?.[0]?.status).toBe(
      "PickedUp",
    );
  });

  it("rejects unsafe document URLs and malformed JSON", async () => {
    const request = {
      shipmentImageTypeId: "DeliveryReceipt" as const,
      imageFormatTypeId: "PDF" as const,
      proNumber: "PRO-9001",
    };
    useLiveResponse({ imageUrl: "javascript:alert(1)" });
    await expect(priority1.getDocuments(request)).rejects.toMatchObject({
      name: "Priority1ApiError",
      status: 502,
    });

    useLiveResponse("<html>not JSON</html>", { raw: true });
    await expect(priority1.getDocuments(request)).rejects.toThrow(
      "not valid JSON",
    );
  });

  it("accepts empty cancellation success and validates non-empty responses", async () => {
    useLiveResponse("", { raw: true });
    await expect(priority1.cancel({ id: 9001 })).resolves.toBeUndefined();

    useLiveResponse({ id: 9001, cancellationSuccess: true });
    await expect(priority1.cancel({ id: 9001 })).resolves.toBeUndefined();

    useLiveResponse({ id: 9001, cancellationSuccess: false });
    await expect(priority1.cancel({ id: 9001 })).rejects.toMatchObject({
      name: "Priority1ApiError",
      status: 502,
    });

    useLiveResponse({ id: 9999, cancellationSuccess: true });
    await expect(priority1.cancel({ id: 9001 })).rejects.toThrow(
      "did not match",
    );
  });
});
