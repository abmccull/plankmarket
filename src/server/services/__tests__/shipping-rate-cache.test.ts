import { describe, expect, it, vi } from "vitest";
import {
  buildShippingRateResponseCacheKey,
  normalizePriority1RateQuotes,
  readShippingRateResponseCache,
  writeShippingRateResponseCache,
} from "../shipping-rate-cache";

describe("shipping rate response cache", () => {
  it("builds a deterministic cache key for equivalent freight inputs", () => {
    const base = {
      providerMode: "live" as const,
      listingId: "11111111-1111-4111-8111-111111111111",
      title: "Engineered Oak",
      condition: "new",
      originZip: "84101",
      destinationZip: "75001",
      pickupDate: "2026-08-03T12:00:00.000Z",
      quantitySqFt: 500,
      palletsNeeded: 2,
      piecesPerPallet: 30,
      palletWeight: 1200,
      palletLength: 48,
      palletWidth: 40,
      palletHeight: 60,
      freightClass: "125",
      nmfcCode: "123-45",
      freightPaymentMode: "seller_pays",
      sellerFreightStates: ["TX", "CO"],
      freightDropCharge: 50,
      accessorialCodes: ["LGDEL", "RESD"] as const,
    } as const;

    const first = buildShippingRateResponseCacheKey(base);
    const second = buildShippingRateResponseCacheKey({
      ...base,
      sellerFreightStates: ["CO", "TX"],
    });

    expect(first).toBe(second);
    expect(first.startsWith("shipping-rate-response:")).toBe(true);
  });

  it("isolates dry-run and live cache keys for the same freight inputs", () => {
    const base = {
      providerMode: "live" as const,
      listingId: "11111111-1111-4111-8111-111111111111",
      title: "Engineered Oak",
      condition: "new",
      originZip: "84101",
      destinationZip: "75001",
      pickupDate: "2026-08-03T12:00:00.000Z",
      quantitySqFt: 500,
      palletsNeeded: 2,
      piecesPerPallet: 30,
      palletWeight: 1200,
      palletLength: 48,
      palletWidth: 40,
      palletHeight: 60,
      freightClass: "125",
      nmfcCode: "123-45",
      freightPaymentMode: "seller_pays",
      sellerFreightStates: ["TX", "CO"],
      freightDropCharge: 50,
      accessorialCodes: ["LGDEL", "RESD"] as const,
    };

    const liveKey = buildShippingRateResponseCacheKey(base);
    const dryRunKey = buildShippingRateResponseCacheKey({
      ...base,
      providerMode: "dry_run",
    });

    expect(liveKey).not.toBe(dryRunKey);
  });

  it("normalizes and filters invalid, expired, or unbookable provider quotes", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    const pickupDate = new Date("2026-08-03T09:00:00.000Z");

    const quotes = normalizePriority1RateQuotes({
      now,
      pickupDate,
      quotes: [
        {
          id: 101,
          carrierName: "Carrier A",
          carrierCode: "CARA",
          transitDays: 3,
          deliveryDate: "2026-08-06T18:00:00.000Z",
          // 45m residual — above 20m offer buffer
          expirationDate: "2026-07-31T12:45:00.000Z",
          rateQuoteDetail: { total: 480 },
        },
        {
          id: 102,
          carrierName: "Expired",
          carrierCode: "EXPR",
          transitDays: 4,
          deliveryDate: "2026-08-07T18:00:00.000Z",
          expirationDate: "2026-07-31T11:59:00.000Z",
          rateQuoteDetail: { total: 500 },
        },
        {
          id: 103,
          carrierName: "Near expiry",
          carrierCode: "NEAR",
          transitDays: 2,
          deliveryDate: "2026-08-05T18:00:00.000Z",
          // Within the 20-minute offer buffer — not mintable.
          expirationDate: "2026-07-31T12:15:00.000Z",
          rateQuoteDetail: { total: 450 },
        },
        {
          id: 104,
          carrierName: "Missing expiry",
          carrierCode: "MISS",
          transitDays: 3,
          deliveryDate: "2026-08-06T18:00:00.000Z",
          expirationDate: null,
          rateQuoteDetail: { total: 400 },
        },
        {
          id: 105,
          carrierName: "Zero rate",
          carrierCode: "ZERO",
          transitDays: 3,
          deliveryDate: "2026-08-06T18:00:00.000Z",
          expirationDate: "2026-07-31T12:45:00.000Z",
          rateQuoteDetail: { total: 0 },
        },
      ],
    });

    expect(quotes).toEqual([
      {
        quoteId: 101,
        carrierName: "Carrier A",
        carrierScac: "CARA",
        carrierRate: 480,
        transitDays: 3,
        estimatedDelivery: "2026-08-06T18:00:00.000Z",
        quoteExpiresAt: "2026-07-31T12:45:00.000Z",
      },
    ]);
  });

  it("writes and reads only still-valid cached quotes", async () => {
    const set = vi.fn();
    const get = vi.fn();
    const redisClient = { set, get };
    const now = new Date("2026-07-31T12:00:00.000Z");
    const cacheKey = "shipping-rate-response:test";
    const quotes = [
      {
        quoteId: 101,
        carrierName: "Carrier A",
        carrierScac: "CARA",
        carrierRate: 480,
        transitDays: 3,
        estimatedDelivery: "2026-08-06T18:00:00.000Z",
        // 45m residual → 25m offer-bookable residual = 1500s → cap 600
        quoteExpiresAt: "2026-07-31T12:45:00.000Z",
      },
      {
        quoteId: 102,
        carrierName: "Carrier B",
        carrierScac: "CARB",
        carrierRate: 520,
        transitDays: 4,
        estimatedDelivery: "2026-08-07T18:00:00.000Z",
        quoteExpiresAt: "2026-07-31T11:59:00.000Z",
      },
    ];

    await writeShippingRateResponseCache({
      redisClient: redisClient as never,
      cacheKey,
      providerMode: "live",
      quotes,
      now,
    });

    expect(set).toHaveBeenCalledWith(
      cacheKey,
      JSON.stringify({
        version: 2,
        providerMode: "live",
        quotes: [quotes[0]],
      }),
      { ex: 600 },
    );

    // Mixed payload is treated as a miss (any thinning forces re-quote).
    get.mockResolvedValueOnce(
      JSON.stringify({
        version: 2,
        providerMode: "live",
        quotes,
      }),
    );

    await expect(
      readShippingRateResponseCache({
        redisClient: redisClient as never,
        cacheKey,
        providerMode: "live",
        now,
      }),
    ).resolves.toBeNull();

    get.mockResolvedValueOnce(
      JSON.stringify({
        version: 2,
        providerMode: "live",
        quotes: [quotes[0]],
      }),
    );

    await expect(
      readShippingRateResponseCache({
        redisClient: redisClient as never,
        cacheKey,
        providerMode: "live",
        now,
      }),
    ).resolves.toEqual([quotes[0]]);
  });

  it("treats legacy v1 payloads as cache misses", async () => {
    const get = vi.fn().mockResolvedValue(
      JSON.stringify({
        version: 1,
        quotes: [
          {
            quoteId: 101,
            carrierName: "Carrier A",
            carrierScac: "CARA",
            carrierRate: 480,
            transitDays: 3,
            estimatedDelivery: "2026-08-06T18:00:00.000Z",
            quoteExpiresAt: "2026-07-31T12:45:00.000Z",
          },
        ],
      }),
    );

    await expect(
      readShippingRateResponseCache({
        redisClient: { get } as never,
        cacheKey: "shipping-rate-response:test",
        providerMode: "live",
        now: new Date("2026-07-31T12:00:00.000Z"),
      }),
    ).resolves.toBeNull();
  });
});
