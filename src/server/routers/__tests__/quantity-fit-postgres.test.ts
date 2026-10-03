// PRE-PRODUCT PROPOSAL. Root must review/install this file before product edits.
// Opt-in actual router/PostgreSQL acceptance; every write is forcibly rolled back.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db";
import type { createTRPCContext } from "@/server/trpc";
import type { SearchFilters } from "@/types";
import { getPurchaseQuantityPreview } from "@/lib/marketplace/purchase-quantity-preview";
import { buildDigestListingConditions } from "@/server/services/saved-search-conditions";
import { listingMatchesSavedSearch } from "@/lib/saved-search-matching";

const bridge = vi.hoisted(() => ({ db: null as unknown, denied: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: new Proxy({}, { get(_target, key) {
  if (!bridge.db) throw new Error("No admitted quantity-fit transaction");
  const value = (bridge.db as Record<PropertyKey, unknown>)[key];
  return typeof value === "function" ? value.bind(bridge.db) : value;
} }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => {
  bridge.denied.push("authentication"); throw new Error("Real authentication forbidden");
} }));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}), redis: {
  get: () => { bridge.denied.push("cache-read"); throw new Error("Remote cache forbidden"); },
  set: () => { bridge.denied.push("cache-write"); throw new Error("Remote cache forbidden"); },
} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  static slidingWindow() { return {}; }
  async limit() { return { success: true }; }
} }));
vi.mock("@/server/services/content-moderation", () => ({ checkViolationStatus: vi.fn() }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: () => {
  bridge.denied.push("event-send"); throw new Error("Events and customer messages forbidden");
} } }));
vi.mock("@/server/services/priority1", () => ({ priority1: new Proxy({}, { get() {
  return () => { bridge.denied.push("carrier"); throw new Error("Carrier access forbidden"); };
} }) }));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { listingRouter } = await import("@/server/routers/listing");
const { searchRouter } = await import("@/server/routers/search");
const createCaller = createCallerFactory(createTRPCRouter({ listing: listingRouter, search: searchRouter }));
type Caller = ReturnType<typeof createCaller>;
type User = typeof schema.users.$inferSelect;
type Listing = typeof schema.listings.$inferSelect;
type NewListing = typeof schema.listings.$inferInsert;
type BrowseInput = Parameters<Caller["listing"]["list"]>[0];
type Preview = NonNullable<ReturnType<typeof getPurchaseQuantityPreview>>;
type Filters = SearchFilters & { hideQuantityConflicts?: true };
const TARGET = "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
const SOURCE = [
  "src/server/routers/listing.ts", "src/server/routers/search.ts",
  "src/lib/validators/listing.ts", "src/types/index.ts",
  "src/lib/marketplace/purchase-quantity-preview.ts", "src/lib/marketplace/purchase-intent.ts",
  "src/lib/listing-pricing.ts", "src/lib/saved-search-matching.ts",
  "src/server/services/saved-search-conditions.ts", "src/server/security/public-data.ts",
  "src/server/security/listing-visibility.ts", "src/server/services/public-read-cache.ts",
  "src/server/db/expressions/listing-quantity-fit.ts",
  "src/server/routers/__tests__/quantity-fit-postgres.test.ts",
];
const sourceHashes = () => SOURCE.map(file => ({ path: file, sha256: fs.existsSync(file)
  ? createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null }));
