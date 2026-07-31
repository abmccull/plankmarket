import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/plankmarket_test";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_123";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_123";
process.env.UPLOADTHING_TOKEN ??= "uploadthing-test";
process.env.UPSTASH_REDIS_REST_URL ??= "https://example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ??= "upstash-token";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= "pk_test_123";

const {
  decideObservationAcceptance,
  decideInventorySync,
  inventoryAdjustmentIdempotencyKey,
  inventoryIngestPayloadSchema,
} = await import("@/server/services/inventory-ingestion");
const {
  createInventoryRequestSignature,
  generateInventoryApiKey,
  hashInventoryApiKey,
  inventorySignaturePayload,
} = await import("@/server/security/inventory-api-key");

describe("inventory ingest validation", () => {
  it("accepts a bounded feed item with an optional listing binding", () => {
    const result = inventoryIngestPayloadSchema.safeParse({
      items: [
        {
          externalItemId: "ERP/SKU-123",
          listingId: "11111111-1111-4111-8111-111111111111",
          availableSqFt: 2500.5,
          observedAt: "2026-07-30T12:30:00-06:00",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects duplicate external item IDs in one batch", () => {
    const result = inventoryIngestPayloadSchema.safeParse({
      items: [
        { externalItemId: "SKU-1", availableSqFt: 100 },
        { externalItemId: "SKU-1", availableSqFt: 90 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantities and batches over the hard limit", () => {
    expect(
      inventoryIngestPayloadSchema.safeParse({
        items: [{ externalItemId: "SKU-1", availableSqFt: -1 }],
      }).success,
    ).toBe(false);
    expect(
      inventoryIngestPayloadSchema.safeParse({
        items: Array.from({ length: 101 }, (_, index) => ({
          externalItemId: `SKU-${index}`,
          availableSqFt: index,
        })),
      }).success,
    ).toBe(false);
  });
});

describe("inventory reservation safety", () => {
  it("routes a differing feed value to reconciliation while stock is reserved", () => {
    expect(
      decideInventorySync({
        marketplaceQuantity: 600,
        reportedQuantity: 1_000,
        reservedQuantity: 400,
      }),
    ).toBe("reconcile");
  });

  it("does not apply even an equal observation while stock is reserved", () => {
    expect(
      decideInventorySync({
        marketplaceQuantity: 600,
        reportedQuantity: 600,
        reservedQuantity: 400,
      }),
    ).toBe("reconcile");
  });

  it("applies a changed value only when there is no reservation", () => {
    expect(
      decideInventorySync({
        marketplaceQuantity: 600,
        reportedQuantity: 1_000,
        reservedQuantity: 0,
      }),
    ).toBe("apply");
    expect(
      decideInventorySync({
        marketplaceQuantity: 600,
        reportedQuantity: 600.00001,
        reservedQuantity: 0,
      }),
    ).toBe("unchanged");
  });
});

describe("inventory observation ordering", () => {
  const now = new Date("2026-07-30T18:00:00.000Z");

  it("accepts a current observation", () => {
    expect(
      decideObservationAcceptance({
        observedAt: new Date("2026-07-30T17:59:00.000Z"),
        latestAcceptedAt: new Date("2026-07-30T17:00:00.000Z"),
        now,
      }),
    ).toBe("accept");
  });

  it("rejects an observation older than the latest accepted source value", () => {
    expect(
      decideObservationAcceptance({
        observedAt: new Date("2026-07-30T16:00:00.000Z"),
        latestAcceptedAt: new Date("2026-07-30T17:00:00.000Z"),
        now,
      }),
    ).toBe("stale_observation");
  });

  it("rejects a timestamp more than five minutes in the future", () => {
    expect(
      decideObservationAcceptance({
        observedAt: new Date("2026-07-30T18:05:00.001Z"),
        latestAcceptedAt: null,
        now,
      }),
    ).toBe("invalid_observation_time");
  });
});

describe("inventory credential and idempotency helpers", () => {
  it("generates a one-time plaintext key represented by only a SHA-256 digest and hint", () => {
    const key = generateInventoryApiKey();
    expect(key.plaintext).toMatch(/^pm_inv_/);
    expect(key.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(key.hash).toBe(hashInventoryApiKey(key.plaintext));
    expect(key.hint).not.toContain(key.plaintext);
    expect(key.hint).toContain(key.plaintext.slice(-6));
  });

  it("derives the legacy signed-request bytes deterministically from the key digest", () => {
    const apiKey = "pm_inv_test_inventory_api_key_1234567890";
    const timestamp = "1785441600";
    const deliveryId = "22222222-2222-4222-8222-222222222222";
    const rawBody = new TextEncoder().encode(
      '{"items":[{"externalItemId":"SKU-1","availableSqFt":100}]}',
    );
    const expected = createHmac("sha256", hashInventoryApiKey(apiKey))
      .update(inventorySignaturePayload({ timestamp, deliveryId, rawBody }))
      .digest("hex");
    expect(
      createInventoryRequestSignature({
        apiKey,
        timestamp,
        deliveryId,
        rawBody,
      }),
    ).toBe(expected);
  });

  it("derives stable adjustment idempotency without exposing source values", () => {
    const first = inventoryAdjustmentIdempotencyKey({
      sourceId: "source-1",
      batchIdempotencyKey: "batch-1",
      externalItemId: "SKU-1",
    });
    const replay = inventoryAdjustmentIdempotencyKey({
      sourceId: "source-1",
      batchIdempotencyKey: "batch-1",
      externalItemId: "SKU-1",
    });
    const other = inventoryAdjustmentIdempotencyKey({
      sourceId: "source-1",
      batchIdempotencyKey: "batch-2",
      externalItemId: "SKU-1",
    });
    expect(first).toBe(replay);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("SKU-1");
  });
});
