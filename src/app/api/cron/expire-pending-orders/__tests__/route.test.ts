/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(), transaction: vi.fn(), retrieve: vi.fn(), cancel: vi.fn(),
  get: vi.fn(), set: vi.fn(), del: vi.fn(), eval: vi.fn(), release: vi.fn(), reconcile: vi.fn(),
}));
vi.mock("@/env", () => ({ env: { CRON_SECRET: "expiry-test-secret" } }));
vi.mock("@/server/db", () => ({ db: { query: { orders: { findMany: mocks.findMany } }, transaction: mocks.transaction } }));
vi.mock("@/lib/stripe", () => ({ stripe: { paymentIntents: { retrieve: mocks.retrieve, cancel: mocks.cancel } } }));
vi.mock("@/lib/redis/client", () => ({ redis: { get: mocks.get, set: mocks.set, del: mocks.del, eval: mocks.eval } }));
vi.mock("@/server/services/inventory-reservation", () => ({ releaseReservedInventory: mocks.release }));
vi.mock("@/server/services/reconciliation-cases", () => ({ openReconciliationCase: mocks.reconcile }));
const { GET } = await import("../route");
const request = () => new NextRequest("https://plankmarket.com/api/cron/expire-pending-orders", { headers: { authorization: "Bearer expiry-test-secret" } });
const row = (n: number) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, createdAt: new Date("2026-01-01T00:00:00.123Z"), expiryCursorCreatedAt: "2026-01-01 00:00:00.123456+00", status: "pending", paymentStatus: "pending", totalPrice: "100", stripePaymentIntentId: `pi_${n}`, inventoryReleasedAt: null });

describe("pending expiry fairness and payment safety", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.set.mockResolvedValue("OK"); mocks.get.mockResolvedValue(null);
    mocks.eval.mockResolvedValue(1); mocks.del.mockResolvedValue(1);
    mocks.reconcile.mockResolvedValue(undefined);
  });

  it("advances beyond 25 captured payments and expires a later unpaid order", async () => {
    const skipped = Array.from({ length: 25 }, (_, i) => row(i + 1));
    mocks.findMany.mockResolvedValueOnce(skipped);
    mocks.retrieve.mockImplementation(async (id: string) => ({ id, metadata: { orderId: row(Number(id.slice(3))).id }, amount: 10000, amount_received: 10000, currency: "usd", status: "succeeded" }));
    expect((await GET(request())).status).toBe(200);
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.reconcile).toHaveBeenCalledTimes(25);
    const cursor = mocks.set.mock.calls.find(([key]) => key.includes(":cursor:"))![1];
    expect(cursor.id).toBe(row(25).id);
    expect(cursor.createdAt).toBe("2026-01-01 00:00:00.123456+00");

    mocks.get.mockResolvedValue(cursor);
    const later = { ...row(26), stripePaymentIntentId: null };
    mocks.findMany.mockResolvedValueOnce([later]);
    const update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) });
    mocks.transaction.mockImplementation(async action => action({
      select: () => ({ from: () => ({ where: () => ({ for: async () => [later] }) }) }), update,
    }));
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ expired: 1, scanned: 1 });
    const query = new PgDialect().sqlToQuery(mocks.findMany.mock.calls[1][0].where);
    expect(query.sql).toContain(") > (");
    expect(query.params).toContain(row(25).id);
    expect(query.params).toContain("2026-01-01 00:00:00.123456+00");
    expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({ orderId: later.id }));
    expect(mocks.del).toHaveBeenCalledWith("cron:expire-pending-orders:cursor:v1");
  });

  it("advances after provider failures while keeping inventory reserved", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 25 }, (_, i) => row(i + 1)));
    mocks.retrieve.mockRejectedValue(new Error("provider unavailable"));
    expect((await GET(request())).status).toBe(500);
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.set).toHaveBeenCalledWith("cron:expire-pending-orders:cursor:v1", expect.objectContaining({ id: row(25).id }));
    expect(mocks.reconcile).toHaveBeenCalledTimes(25);
  });

  it("still advances when recording a provider failure also fails", async () => {
    mocks.findMany.mockResolvedValue(Array.from({ length: 25 }, (_, i) => row(i + 1)));
    mocks.retrieve.mockRejectedValue(new Error("provider unavailable"));
    mocks.reconcile.mockRejectedValue(new Error("case store unavailable"));
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(mocks.retrieve).toHaveBeenCalledTimes(25);
    expect(mocks.set).toHaveBeenCalledWith("cron:expire-pending-orders:cursor:v1", expect.objectContaining({ id: row(25).id }));
    expect(mocks.release).not.toHaveBeenCalled();
  });

  it("does not query orders without cron authorization", async () => {
    expect((await GET(new NextRequest("https://plankmarket.com/api/cron/expire-pending-orders"))).status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