function caller(db: Database, user: User) {
  return createCaller({ db, user, authUser: { id: user.authId, email_confirmed_at: "2026-09-01" },
    supabase: {}, clientIp: "127.0.0.1", getAuthAssurance: vi.fn().mockRejectedValue(new Error("Ordinary saved searches require no payout MFA")),
  } as unknown as Awaited<ReturnType<typeof createTRPCContext>>);
}
async function seedUser(db: Database, role: "buyer" | "seller" = "buyer") {
  const id = randomUUID();
  const [user] = await db.insert(schema.users).values({ id, authId: randomUUID(),
    email: `quantity-fit-${id}@example.invalid`, name: "Synthetic Quantity Business User",
    businessName: "Synthetic Quantity Business", role, active: true,
    verified: true, verificationStatus: "verified", businessState: "CO",
  }).returning();
  return user;
}
async function seedListing(db: Database, user: User, token: string, patch: Partial<NewListing> = {}) {
  const now = Date.now();
  const [listing] = await db.insert(schema.listings).values({
    sellerId: user.id, title: `${token} synthetic flooring lot`, materialType: "engineered",
    condition: "new_overstock", status: "active", totalSqFt: 1200,
    moq: 100, moqUnit: "sqft", sqFtPerBox: 20, boxesPerPallet: 30,
    askPricePerSqFt: 3, buyNowPrice: 2, fullLotOnly: false,
    partialQuantityMarkupPercent: null, territoryMode: "unrestricted",
    locationState: "CO", lastConfirmedAt: new Date(now - 1000),
    confirmationDueAt: new Date(now + 86_400_000), publishedAt: new Date(now - 1000),
    ...patch,
  }).returning();
  return listing;
}
const ids = (rows: { id: string }[]) => rows.map(row => row.id).sort();
const asBrowse = (filters: unknown) => filters as BrowseInput;

type Case = { label: string; requested: number; patch: Partial<NewListing>; status: Preview["status"]; reason?: string };
const CASES: Case[] = [
  { label: "501 needed cannot buy complete cartons from 510 stock", requested: 501, patch: { totalSqFt: 510 }, status: "unavailable", reason: "boxes" },
  { label: "minimum 1300 exceeds 1200 stock", requested: 500, patch: { moq: 1300 }, status: "unavailable", reason: "minimum" },
  { label: "three-pallet minimum is 1800 but stock is 1200", requested: 500, patch: { moq: 3, moqUnit: "pallets" }, status: "unavailable", reason: "minimum" },
  { label: "minimum 600 for a 500 job remains an available overbuy", requested: 500, patch: { moq: 600 }, status: "ready" },
  { label: "full 1200 lot for a 500 job remains an available overbuy", requested: 500, patch: { fullLotOnly: true }, status: "ready" },
  { label: "three 21.43 cartons from 64.29 persisted real stock remain available", requested: 64, patch: { totalSqFt: 64.29, moq: 1, sqFtPerBox: 21.43 }, status: "ready" },
  { label: "three 21.43 cartons cannot come from 64.28 stock", requested: 64, patch: { totalSqFt: 64.28, moq: 1, sqFtPerBox: 21.43 }, status: "unavailable", reason: "boxes" },
  { label: "missing pallet carton count remains an inquiry", requested: 500, patch: { moq: 1, moqUnit: "pallets", boxesPerPallet: null }, status: "needs_details", reason: "pallet_details" },
  { label: "missing pallet carton area remains an inquiry", requested: 500, patch: { moq: 1, moqUnit: "pallets", sqFtPerBox: null }, status: "needs_details", reason: "pallet_details" },
  { label: "unknown minimum unit remains an inquiry", requested: 500, patch: { moqUnit: null }, status: "needs_details", reason: "order_terms" },
  { label: "legacy zero box size remains an inquiry", requested: 500, patch: { sqFtPerBox: 0 }, status: "needs_details", reason: "box_conflict" },
  { label: "nonwhole full lot remains an inquiry", requested: 500, patch: { totalSqFt: 1010, fullLotOnly: true }, status: "needs_details", reason: "box_conflict" },
  { label: "exact minimum 500.005 cannot round down to 500", requested: 500, patch: { totalSqFt: 510, moq: 500.005 }, status: "unavailable", reason: "boxes" },
  { label: "area order without carton size remains available", requested: 501, patch: { sqFtPerBox: null }, status: "ready" },
  { label: "legacy invalid direct price remains an inquiry", requested: 500, patch: { buyNowPrice: 0 }, status: "needs_details", reason: "price" },
  // Independent review counterexamples, reproduced before the remainder fix.
  { label: "binary remainder retains a within-tolerance large lot", requested: 100999.99, patch: { totalSqFt: 100999.99, sqFtPerBox: 1.01 }, status: "ready" },
  { label: "binary remainder hides a just-outside-tolerance large lot", requested: 83974.44, patch: { totalSqFt: 83975, sqFtPerBox: 1.01 }, status: "unavailable", reason: "boxes" },
  { label: "accepted subnormal quantity remains a clarification", requested: Number.MIN_VALUE, patch: { moq: 0 }, status: "needs_details", reason: "box_conflict" },
  { label: "ordinary real stock equality at 1.01 is preserved", requested: 1.01, patch: { totalSqFt: 1.01, moq: 0, sqFtPerBox: null }, status: "ready" },
  { label: "ordinary real stock equality at 64.28 is preserved", requested: 64.28, patch: { totalSqFt: 64.28, moq: 0, sqFtPerBox: null }, status: "ready" },
];

