import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Database } from "@/server/db";
import { abandonCheckoutAttempt, checkoutInputFingerprint, findCheckoutReplay } from "../checkout-idempotency";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const input = { requestId: "11111111-1111-4111-8111-111111111111", listingId: "listing", quantitySqFt: 10, selectedQuoteToken: "signed-quote" };
const fingerprint = checkoutInputFingerprint("direct", input);

// Transaction harness models advisory locking and commit visibility. No live
// database/provider writes are used; a DB integration run remains a release gate.
function harness() {
  const rows = new Map<string, Record<string, unknown>>();
  const tombstones = new Set<string>();
  const locks = new Map<string, Promise<void>>();
  const dialect = new PgDialect();
  const keyFor = (where: SQL) => dialect.sqlToQuery(where).params.join(":");
  const run = async <T,>(fn: (tx: Transaction) => Promise<T>) => {
    let release = () => {};
    const tx = {
      execute: async (query: SQL) => {
        const key = String(dialect.sqlToQuery(query).params[0]);
        const predecessor = locks.get(key) ?? Promise.resolve();
        let unlock!: () => void;
        const current = new Promise<void>((resolve) => { unlock = resolve; });
        locks.set(key, current);
        await predecessor;
        release = unlock;
      },
      query: {
        orders: { findFirst: async ({ where }: { where: SQL }) => rows.get(keyFor(where)) },
        checkoutAbandonments: { findFirst: async ({ where }: { where: SQL }) => tombstones.has(keyFor(where)) ? { requestId: input.requestId } : undefined },
      },
      insert: () => ({ values: ({ buyerId, requestId }: { buyerId: string; requestId: string }) => ({
        onConflictDoNothing: async () => { tombstones.add(`${buyerId}:${requestId}`); },
      }) }),
    } as unknown as Transaction;
    try { return await fn(tx); } finally { release(); }
  };
  return { run, rows, tombstones };
}

it("fingerprints canonical payloads but binds quantity, quote and checkout mode", () => {
  expect(checkoutInputFingerprint("direct", { selectedQuoteToken: "signed-quote", quantitySqFt: 10, listingId: "listing", requestId: "other" })).toBe(fingerprint);
  expect(checkoutInputFingerprint("offer", input)).not.toBe(fingerprint);
  expect(checkoutInputFingerprint("direct", { ...input, quantitySqFt: 11 })).not.toBe(fingerprint);
  expect(checkoutInputFingerprint("direct", { ...input, selectedQuoteToken: "other-quote" })).not.toBe(fingerprint);
});

describe("serialized checkout attempts", () => {
  it("replays concurrent and lost-response attempts without consuming a second quote or reservation", async () => {
    const h = harness();
    const reserve = vi.fn();
    const create = () => h.run(async (tx) => {
      const replay = await findCheckoutReplay(tx, "buyer", input.requestId, fingerprint);
      if (replay) return replay.id;
      reserve();
      const row = { id: "order", checkoutInputFingerprint: fingerprint, status: "pending" };
      h.rows.set(`buyer:${input.requestId}`, row);
      return row.id;
    });
    expect(await Promise.all([create(), create(), create()])).toEqual(["order", "order", "order"]);
    expect(await create()).toBe("order");
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it("rejects payload changes while allowing another buyer to use the same key", async () => {
    const h = harness();
    h.rows.set(`buyer:${input.requestId}`, { id: "order", checkoutInputFingerprint: fingerprint });
    await expect(h.run((tx) => findCheckoutReplay(tx, "buyer", input.requestId, "changed"))).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(h.run((tx) => findCheckoutReplay(tx, "other-buyer", input.requestId, "changed"))).resolves.toBeUndefined();
  });

  it("tombstones an absent attempt before a delayed create can reserve inventory", async () => {
    const h = harness();
    const reset = h.run((tx) => abandonCheckoutAttempt(tx, "buyer", input.requestId));
    const delayedCreate = h.run((tx) => findCheckoutReplay(tx, "buyer", input.requestId, fingerprint));
    await expect(reset).resolves.toEqual({ abandoned: true });
    await expect(delayedCreate).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses reset when an in-flight create commits first", async () => {
    const h = harness();
    const create = h.run(async (tx) => {
      await findCheckoutReplay(tx, "buyer", input.requestId, fingerprint);
      h.rows.set(`buyer:${input.requestId}`, { id: "order", status: "pending", paymentStatus: "pending", inventoryReleasedAt: null });
    });
    const reset = h.run((tx) => abandonCheckoutAttempt(tx, "buyer", input.requestId));
    await create;
    await expect(reset).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.tombstones.size).toBe(0);
  });

  it.each(["processing", "succeeded", "refund_pending"])("never abandons %s payments", async (paymentStatus) => {
    const h = harness();
    h.rows.set(`buyer:${input.requestId}`, { status: "pending", paymentStatus });
    await expect(h.run((tx) => abandonCheckoutAttempt(tx, "buyer", input.requestId))).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows a terminal cancelled reservation to select fresh shipping", async () => {
    const h = harness();
    h.rows.set(`buyer:${input.requestId}`, { status: "cancelled", paymentStatus: "pending", inventoryReleasedAt: new Date() });
    await expect(h.run((tx) => abandonCheckoutAttempt(tx, "buyer", input.requestId))).resolves.toEqual({ abandoned: true });
  });
});
