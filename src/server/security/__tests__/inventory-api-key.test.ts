import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/plankmarket_test";

const mocks = vi.hoisted(() => ({
  selected: [] as Array<Record<string, unknown>>,
  select: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    select: mocks.select,
  },
}));

const {
  authenticateInventoryRequest,
  createInventoryRequestSignature,
  generateInventoryApiKey,
} = await import("@/server/security/inventory-api-key");

function configureSelect(rows: Array<Record<string, unknown>>) {
  mocks.selected = rows;
  mocks.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

describe("inventory request authentication", () => {
  const keyRotatedAt = new Date("2026-07-30T17:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts an active bearer source without returning the stored digest", async () => {
    const key = generateInventoryApiKey();
    configureSelect([
      {
        id: "11111111-1111-4111-8111-111111111111",
        sellerId: "22222222-2222-4222-8222-222222222222",
        authMode: "bearer",
        status: "active",
        keyRotatedAt,
      },
    ]);
    const result = await authenticateInventoryRequest({
      headers: new Headers({ authorization: `bearer ${key.plaintext}` }),
      rawBody: new Uint8Array(),
    });
    expect(result).toEqual({
      ok: true,
      source: {
        id: "11111111-1111-4111-8111-111111111111",
        sellerId: "22222222-2222-4222-8222-222222222222",
        authMode: "bearer",
        status: "active",
        keyRotatedAt,
      },
    });
    expect(JSON.stringify(result)).not.toContain(key.hash);
    expect(JSON.stringify(result)).not.toContain(key.plaintext);
  });

  it("rejects bearer access when the source requires signed requests", async () => {
    const key = generateInventoryApiKey();
    configureSelect([
      {
        id: "11111111-1111-4111-8111-111111111111",
        sellerId: "22222222-2222-4222-8222-222222222222",
        authMode: "signed",
        status: "active",
        keyRotatedAt,
      },
    ]);
    await expect(
      authenticateInventoryRequest({
        headers: new Headers({ authorization: `Bearer ${key.plaintext}` }),
        rawBody: new Uint8Array(),
      }),
    ).resolves.toEqual({
      ok: false,
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
  });

  it("rejects signed request headers with a generic credential error", async () => {
    const key = generateInventoryApiKey();
    const sourceId = "11111111-1111-4111-8111-111111111111";
    const sellerId = "22222222-2222-4222-8222-222222222222";
    const deliveryId = "33333333-3333-4333-8333-333333333333";
    const timestamp = "1785441600";
    const rawBody = new TextEncoder().encode(
      '{"items":[{"externalItemId":"SKU-1","availableSqFt":100}]}',
    );
    configureSelect([
      {
        id: sourceId,
        sellerId,
        authMode: "signed",
        status: "active",
        apiKeyHash: key.hash,
        keyRotatedAt,
      },
    ]);
    const signature = createInventoryRequestSignature({
      apiKey: key.plaintext,
      timestamp,
      deliveryId,
      rawBody,
    });
    const result = await authenticateInventoryRequest({
      headers: new Headers({
        "x-plankmarket-source-id": sourceId,
        "x-plankmarket-delivery-id": deliveryId,
        "x-plankmarket-timestamp": timestamp,
        "x-plankmarket-signature": signature,
      }),
      rawBody,
      now: new Date(Number(timestamp) * 1000),
    });
    expect(result).toEqual({
      ok: false,
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
  });
});