describe.skipIf(process.env.QUANTITY_FIT_DB_PROOF !== "1")("quantity fit actual routers / canonical PostgreSQL", () => {
  let connection: ReturnType<typeof postgres> | undefined;
  let db: Database;
  let original: Record<string, unknown> | undefined;
  const runId = randomUUID();
  const directory = path.resolve("tmp/journey10/quantity-fit/database-proof", runId);
  const proof: Record<string, unknown> = { runId, target: TARGET, cases: [],
    boundary: "Actual tRPC input parser, listing/search routers, public DTO, PostgreSQL SQL/count/pagination, saved-search persistence, digest SQL and instant JS. Outer forced rollback. Auth and rate limiter simulated; authenticated catalog context bypasses cache. No browser, provider, event or email proof. Privileged local DB does not prove RLS.",
  };
  const note = () => fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(proof, null, 2));
  async function fingerprint() {
    assert(connection);
    const result: Record<string, unknown> = {};
    const tables = await connection`select c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname`;
    expect(tables).toHaveLength(54);
    for (const row of tables) {
      const [value] = await connection`select count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public.${connection(String(row.name))} t`;
      result[String(row.name)] = { count: Number(value.count), digest: String(value.digest) };
    }
    return result;
  }
  beforeAll(async () => {
    assert.equal(process.env.QUANTITY_FIT_OTHER_FIXTURES_CLEANED, "1");
    assert.equal(process.env.DATABASE_URL, TARGET);
    fs.mkdirSync(directory, { recursive: true }); proof.sources = sourceHashes(); note();
    connection = postgres(TARGET, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {},
      connection: { application_name: `quantity-fit-proof-${runId.slice(0, 8)}`, statement_timeout: 10000, lock_timeout: 3000 },
    });
    db = drizzle(connection, { schema });
    const [identity] = await connection`select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,current_setting('session_replication_role') replication`;
    expect(identity).toMatchObject({ name: "plankmarket_bootstrap_design_20260929", role: "postgres", address: "127.0.0.1", port: 55439, replication: "origin" });
    const others = await connection`select pid,application_name from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()`;
    expect(others).toHaveLength(0);
    proof.admission = { identity, otherSessions: others }; original = await fingerprint(); proof.before = original; note();
    vi.stubGlobal("fetch", () => { bridge.denied.push("fetch"); throw new Error("Network forbidden in quantity-fit proof"); });
  }, 30000);
  afterAll(async () => {
    try {
      if (original) { proof.after = await fingerprint(); expect(proof.after).toEqual(original); proof.publicDataUnchanged = true; }
      proof.deniedExternalCalls = bridge.denied;
      expect(bridge.denied).toEqual([]);
      proof.sourceReadback = sourceHashes(); expect(proof.sourceReadback).toEqual(proof.sources);
    } finally {
      if (fs.existsSync(directory)) note();
      vi.unstubAllGlobals(); if (connection) await connection.end({ timeout: 2 });
    }
  }, 30000);
  async function rollback(label: string, body: (executor: Database, evidence: Record<string, unknown>) => Promise<void>) {
    const sentinel = new Error("FORCED_QUANTITY_FIT_ROLLBACK");
    let failed: unknown, rolledBack = false, passed = false;
    const evidence: Record<string, unknown> = { label };
    try {
      await db.transaction(async tx => {
        const executor = tx as unknown as Database; bridge.db = executor;
        try { await body(executor, evidence); await tx.execute(sql`set constraints all immediate`); passed = true; }
        catch (error) { failed = error; }
        finally { throw sentinel; }
      });
    } catch (error) { if (error === sentinel) rolledBack = true; else failed ??= error; }
    finally { bridge.db = null; }
    Object.assign(evidence, { passed: passed && !failed, rolledBack, error: failed instanceof Error ? failed.message : failed ? "unknown" : null });
    (proof.cases as unknown[]).push(evidence); note();
    expect(rolledBack).toBe(true); if (failed) throw failed;
  }
  async function alertMatches(executor: Database, user: User, rows: Listing[], filters: Filters) {
    const now = new Date();
    const conditions = buildDigestListingConditions({ filters, lastAlertAt: null, userId: user.id,
      userRole: user.role, userVerificationStatus: user.verificationStatus, userBusinessState: user.businessState,
    }, new Date(now.getTime() - 3_600_000), now);
    const digest = await executor.select({ id: schema.listings.id }).from(schema.listings).where(and(...conditions));
    const instant = rows.filter(row => listingMatchesSavedSearch(row, filters));
    return { digest: ids(digest), instant: ids(instant) };
  }

  it.each(CASES)("$label", async testCase => rollback(testCase.label, async (executor, evidence) => {
    const user = await seedUser(executor), seller = await seedUser(executor, "seller"), token = `QuantityFit${randomUUID().replaceAll("-", "")}`;
    const row = await seedListing(executor, seller, token, testCase.patch), c = caller(executor, user);
    const legacy: Filters = { query: token, minLotSize: testCase.requested, limit: 2, page: 1 };
    const oldResult = await c.listing.list(asBrowse(legacy));
    expect(ids(oldResult.items)).toEqual([row.id]);
    const dto = oldResult.items[0];
    // The comparison oracle consumes the actual public DTO after PostgreSQL's
    // real/numeric round trip, never the fixture literals.
    const preview = getPurchaseQuantityPreview(dto, testCase.requested);
    expect(preview).toMatchObject({ status: testCase.status, ...(testCase.reason ? { reason: testCase.reason } : {}) });
    const filters: Filters = { ...legacy, hideQuantityConflicts: true };
    const result = await c.listing.list(asBrowse(filters));
    const expected = testCase.status === "unavailable" ? [] : [row.id];
    Object.assign(evidence, { filters, persisted: { totalSqFt: row.totalSqFt, moq: row.moq, moqUnit: row.moqUnit, sqFtPerBox: row.sqFtPerBox, boxesPerPallet: row.boxesPerPallet }, preview, result });
    expect(ids(result.items)).toEqual(expected);
    expect(result).toMatchObject({ total: expected.length, totalIsExact: true, totalPages: expected.length, page: 1, limit: 2, hasMore: false });
    const matches = await alertMatches(executor, user, [row], filters); evidence.matches = matches;
    expect(matches).toEqual({ digest: expected, instant: expected });
    expect(await alertMatches(executor, user, [row], legacy)).toEqual({ digest: [row.id], instant: [row.id] });
  }));

  it("filters before totals and pagination while retaining inquiry and overbuy lots", async () => rollback("mixed pagination", async (executor, evidence) => {
    const user = await seedUser(executor), seller = await seedUser(executor, "seller"), token = `QuantityPage${randomUUID().replaceAll("-", "")}`;
    const patches: Partial<NewListing>[] = [
      { moq: 1300 }, { totalSqFt: 510, moq: 501 },
      { moq: 600 }, { moqUnit: null }, { fullLotOnly: true, totalSqFt: 1010 },
      { fullLotOnly: true }, { sqFtPerBox: null },
    ];
    const rows: Listing[] = [];
    for (let index = 0; index < patches.length; index++) rows.push(await seedListing(executor, seller, token, {
      ...patches[index], createdAt: new Date(Date.now() - index * 1000),
    }));
    const c = caller(executor, user), legacy: Filters = { query: token, minLotSize: 500, sort: "date_newest", limit: 50, page: 1 };
    const originalResult = await c.listing.list(asBrowse(legacy)); expect(originalResult.total).toBe(7);
    expect(originalResult.items.map(row => row.id)).toEqual(rows.map(row => row.id));
    const expected = originalResult.items.filter(row => getPurchaseQuantityPreview(row, 500)?.status !== "unavailable").map(row => row.id);
    expect(expected).toHaveLength(5);
    const filters: Filters = { ...legacy, limit: 2, hideQuantityConflicts: true };
    const pages = [];
    for (const page of [1, 2, 3, 4]) pages.push(await c.listing.list(asBrowse({ ...filters, page })));
    evidence.pages = pages; evidence.previews = originalResult.items.map(row => ({ id: row.id, preview: getPurchaseQuantityPreview(row, 500) }));
    expect(pages.map(page => page.items.map(row => row.id))).toEqual([expected.slice(0, 2), expected.slice(2, 4), expected.slice(4), []]);
    for (const page of pages) expect(page).toMatchObject({ total: 5, totalIsExact: true, totalPages: 3, limit: 2 });
    expect(pages.map(page => page.hasMore)).toEqual([true, true, false, false]);
    const matches = await alertMatches(executor, user, rows, filters); evidence.matches = matches;
    expect(matches).toEqual({ digest: [...expected].sort(), instant: [...expected].sort() });
  }));

  it("keeps SQL decisions aligned with DTO previews across persisted real-number boundaries", async () => rollback("persisted numeric parity sweep", async (executor, evidence) => {
    const helperPath = path.resolve("src/server/db/expressions/listing-quantity-fit.ts");
    // Keep the missing helper a single expected pre-product case failure, not
    // a transform-time import failure that masks the core router baseline.
    assert(fs.existsSync(helperPath), "Pre-product baseline: quantity-fit SQL helper is not implemented");
    const helperUrl = pathToFileURL(helperPath).href;
    const { getNoKnownQuantityConflictSql } = await import(/* @vite-ignore */ helperUrl) as {
      getNoKnownQuantityConflictSql: (requested: number) => SQL<boolean>;
    };
    const user = await seedUser(executor), seller = await seedUser(executor, "seller");
    const token = `QuantityParity${randomUUID().replaceAll("-", "")}`;
    const rows: Listing[] = [];
    const deltas = [-0.011, -0.01, -0.00001, 0, 0.00001, 0.01];
    // 120 real-column rows: decimal carton sizes, exact/near carton stock,
    // small through large lots, minimum noise and exact 500.005 minimums.
    for (const boxSize of [0.1, 0.3, 1.01, 21.43, 23.1]) {
      for (const cartons of [3, 23, 601, 50001]) {
        for (const delta of deltas) {
          const index = rows.length;
          rows.push(await seedListing(executor, seller, token, {
            sqFtPerBox: boxSize, totalSqFt: boxSize * cartons + delta,
            moq: index % 3 === 0 ? boxSize * cartons + delta / 10 : index % 3 === 1 ? 500.005 : 0.01,
            fullLotOnly: index % 7 === 0,
          }));
        }
      }
    }
    const c = caller(executor, user);
    const publicResult = await c.listing.list(asBrowse({ query: token, limit: 250, page: 1 }));
    expect(publicResult.total).toBe(120); expect(publicResult.items).toHaveLength(120);
    const samples = [];
    for (const requested of [0.3, 64, 500.005, 12345.67]) {
      const decisions = await executor.select({ id: schema.listings.id, keep: getNoKnownQuantityConflictSql(requested) })
        .from(schema.listings).where(inArray(schema.listings.id, rows.map(row => row.id)));
      const expected = publicResult.items.map(dto => ({ id: dto.id, preview: getPurchaseQuantityPreview(dto, requested) }));
      const expectedIds = expected.filter(item => item.preview?.status !== "unavailable").map(item => item.id).sort();
      const observedIds = decisions.filter(item => item.keep === true).map(item => item.id).sort();
      samples.push({ requested, decisions, expected });
      evidence.samples = samples;
      expect(decisions).toHaveLength(120);
      expect(decisions.every(item => typeof item.keep === "boolean")).toBe(true);
      expect(observedIds).toEqual(expectedIds);
    }
    evidence.persisted = rows.map(row => ({ id: row.id, totalSqFt: row.totalSqFt, moq: row.moq, sqFtPerBox: row.sqFtPerBox, fullLotOnly: row.fullLotOnly }));
  }));

  it("saves, reads and clears the opt-in filter without enabling customer alerts", async () => rollback("saved-search persistence", async (executor, evidence) => {
    const user = await seedUser(executor), seller = await seedUser(executor, "seller"), c = caller(executor, user), token = `QuantitySaved${randomUUID().replaceAll("-", "")}`;
    const row = await seedListing(executor, seller, token, { totalSqFt: 510 });
    const filters: Filters = { query: token, minLotSize: 501, hideQuantityConflicts: true };
    const saved = await c.search.saveSearch({ name: "Synthetic quantity search", filters: asBrowse(filters), alertEnabled: false });
    expect(saved.filters).toMatchObject(filters); expect(saved.alertEnabled).toBe(false);
    const restored = (await c.search.getMySavedSearches()).find(search => search.id === saved.id);
    expect(restored?.filters).toMatchObject(filters); expect(restored?.alertEnabled).toBe(false);
    expect((await c.listing.list(asBrowse(restored!.filters))).total).toBe(0);
    expect(await alertMatches(executor, user, [row], restored!.filters)).toEqual({ digest: [], instant: [] });
    const updated = await c.search.updateSavedSearch({ id: saved.id, filters: asBrowse({ query: token, minLotSize: 501 }), alertEnabled: false });
    expect(updated.filters).not.toHaveProperty("hideQuantityConflicts");
    const cleared = (await c.search.getMySavedSearches()).find(search => search.id === saved.id)!;
    expect(cleared.filters).not.toHaveProperty("hideQuantityConflicts"); expect(cleared.alertEnabled).toBe(false);
    expect(ids((await c.listing.list(asBrowse(cleared.filters))).items)).toEqual([row.id]);
    expect(await alertMatches(executor, user, [row], cleared.filters)).toEqual({ digest: [row.id], instant: [row.id] });
    const [persisted] = await executor.select().from(schema.savedSearches).where(eq(schema.savedSearches.id, saved.id));
    expect(persisted.filters).toEqual(cleared.filters); expect(persisted.alertEnabled).toBe(false);
    evidence.saved = saved; evidence.cleared = persisted;
  }));

  it.each([
    { label: "missing job quantity", filters: { hideQuantityConflicts: true } },
    { label: "zero job quantity", filters: { hideQuantityConflicts: true, minLotSize: 0 } },
    { label: "negative opt-in flag", filters: { hideQuantityConflicts: false, minLotSize: 500 } },
  ])("rejects $label at all three input boundaries", async ({ label, filters }) => rollback(label, async (executor, evidence) => {
    const user = await seedUser(executor), c = caller(executor, user);
    const saved = await c.search.saveSearch({ name: "Existing synthetic search", filters: asBrowse({ minLotSize: 500 }), alertEnabled: false });
    const before = await executor.select().from(schema.savedSearches).where(eq(schema.savedSearches.userId, user.id));
    await expect(c.listing.list(asBrowse(filters))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(c.search.saveSearch({ name: "Invalid synthetic search", filters: asBrowse(filters), alertEnabled: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(c.search.updateSavedSearch({ id: saved.id, filters: asBrowse(filters), alertEnabled: false })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await executor.select().from(schema.savedSearches).where(eq(schema.savedSearches.userId, user.id))).toEqual(before);
    evidence.filters = filters; evidence.savedSearchesUnchanged = true;
  }));
});
