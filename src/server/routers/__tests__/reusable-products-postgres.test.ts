// PRE-PRODUCT PROPOSAL. Root reviews/installs before product implementation.
// Opt-in actual router/PostgreSQL acceptance. Every write is forcibly rolled back.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db";
import type { createTRPCContext } from "@/server/trpc";
import type { ListingDraftSnapshot } from "@/lib/validators/listing-draft";

const bridge = vi.hoisted(() => ({ db: null as unknown, denied: [] as string[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: new Proxy({}, { get(_target, key) {
  if (!bridge.db) throw new Error("No admitted product-reuse transaction");
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
const createCaller = createCallerFactory(createTRPCRouter({ listing: listingRouter }));
type Caller = ReturnType<typeof createCaller>;
type User = typeof schema.users.$inferSelect;
type Listing = typeof schema.listings.$inferSelect;
type NewListing = typeof schema.listings.$inferInsert;
const PRODUCT_FIELDS = ["materialType", "species", "finish", "grade", "color", "colorFamily", "thickness", "width", "length", "wearLayer", "brand", "modelNumber", "sqFtPerBox", "installationMethod", "waterResistance", "certifications"] as const;
type ProductField = typeof PRODUCT_FIELDS[number];
type Product = Partial<Record<ProductField, string | number | string[]>>;
type ReuseItem = { id: string; title: string; status: Listing["status"]; product: Product; omittedFields: string[] };
type ReuseResult = { ownerId: string; items: ReuseItem[]; page: number; hasMore: boolean };
const STATUSES = ["active", "draft", "sold", "expired", "archived"] as const;
const TARGET = "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
const SOURCE = [
  "src/server/routers/listing.ts", "src/server/trpc.ts",
  "src/server/services/listing-form-drafts.ts", "src/lib/validators/listing-draft.ts",
  "src/lib/validators/listing.ts", "src/server/db/schema/listings.ts", "src/server/db/schema/users.ts",
  "src/lib/marketplace/reusable-listing-product.ts", "src/components/listings/reuse-product-dialog.tsx",
  "src/app/(dashboard)/seller/listings/new/page.tsx",
  "src/server/routers/__tests__/reusable-products-postgres.test.ts",
  "tmp/journey10/product-reuse/preimplementation/reusable-products-postgres.test.ts",
];
const sourceHashes = () => SOURCE.map(file => ({ path: file, sha256: fs.existsSync(file)
  ? createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null }));
function caller(db: Database, user: User | null) {
  return createCaller({ db, user, authUser: user ? { id: user.authId, email_confirmed_at: "2026-09-01" } : null,
    supabase: {}, clientIp: "127.0.0.1", getAuthAssurance: vi.fn().mockRejectedValue(new Error("Product reuse requires no payout MFA")),
  } as unknown as Awaited<ReturnType<typeof createTRPCContext>>);
}
// Dynamic caller lets the missing endpoint fail as a case before implementation,
// rather than importing an absent helper or failing the entire test transform.
function reusable(c: Caller, input: unknown): Promise<ReuseResult> {
  return (c.listing as unknown as { getReusableProducts(input: unknown): Promise<ReuseResult> }).getReusableProducts(input);
}
async function seedUser(db: Database, role: User["role"] = "seller", verificationStatus = "verified", active = true) {
  const id = randomUUID();
  const [user] = await db.insert(schema.users).values({ id, authId: randomUUID(),
    email: `product-reuse-${id}@example.invalid`, name: "Synthetic Product Reuse User", businessName: "Synthetic Product Business",
    role, active, verified: verificationStatus === "verified", verificationStatus, businessState: "CO",
  }).returning(); return user;
}
async function seedListing(db: Database, seller: User, patch: Partial<NewListing> = {}) {
  const [row] = await db.insert(schema.listings).values({ sellerId: seller.id,
    title: "Synthetic reusable oak flooring", description: "DO_NOT_COPY_PRIVATE_DESCRIPTION", status: "active",
    materialType: "engineered", species: "White Oak", finish: "matte", grade: "character", color: "Natural", colorFamily: "brown",
    thickness: 0.5, width: 7, length: 48, wearLayer: 3, brand: "Reuse Brand", modelNumber: "REUSE-100", sqFtPerBox: 20,
    installationMethod: "floating", waterResistance: "not_waterproof", certifications: ["floorscore"],
    specificationProvenance: "seller_declared", condition: "new_overstock", lotNumber: "DO_NOT_COPY_SOURCE_LOT",
    totalSqFt: 1200, totalPallets: 2, moq: 100, moqUnit: "sqft", boxesPerPallet: 30,
    palletWeight: 1000, palletLength: 48, palletWidth: 40, palletHeight: 48, freightClass: "70",
    locationCity: "Denver", locationState: "CO", locationZip: "80202", askPricePerSqFt: 3, buyNowPrice: 2, floorPrice: 1,
    territoryMode: "unrestricted", fullLotOnly: false, allowOffers: true,
    lastConfirmedAt: new Date(Date.now() - 1000), confirmationDueAt: new Date(Date.now() + 86_400_000),
    publishedAt: new Date(Date.now() - 1000), ...patch,
  }).returning(); return row;
}
async function seedPhoto(db: Database, seller: User, listingId?: string) {
  const id = randomUUID();
  const [row] = await db.insert(schema.media).values({ id, uploaderId: seller.id, listingId,
    url: `https://example.invalid/private-reuse-${id}.png`, key: `product-reuse-${id}`, mimeType: "image/png", sortOrder: 0,
  }).returning(); return row;
}
function assertShape(result: ReuseResult, ownerId: string) {
  expect(Object.keys(result).sort()).toEqual(["ownerId", "items", "page", "hasMore"].sort());
  expect(result.ownerId).toBe(ownerId); expect(Number.isInteger(result.page) && result.page > 0).toBe(true);
  expect(typeof result.hasMore).toBe("boolean"); expect(Array.isArray(result.items)).toBe(true);
  for (const item of result.items) {
    expect(Object.keys(item).sort()).toEqual(["id", "title", "status", "product", "omittedFields"].sort());
    expect(STATUSES).toContain(item.status);
    expect(Object.keys(item.product).every(field => PRODUCT_FIELDS.includes(field as ProductField))).toBe(true);
    expect(Array.isArray(item.omittedFields)).toBe(true);
    expect(item.omittedFields.every(field => typeof field === "string" && PRODUCT_FIELDS.includes(field as ProductField))).toBe(true);
    expect(new Set(item.omittedFields).size).toBe(item.omittedFields.length);
    for (const value of Object.values(item.product)) { expect(value).not.toBeNull(); expect(value).not.toBeUndefined(); if (typeof value === "number") expect(Number.isFinite(value) && value > 0).toBe(true); }
  }
}
async function sourceFingerprint(db: Database) {
  const listings = await db.execute(sql`select count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public.listings t`);
  const media = await db.execute(sql`select count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public.media t`);
  return JSON.parse(JSON.stringify({ listings, media }));
}

describe.skipIf(process.env.PRODUCT_REUSE_DB_PROOF !== "1")("reusable products actual router / canonical PostgreSQL", () => {
  let connection: ReturnType<typeof postgres> | undefined, db: Database, original: Record<string, unknown> | undefined;
  const runId = randomUUID(), directory = path.resolve("tmp/journey10/product-reuse/database-proof", runId);
  const proof: Record<string, unknown> = { runId, target: TARGET, cases: [],
    boundary: "Actual tRPC parser/router, current DB ownership/role, PostgreSQL projection/search/pagination, ordinary account-draft saves and readback. Forced rollback per case; synthetic auth/rate limit; no browser/provider/RLS acceptance.",
  };
  const note = () => fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(proof, null, 2));
  async function fingerprint() {
    assert(connection); const result: Record<string, unknown> = {};
    const tables = await connection`select c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname`;
    expect(tables).toHaveLength(54);
    for (const row of tables) {
      const [value] = await connection`select count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public.${connection(String(row.name))} t`;
      result[String(row.name)] = { count: Number(value.count), digest: String(value.digest) };
    } return result;
  }
  beforeAll(async () => {
    assert.equal(process.env.PRODUCT_REUSE_OTHER_FIXTURES_CLEANED, "1"); assert.equal(process.env.DATABASE_URL, TARGET);
    fs.mkdirSync(directory, { recursive: true }); proof.sources = sourceHashes(); note();
    connection = postgres(TARGET, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {},
      connection: { application_name: `product-reuse-proof-${runId.slice(0, 8)}`, statement_timeout: 10000, lock_timeout: 3000 },
    }); db = drizzle(connection, { schema });
    const [identity] = await connection`select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,current_setting('session_replication_role') replication`;
    expect(identity).toMatchObject({ name: "plankmarket_bootstrap_design_20260929", role: "postgres", address: "127.0.0.1", port: 55439, replication: "origin" });
    const others = await connection`select pid,application_name from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()`;
    expect(others).toHaveLength(0); proof.admission = { identity, otherSessions: others };
    original = await fingerprint(); proof.before = original; note();
    vi.stubGlobal("fetch", () => { bridge.denied.push("fetch"); throw new Error("Network forbidden in product-reuse proof"); });
  }, 30000);
  afterAll(async () => {
    try {
      if (original) { proof.after = await fingerprint(); expect(proof.after).toEqual(original); proof.publicDataUnchanged = true; }
      proof.deniedExternalCalls = bridge.denied; expect(bridge.denied).toEqual([]);
      proof.sourceReadback = sourceHashes(); expect(proof.sourceReadback).toEqual(proof.sources);
    } finally { if (fs.existsSync(directory)) note(); vi.unstubAllGlobals(); if (connection) await connection.end({ timeout: 2 }); }
  }, 30000);
  async function rollback(label: string, body: (executor: Database, evidence: Record<string, unknown>) => Promise<void>) {
    const sentinel = new Error("FORCED_PRODUCT_REUSE_ROLLBACK"); let failed: unknown, rolledBack = false, passed = false;
    const evidence: Record<string, unknown> = { label };
    try { await db.transaction(async tx => {
      const executor = tx as unknown as Database; bridge.db = executor;
      try { await body(executor, evidence); await tx.execute(sql`set constraints all immediate`); passed = true; }
      catch (error) { failed = error; } finally { throw sentinel; }
    }); } catch (error) { if (error === sentinel) rolledBack = true; else failed ??= error; }
    finally { bridge.db = null; }
    Object.assign(evidence, { passed: passed && !failed, rolledBack, error: failed instanceof Error ? failed.message : failed ? "unknown" : null });
    (proof.cases as unknown[]).push(evidence); note(); expect(rolledBack).toBe(true); if (failed) throw failed;
  }

  it.each(["seller", "admin"] as const)("allows current active pending %s to prepare owned product reuse", async role => rollback(`pending ${role}`, async (executor, evidence) => {
    const owner = await seedUser(executor, role, "pending"), foreign = await seedUser(executor);
    const own = await seedListing(executor, owner), other = await seedListing(executor, foreign);
    const before = await sourceFingerprint(executor), result = await reusable(caller(executor, owner), { expectedOwnerId: owner.id });
    assertShape(result, owner.id); expect(result.items.map(item => item.id)).toEqual([own.id]); expect(result.items.some(item => item.id === other.id)).toBe(false);
    expect(await sourceFingerprint(executor)).toEqual(before); evidence.result = result;
  }));

  it.each(["buyer", "inactive", "owner-mismatch", "anonymous", "stale-active", "stale-role"] as const)("rejects %s without changing source inventory", async mode => rollback(`authority ${mode}`, async (executor, evidence) => {
    const owner = await seedUser(executor, mode === "buyer" ? "buyer" : "seller", "verified", mode !== "inactive");
    await seedListing(executor, owner); const c = caller(executor, mode === "anonymous" ? null : owner);
    if (mode === "stale-active") await executor.update(schema.users).set({ active: false }).where(eq(schema.users.id, owner.id));
    if (mode === "stale-role") await executor.update(schema.users).set({ role: "buyer" }).where(eq(schema.users.id, owner.id));
    const before = await sourceFingerprint(executor), expectedCode = mode === "anonymous" ? "UNAUTHORIZED" : "FORBIDDEN";
    await expect(reusable(c, { expectedOwnerId: mode === "owner-mismatch" ? randomUUID() : owner.id })).rejects.toMatchObject({ code: expectedCode });
    expect(await sourceFingerprint(executor)).toEqual(before); evidence.expectedCode = expectedCode;
  }));

  it("returns only owned active/draft/sold/expired/archived product data and all sixteen allowed fields", async () => rollback("product-only projection", async (executor, evidence) => {
    const owner = await seedUser(executor), foreign = await seedUser(executor);
    const own: Listing[] = []; for (const status of STATUSES) own.push(await seedListing(executor, owner, { status }));
    const foreignRow = await seedListing(executor, foreign, { title: "FOREIGN_PRODUCT_MUST_NOT_APPEAR", createdAt: new Date(Date.now() + 1000) });
    const photo = await seedPhoto(executor, owner, own[0].id); await seedPhoto(executor, foreign, foreignRow.id);
    const before = await sourceFingerprint(executor), result = await reusable(caller(executor, owner), { expectedOwnerId: owner.id });
    assertShape(result, owner.id); expect(result.page).toBe(1); expect(result.hasMore).toBe(false);
    expect(result.items.map(item => item.id).sort()).toEqual(own.map(row => row.id).sort());
    expect(result.items.map(item => item.status).sort()).toEqual([...STATUSES].sort());
    for (const item of result.items) {
      expect(Object.keys(item.product).sort()).toEqual([...PRODUCT_FIELDS].sort()); expect(item.omittedFields).toEqual([]);
      const originalRow = own.find(row => row.id === item.id)!;
      expect(item.title).toBe(originalRow.title); expect(item.product).toEqual(Object.fromEntries(PRODUCT_FIELDS.map(key => [key, originalRow[key]])));
    }
    const serialized = JSON.stringify(result);
    for (const forbidden of ["sellerId", "description", "lotNumber", "condition", "totalSqFt", "moq", "askPricePerSqFt", "buyNowPrice", "floorPrice", "warehouseId", "locationZip", "palletWeight", "boxesPerPallet", "specificationProvenance", "specificationEvidenceId", "specificationReviewedAt", "media", "DO_NOT_COPY_PRIVATE_DESCRIPTION", "DO_NOT_COPY_SOURCE_LOT", foreignRow.id, photo.id, photo.url]) expect(serialized).not.toContain(forbidden);
    expect(await sourceFingerprint(executor)).toEqual(before); evidence.result = result;
  }));

  it("omits null/invalid legacy product values without repairing the source and normalizes null certifications", async () => rollback("legacy projection", async (executor, evidence) => {
    const owner = await seedUser(executor);
    const row = await seedListing(executor, owner, { species: null, finish: null, grade: null, color: null, colorFamily: null, brand: null, modelNumber: null,
      thickness: -1, width: 0, length: -2, wearLayer: 0, sqFtPerBox: -20, certifications: null });
    const before = await sourceFingerprint(executor), result = await reusable(caller(executor, owner), { expectedOwnerId: owner.id });
    assertShape(result, owner.id); expect(result.items).toHaveLength(1); const item = result.items[0]; expect(item.id).toBe(row.id);
    expect(item.product).toEqual({ materialType: "engineered", installationMethod: "floating", waterResistance: "not_waterproof", certifications: [] });
    for (const key of ["thickness", "width", "length", "wearLayer", "sqFtPerBox"]) expect(item.omittedFields).toContain(key);
    expect(await sourceFingerprint(executor)).toEqual(before); evidence.result = result;
  }));

  it("canonicalizes persisted preset floats, preserves positive custom dimensions and omits unmatched wear layers", async () => rollback("persisted product dimensions", async (executor, evidence) => {
    const owner = await seedUser(executor);
    const preset = await seedListing(executor, owner, { materialType: "vinyl_lvp", wearLayer: 0.3000000119, thickness: 0.31 });
    const custom = await seedListing(executor, owner, { materialType: "vinyl_lvp", width: 7.875, thickness: 0.4375, wearLayer: 0.777 });
    const physical = await executor.execute(sql`select wear_layer::double precision stored_wear from public.listings where id=${preset.id}`);
    expect(Number(physical[0]?.stored_wear)).toBeCloseTo(0.3000000119, 10); expect(Number(physical[0]?.stored_wear)).not.toBe(0.3);
    const before = await sourceFingerprint(executor), result = await reusable(caller(executor, owner), { expectedOwnerId: owner.id }); assertShape(result, owner.id);
    const normalized = result.items.find(item => item.id === preset.id)!, retained = result.items.find(item => item.id === custom.id)!;
    expect(normalized.product.wearLayer).toBe(0.3); expect(normalized.product.thickness).toBe(0.31);
    expect(retained.product.width).toBe(7.875); expect(retained.product.thickness).toBe(0.4375);
    expect(retained.product).not.toHaveProperty("wearLayer"); expect(retained.omittedFields).toContain("wearLayer");
    expect(await sourceFingerprint(executor)).toEqual(before); evidence.result = result; evidence.persistedPreset = physical;
  }));

  it.each([
    { field: "title", query: "Literal%Token", value: "Synthetic Literal%Token product", decoy: "Synthetic LiteralXToken product" },
    { field: "brand", query: "Literal_Token", value: "Literal_Token brand", decoy: "LiteralXToken brand" },
    { field: "modelNumber", query: "Literal\\Token", value: "Literal\\Token model", decoy: "LiteralToken model" },
  ] as const)("treats $field search wildcards as literal and trims case-insensitive input", async testCase => rollback(`literal search ${testCase.field}`, async (executor, evidence) => {
    const owner = await seedUser(executor), foreign = await seedUser(executor);
    const match = await seedListing(executor, owner, { [testCase.field]: testCase.value });
    await seedListing(executor, owner, { [testCase.field]: testCase.decoy }); await seedListing(executor, foreign, { [testCase.field]: testCase.value });
    const before = await sourceFingerprint(executor), input = { expectedOwnerId: owner.id, query: `  ${testCase.query.toLowerCase()}  ` };
    const result = await reusable(caller(executor, owner), input); assertShape(result, owner.id);
    expect(result.items.map(item => item.id)).toEqual([match.id]); expect(result.hasMore).toBe(false);
    expect(await sourceFingerprint(executor)).toEqual(before); evidence.result = result;
  }));

  it("defaults to twelve rows and paginates owned results stably by createdAt then id descending", async () => rollback("stable owned pagination", async (executor, evidence) => {
    const owner = await seedUser(executor), foreign = await seedUser(executor), rows: Listing[] = [];
    const tied = new Date("2026-10-01T12:00:00.000Z");
    for (let index = 0; index < 27; index++) rows.push(await seedListing(executor, owner, { title: `Reusable ordered product ${index}`, status: STATUSES[index % STATUSES.length], createdAt: new Date(tied.getTime() + (index < 3 ? 1000 : 0)) }));
    for (let index = 0; index < 3; index++) await seedListing(executor, foreign, { createdAt: new Date(tied.getTime() + 2000) });
    rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0));
    const expected = rows.map(row => row.id), before = await sourceFingerprint(executor), c = caller(executor, owner);
    const initial = await reusable(c, { expectedOwnerId: owner.id }); assertShape(initial, owner.id);
    expect(initial.items.map(item => item.id)).toEqual(expected.slice(0, 12)); expect(initial).toMatchObject({ page: 1, hasMore: true });
    const pages: ReuseResult[] = []; for (const page of [1, 2, 3]) pages.push(await reusable(c, { expectedOwnerId: owner.id, page, limit: 12 }));
    expect(pages.flatMap(page => page.items.map(item => item.id))).toEqual(expected); expect(pages.map(page => page.hasMore)).toEqual([true, true, false]);
    const maximum = await reusable(c, { expectedOwnerId: owner.id, limit: 24 }); expect(maximum.items.map(item => item.id)).toEqual(expected.slice(0, 24)); expect(maximum.hasMore).toBe(true);
    const tail = await reusable(c, { expectedOwnerId: owner.id, page: 2, limit: 24 }); expect(tail.items.map(item => item.id)).toEqual(expected.slice(24)); expect(tail.hasMore).toBe(false);
    const empty = await reusable(c, { expectedOwnerId: owner.id, page: 4 }); expect(empty).toMatchObject({ items: [], page: 4, hasMore: false });
    expect(await sourceFingerprint(executor)).toEqual(before); evidence.pages = pages;
  }));

  it("validates owner/query/page/limit bounds at the ordinary API input boundary", async () => rollback("input bounds", async (executor, evidence) => {
    const owner = await seedUser(executor), c = caller(executor, owner);
    const invalid: unknown[] = [{}, { expectedOwnerId: "not-a-uuid" }, ...[
      { query: "x".repeat(121) }, { query: 123 }, { page: 0 }, { page: -1 }, { page: 1.5 }, { limit: 0 }, { limit: 25 }, { limit: 1.5 },
    ].map(patch => ({ expectedOwnerId: owner.id, ...patch }))];
    for (const input of invalid) await expect(reusable(c, input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const empty = await reusable(c, { expectedOwnerId: owner.id, query: "   ", page: 1, limit: 1 }); assertShape(empty, owner.id); expect(empty.items).toEqual([]);
    evidence.rejectedInputs = invalid.length;
  }));

  it("saves selected product fields into an existing account draft through ordinary guards and rejects a stale revision", async () => rollback("ordinary draft persistence", async (executor, evidence) => {
    const owner = await seedUser(executor, "seller", "pending"), foreign = await seedUser(executor);
    await seedListing(executor, owner); const foreignListing = await seedListing(executor, foreign);
    const ownPhoto = await seedPhoto(executor, owner), foreignPhoto = await seedPhoto(executor, foreign, foreignListing.id);
    const before = await sourceFingerprint(executor), c = caller(executor, owner);
    const initialSnapshot: ListingDraftSnapshot = { schemaVersion: 2, currentStep: 1, defaultsApplied: false,
      formData: { title: "Existing draft keeps its own lot decisions", totalSqFt: 800, askPricePerSqFt: 7, locationZip: "77002", condition: "returns" }, uploadedMediaIds: [ownPhoto.id] };
    const original = await c.listing.saveFormDraft({ id: randomUUID(), expectedRevision: null, operationId: randomUUID(), snapshot: initialSnapshot });
    const products = await reusable(c, { expectedOwnerId: owner.id }); assertShape(products, owner.id); expect(products.items).toHaveLength(1);
    const snapshot: ListingDraftSnapshot = { ...initialSnapshot, formData: { ...initialSnapshot.formData, ...products.items[0].product } };
    const input = { id: original.id, expectedRevision: original.revision, operationId: randomUUID(), snapshot };
    const saved = await c.listing.saveFormDraft(input), replay = await c.listing.saveFormDraft(input);
    expect(saved.revision).toBe(original.revision + 1); expect(replay.revision).toBe(saved.revision);
    expect(saved.snapshot).toEqual(snapshot); expect(saved.snapshot.uploadedMediaIds).toEqual([ownPhoto.id]);
    const restored = await c.listing.getFormDraft({ id: original.id }); expect(restored?.snapshot).toEqual(snapshot); expect(restored?.revision).toBe(saved.revision);
    const [persisted] = await executor.select().from(schema.listingFormDrafts).where(eq(schema.listingFormDrafts.id, original.id));
    expect(persisted.snapshot).toEqual(snapshot); expect(persisted.sellerId).toBe(owner.id); expect(persisted.revision).toBe(saved.revision);
    await expect(c.listing.saveFormDraft({ ...input, operationId: randomUUID(), snapshot: { ...snapshot, formData: { ...snapshot.formData, brand: "Stale tab must not win" } } })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(c.listing.saveFormDraft({ ...input, expectedRevision: saved.revision, operationId: randomUUID(), snapshot: { ...snapshot, uploadedMediaIds: [foreignPhoto.id] } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(c.listing.saveFormDraft({ ...input, expectedRevision: saved.revision, operationId: randomUUID(), snapshot: { ...snapshot, formData: { ...snapshot.formData, specificationProvenance: "evidence_reviewed" } } } as Parameters<Caller["listing"]["saveFormDraft"]>[0])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await c.listing.getFormDraft({ id: original.id }))?.snapshot).toEqual(snapshot);
    expect(await sourceFingerprint(executor)).toEqual(before);
    evidence.draft = { id: saved.id, originalRevision: original.revision, savedRevision: saved.revision, snapshot, sourceUnchanged: true };
  }));
});
