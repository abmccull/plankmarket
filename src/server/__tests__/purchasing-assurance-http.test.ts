// HTTP acceptance written before purchasing assurance correction; no money/provider effects.
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import type { createTRPCContext } from "@/server/trpc";
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/db/schema", () => ({ users: {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}) }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class { static slidingWindow() { return {}; } async limit() { return { success: true }; } } }));
vi.mock("@/server/services/content-moderation", () => ({ checkViolationStatus: vi.fn() }));
const { createTRPCRouter, verifiedBuyerProcedure, strictVerifiedBuyerProcedure } = await import("@/server/trpc");
let effects = 0, assuranceReads = 0;
const router = createTRPCRouter({
  purchase: verifiedBuyerProcedure.mutation(() => { effects++; return "entered"; }),
  strictPurchase: strictVerifiedBuyerProcedure.mutation(() => { effects++; return "entered"; }),
});
const server = createHTTPServer({ router, createContext({ req }) {
  const role = String(req.headers["x-fixture-role"] ?? "buyer"), level = String(req.headers["x-fixture-aal"] ?? "aal1");
  return { db: {}, authUser: { id: "synthetic-auth" }, user: { id: "synthetic-user", role, active: req.headers["x-fixture-inactive"] !== "1", verificationStatus: req.headers["x-fixture-unverified"] === "1" ? "pending" : "verified" }, clientIp: "127.0.0.1", supabase: {},
    getAuthAssurance: async () => { assuranceReads++; if (level === "outage") throw Error("Synthetic assurance outage"); return { currentLevel: level, nextLevel: "aal2", recentVerificationSatisfied: true, lastFactorVerificationAt: null }; },
  } as unknown as Awaited<ReturnType<typeof createTRPCContext>>;
} });
let base = "";
beforeAll(async () => { await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (!address || typeof address === "string") throw Error("No loopback HTTP fixture"); base = `http://127.0.0.1:${address.port}`; });
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
async function request(path: string, role: string, aal: string, extra: Record<string, string> = {}) {
  const before = effects, reads = assuranceReads;
  const response = await fetch(`${base}/${path}`, { method: "POST", headers: { "content-type": "application/json", "x-fixture-role": role, "x-fixture-aal": aal, ...extra }, body: "null" });
  return { status: response.status, entered: effects - before, assuranceReads: assuranceReads - reads };
}
describe("verified purchasing HTTP admin assurance", () => {
  for (const path of ["purchase", "strictPurchase"]) {
    it(`${path} rejects AAL1 admin before the handler`, async () => { expect(await request(path, "admin", "aal1")).toMatchObject({ status: 403, entered: 0, assuranceReads: 1 }); });
    it(`${path} fails closed during admin assurance outage`, async () => { const result = await request(path, "admin", "outage"); expect(result.entered).toBe(0); expect(result.status).toBeGreaterThanOrEqual(400); expect(result.assuranceReads).toBe(1); });
    it(`${path} permits AAL2 admin`, async () => { expect(await request(path, "admin", "aal2")).toMatchObject({ status: 200, entered: 1 }); });
    for (const role of ["buyer", "seller"]) {
      it(`${path} keeps verified AAL1 ${role} purchasing available`, async () => { expect(await request(path, role, "aal1")).toEqual({ status: 200, entered: 1, assuranceReads: 0 }); });
      it(`${path} denies unverified ${role}`, async () => { expect(await request(path, role, "aal1", { "x-fixture-unverified": "1" })).toMatchObject({ status: 403, entered: 0 }); });
    }
    it(`${path} denies inactive admin`, async () => { expect(await request(path, "admin", "aal2", { "x-fixture-inactive": "1" })).toMatchObject({ status: 403, entered: 0 }); });
  }
});
