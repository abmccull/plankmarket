// Candidate target: src/server/routers/__tests__/private-listing-photo-postgres.test.ts
// @vitest-environment node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db";
import type { createTRPCContext } from "@/server/trpc";
import type { ListingDraftSnapshot } from "@/lib/validators/listing-draft";
import { PhotoStorageFixture, PNG } from "./private-listing-photo-storage-fixture";

const bridge = vi.hoisted(() => ({ executor: null as unknown, storage: null as unknown,
  limits: [] as Array<{ prefix: string; identifier: string; count: number }>,
  limitMode: "allow" as "allow" | "deny" | "outage" | "budget", counters: new Map<string, number>() }));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://private-photo-proof.example.invalid" } }));
vi.mock("@/server/db", () => ({ db: new Proxy({}, { get(_target, key) {
  assert(bridge.executor, "Unadmitted database access");
  const target = bridge.executor as Record<PropertyKey, unknown>, value = Reflect.get(target, key);
  return typeof value === "function" ? value.bind(target) : value;
} }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => { throw new Error("Real Supabase forbidden"); }, createServiceClient: () => { throw new Error("Real service storage forbidden"); } }));
vi.mock("@/server/services/listing-photo-storage", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/services/listing-photo-storage")>();
  return { ...actual, privateListingPhotoStorage: async () => (bridge.storage as PhotoStorageFixture).factory() };
});
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}) }));
vi.mock("@/server/services/content-moderation", () => ({ checkViolationStatus: vi.fn() }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: () => { throw new Error("Events forbidden in private preparation proof"); } } }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  static slidingWindow(count: number, _window: string) { void _window; return { count }; }
  constructor(private options: { prefix: string; limiter: { count: number } }) {}
  async limit(identifier: string) {
    const entry = { prefix: this.options.prefix, identifier, ...this.options.limiter }; bridge.limits.push(entry);
    if (bridge.limitMode === "outage") throw new Error("Synthetic Redis outage");
    const key = `${entry.prefix}:${identifier}`, count = (bridge.counters.get(key) ?? 0) + 1; bridge.counters.set(key, count);
    return { success: bridge.limitMode !== "deny" && (bridge.limitMode !== "budget" || count <= entry.count) };
  }
} }));

const { createCallerFactory, createTRPCRouter, strictProtectedProcedure } = await import("@/server/trpc");
const { listingPhotoRouter } = await import("@/server/routers/listing-photo");
const { saveListingFormDraft, getListingFormDraft, advanceListingFormDraft, consumeListingFormDraft } = await import("@/server/services/listing-form-drafts");
const { assertListingCapacity } = await import("@/server/services/listing-publication");
const { saveListingMedia } = await import("@/server/services/listing-media");
const createCaller = createCallerFactory(createTRPCRouter({ listingPhoto: listingPhotoRouter,
  strictProbe: strictProtectedProcedure.mutation(() => ({ admitted: true })) }));
type User = typeof schema.users.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Caller = ReturnType<typeof createCaller>;
type Prepare = { expectedOwnerId: string; draftId: string; uploadId: string; fileName: string; fileSize: number; mimeType: "image/png" };
type Intent = { uploadId: string; path: string; token: string; expiresAt: Date };
type Draft = NonNullable<Awaited<ReturnType<typeof getListingFormDraft>>>;
type Receipt = { photo: { id: string; url: string; fileName: string; sortOrder: number }; draft: Draft };
const TARGET = "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
const SOURCE = ["src/server/routers/listing-photo.ts", "src/server/services/listing-photos.ts", "src/server/services/listing-photo-storage.ts", "src/server/services/listing-form-drafts.ts", "src/server/services/listing-media.ts", "src/server/db/schema/listing-photo-uploads.ts", "src/server/db/schema/media.ts", "src/server/trpc.ts"];
const sources = () => SOURCE.map(file => ({ path: file, sha256: fs.existsSync(file) ? createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null }));
function caller(db: Database, user: User, assurance: "aal1" | "aal2" | "error" = "aal1") {
  return createCaller({ db, user, authUser: { id: user.authId, email_confirmed_at: "2026-09-01" }, supabase: {}, clientIp: "127.0.0.1",
    getAuthAssurance: vi.fn(async () => {
      if (user.role !== "admin") throw new Error("Ordinary seller does not require admin MFA");
      if (assurance === "error") throw new Error("Assurance unavailable");
      return { currentLevel: assurance, nextLevel: "aal2", recentVerificationSatisfied: true };
    }),
  } as unknown as Awaited<ReturnType<typeof createTRPCContext>>);
}
const prepare = (c: Caller, input: Record<string, unknown>) => c.listingPhoto.prepare(input as unknown as Prepare) as Promise<Intent>;
const complete = async (c: Caller, input: Record<string, unknown>): Promise<Receipt> => {
  const receipt = await c.listingPhoto.complete(input as unknown as { expectedOwnerId: string; draftId: string; uploadId: string; expectedRevision: number }) as Receipt;
  // Service savepoints cannot fire deferred commit guards inside the forced outer
  // rollback. Flush the real guards at this logical request boundary, before a
  // later save/remove can legitimately change the original ready selection.
  const executor = bridge.executor as Database;
  await executor.execute(sql`set constraints all immediate`);
  await executor.execute(sql`set constraints all deferred`);
  return receipt;
};
const list = (c: Caller, input: Record<string, unknown>) => c.listingPhoto.list(input as { expectedOwnerId: string; draftId: string });
async function seed(db: Database, status = "pending", role: "seller" | "buyer" | "admin" = "seller") {
  const id = randomUUID();
  const [user] = await db.insert(schema.users).values({ id, authId: randomUUID(), email: `private-photo-${id}@example.invalid`, name: "Synthetic photo owner", businessName: "Synthetic flooring business", role, active: true, verified: status === "verified", verificationStatus: status }).returning();
  // A buyer fixture has no owned listing draft; it targets a separate seller's draft in denial cases.
  const snapshot: ListingDraftSnapshot = { schemaVersion: 2, currentStep: 2, defaultsApplied: true,
    formData: { title: "Preserve unfinished flooring lot", description: "Keep these notes", totalSqFt: 123, askPricePerSqFt: 0, allowOffers: false, locationState: "CO" }, uploadedMediaIds: [] };
  const draft = role === "buyer" ? null : await saveListingFormDraft(db, id, { id: randomUUID(), expectedRevision: null, operationId: randomUUID(), snapshot });
  return { user, draft: draft!, c: caller(db, user, role === "admin" ? "aal2" : "aal1") };
}
type Fixture = Awaited<ReturnType<typeof seed>>;
const input = (f: Fixture, changes: Partial<Prepare> = {}): Prepare => ({ expectedOwnerId: f.user.id, draftId: f.draft.id, uploadId: randomUUID(), fileName: "flooring.png", fileSize: PNG.byteLength, mimeType: "image/png", ...changes });
const completion = (f: Fixture, p: Prepare, revision = f.draft.revision) => ({ expectedOwnerId: f.user.id, draftId: f.draft.id, uploadId: p.uploadId, expectedRevision: revision });
const loadDraft = (db: Database, f: Fixture) => getListingFormDraft(db, f.user.id, f.draft.id);
async function ledger(db: Database, uploadId: string) {
  const rows = await db.execute<{ value: Record<string, unknown> }>(sql`select to_jsonb(t) value from public.listing_photo_uploads t where id=${uploadId}::uuid`);
  return rows[0]?.value;
}
async function ownedMedia(db: Database, userId: string) { return db.select().from(schema.media).where(eq(schema.media.uploaderId, userId)); }
function safePhotoList(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const fragment of ["incoming_path", "frozen_path", "incomingPath", "frozenPath", "content_sha256", "signedUrl", '"token"']) expect(serialized).not.toContain(fragment);
}

describe.skipIf(process.env.PRIVATE_LISTING_PHOTO_DB_PROOF !== "1")("private listing photos actual router / canonical PostgreSQL rollback", () => {
  let connection: ReturnType<typeof postgres>, db: Database, original: unknown;
  let storage: PhotoStorageFixture;
  const runId = randomUUID(), directory = path.resolve("tmp/journey10/private-listing-photos/backend-tests/proof", runId);
  const proof: Record<string, unknown> = { runId, target: TARGET, cases: [],
    boundary: "Actual router and canonical PostgreSQL; outer rollback every case; privileged DB role does not prove RLS; storage/Redis simulated; provider interleavings are not independent-session concurrency" };
  const note = () => fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(proof, null, 2));
  async function digest() {
    const tables = await connection`select c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname`;
    const result: Record<string, unknown> = {};
    for (const row of tables) {
      const [value] = await connection`select count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public.${connection(String(row.name))} t`;
      result[String(row.name)] = { count: Number(value.count), digest: String(value.digest) };
    }
    return result;
  }
  beforeAll(async () => {
    assert.equal(process.env.PRIVATE_LISTING_PHOTO_OTHER_FIXTURES_CLEANED, "1", "Root confirms no other fixture writers");
    const url = new URL(TARGET);
    assert.deepEqual({ hostname: url.hostname, port: url.port, pathname: url.pathname, username: url.username, password: url.password },
      { hostname: "127.0.0.1", port: "55439", pathname: "/plankmarket_bootstrap_design_20260929", username: "postgres", password: "" });
    fs.mkdirSync(directory, { recursive: true }); proof.sources = sources(); note();
    connection = postgres(TARGET, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {}, connection: {
      application_name: `private-photo-rollback-${runId.slice(0, 8)}`, search_path: "public,pg_catalog", statement_timeout: 10000, lock_timeout: 3000, idle_in_transaction_session_timeout: 15000 } });
    db = drizzle(connection, { schema });
    const [identity] = await connection`select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,current_setting('session_replication_role') replication,current_setting('row_security') row_security`;
    expect(identity).toMatchObject({ name: "plankmarket_bootstrap_design_20260929", role: "postgres", address: "127.0.0.1", port: 55439, replication: "origin", row_security: "on" });
    const checks = await connection`select conname,convalidated from pg_constraint where conrelid in ('public.listing_form_drafts'::regclass,'public.listing_photo_uploads'::regclass,'public.media'::regclass) order by conname`;
    const triggers = await connection`select c.relname,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.oid in ('public.listing_form_drafts'::regclass,'public.listing_photo_uploads'::regclass,'public.media'::regclass) and not t.tgisinternal order by c.relname,t.tgname`;
    // Canonical legacy migrations deliberately retain NOT VALID for historical rows.
    // PostgreSQL still enforces these constraints for every fixture INSERT/UPDATE.
    const legacyNotValidated = new Set(["media_one_parent_max_check", "media_uploader_required_check", "media_buyer_request_owner_lineage_fk", "media_listing_owner_lineage_fk"]);
    assert(checks.length > 0 && checks.every(row => row.convalidated || legacyNotValidated.has(row.conname)));
    assert(triggers.every(row => ["O", "A"].includes(row.tgenabled)));
    assert(triggers.some(row => row.relname === "listing_photo_uploads"), "Canonical private ledger guards must be present");
    proof.admission = { ...identity, checks, triggers }; original = await digest(); proof.before = original; note();
  }, 30000);
  afterAll(async () => {
    try {
      if (original) { proof.after = await digest(); expect(proof.after).toEqual(original); proof.publicDataUnchanged = true; }
      if (proof.sources) { proof.sourceReadback = sources(); expect(proof.sourceReadback).toEqual(proof.sources); }
      if (fs.existsSync(directory)) note();
    } finally { if (connection) await connection.end({ timeout: 2 }); }
  }, 30000);
  beforeEach(() => { storage = new PhotoStorageFixture(); bridge.storage = storage; bridge.limitMode = "allow"; bridge.limits = []; bridge.counters.clear(); });
  async function rollback(label: string, body: (tx: Tx, executor: Database) => Promise<void>) {
    const sentinel = new Error("FORCED_PRIVATE_PHOTO_ROLLBACK"); let failed: unknown, passed = false, rolledBack = false;
    try { await db.transaction(async tx => {
      const executor = tx as unknown as Database; bridge.executor = executor;
      try { await body(tx, executor); await tx.execute(sql`set constraints all immediate`); passed = true; }
      catch (error) { failed = error; }
      finally { throw sentinel; }
    }); } catch (error) { if (error === sentinel) rolledBack = true; else failed ??= error; }
    finally { bridge.executor = null; vi.restoreAllMocks(); vi.useRealTimers(); }
    (proof.cases as unknown[]).push({ label, passed: passed && !failed, rolledBack, errorName: failed instanceof Error ? failed.name : failed ? "unknown" : null, providerOperations: storage.calls.map(call => call.op) }); note();
    expect(rolledBack).toBe(true); if (failed) throw failed;
  }
  async function ready(f: Fixture, p = input(f), revision = f.draft.revision) {
    const ticket = await prepare(f.c, p); storage.upload(ticket);
    return { p, ticket, receipt: await complete(f.c, completion(f, p, revision)) };
  }

  it.each(["unverified", "pending", "rejected", "verified"])("prepares and atomically completes %s seller photos without MFA", async status => rollback(`seller-${status}`, async (_tx, executor) => {
    const f = await seed(executor, status), p = input(f), ticket = await prepare(f.c, p);
    expect(ticket.uploadId).toBe(p.uploadId); expect(new Date(ticket.expiresAt).getTime() - Date.now()).toBeGreaterThan(0);
    expect(await ownedMedia(executor, f.user.id)).toHaveLength(0); expect((await loadDraft(executor, f))?.revision).toBe(f.draft.revision);
    storage.upload(ticket); const receipt = await complete(f.c, completion(f, p));
    expect(receipt.photo.url).toBe(`/api/listing-photos/${receipt.photo.id}`);
    expect(receipt.draft.snapshot).toEqual({ ...f.draft.snapshot, uploadedMediaIds: [receipt.photo.id] });
    expect(receipt.draft.revision).toBe(f.draft.revision + 1); expect(receipt.draft.lastSaveOperationId).toBe(p.uploadId);
    const rows = await ownedMedia(executor, f.user.id); expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: receipt.photo.id, uploaderId: f.user.id, listingId: null, buyerRequestId: null, key: null, storageProvider: "supabase_listing" });
    expect(await ledger(executor, p.uploadId)).toMatchObject({ owner_id: f.user.id, draft_id: f.draft.id, draft_generation: f.draft.generation, ready_media_id: receipt.photo.id, completed_revision: receipt.draft.revision });
    expect((await loadDraft(executor, f))?.snapshot.uploadedMediaIds).toEqual([receipt.photo.id]);
    const listed = await list(f.c, { expectedOwnerId: f.user.id, draftId: f.draft.id }); expect(listed).toEqual([{ uploadId: p.uploadId, photo: receipt.photo }]); safePhotoList(listed);
  }));
  it.each(["buyer", "inactive", "wrong-owner", "foreign-draft", "missing-draft", "missing-owner"])("denies %s before touching storage", async mode => rollback(`deny-${mode}`, async (_tx, executor) => {
    const f = await seed(executor), other = await seed(executor, "pending", mode === "buyer" ? "buyer" : "seller"), p: Record<string, unknown> = input(f);
    let c = f.c;
    if (mode === "buyer") { c = other.c; p.expectedOwnerId = other.user.id; }
    if (mode === "inactive") await executor.update(schema.users).set({ active: false }).where(eq(schema.users.id, f.user.id));
    if (mode === "wrong-owner") p.expectedOwnerId = other.user.id;
    if (mode === "foreign-draft") p.draftId = other.draft.id;
    if (mode === "missing-draft") p.draftId = randomUUID();
    if (mode === "missing-owner") delete p.expectedOwnerId;
    await expect(prepare(c, p)).rejects.toBeDefined(); expect(storage.factoryCalls).toBe(0);
    expect(await ledger(executor, p.uploadId as string)).toBeUndefined();
    if (other.draft) expect((await loadDraft(executor, other))?.snapshot.uploadedMediaIds).toEqual([]);
  }));
  it.each(["missing-owner", "wrong-owner", "foreign-upload", "missing-revision"])("complete rejects %s before storage or draft changes", async mode => rollback(`complete-deny-${mode}`, async (_tx, executor) => {
    const f = await seed(executor), other = await seed(executor), p = input(f), ticket = await prepare(f.c, p); storage.upload(ticket);
    const request: Record<string, unknown> = completion(f, p); let c = f.c;
    if (mode === "missing-owner") delete request.expectedOwnerId;
    if (mode === "wrong-owner") request.expectedOwnerId = other.user.id;
    if (mode === "foreign-upload") { c = other.c; request.expectedOwnerId = other.user.id; request.draftId = other.draft.id; request.expectedRevision = other.draft.revision; }
    if (mode === "missing-revision") delete request.expectedRevision;
    const count = storage.factoryCalls; await expect(complete(c, request)).rejects.toBeDefined(); expect(storage.factoryCalls).toBe(count);
    expect(await ownedMedia(executor, f.user.id)).toHaveLength(0); expect((await loadDraft(executor, f))?.revision).toBe(f.draft.revision);
  }));
  it("rejects another account's upload UUID without leaking or replacing its intent", async () => rollback("foreign-upload-uuid", async (_tx, executor) => {
    const f = await seed(executor), other = await seed(executor), p = input(f); await prepare(f.c, p);
    const before = await ledger(executor, p.uploadId), count = storage.factoryCalls;
    await expect(prepare(other.c, input(other, { uploadId: p.uploadId }))).rejects.toBeDefined(); expect(storage.factoryCalls).toBe(count); expect(await ledger(executor, p.uploadId)).toEqual(before);
  }));
  it.each(["aal1", "error"] as const)("denies admin %s for every photo procedure", async assurance => rollback(`admin-${assurance}`, async (_tx, executor) => {
    const f = await seed(executor, "verified", "admin"), c = caller(executor, f.user, assurance), p = input(f);
    await expect(prepare(c, p)).rejects.toBeDefined(); await expect(complete(c, completion(f, p))).rejects.toBeDefined(); await expect(list(c, { expectedOwnerId: f.user.id, draftId: f.draft.id })).rejects.toBeDefined(); expect(storage.factoryCalls).toBe(0);
  }));
  it("admits an owned admin photo only at AAL2", async () => rollback("admin-aal2", async (_tx, executor) => { const f = await seed(executor, "verified", "admin"); expect((await ready(f)).receipt.draft.snapshot.uploadedMediaIds).toHaveLength(1); }));
  it("reconciles lost signed-token response with the same immutable intent and expiry", async () => rollback("lost-sign", async (_tx, executor) => {
    const f = await seed(executor), p = input(f); storage.failSignAfterIssue = true;
    await expect(prepare(f.c, p)).rejects.toBeDefined(); const before = await ledger(executor, p.uploadId); expect(before).toBeDefined();
    const ticket = await prepare(f.c, p), after = await ledger(executor, p.uploadId);
    expect(after).toEqual(before); expect(ticket.uploadId).toBe(p.uploadId); expect(new Date(ticket.expiresAt).toISOString()).toBe(new Date(String(after!.expires_at)).toISOString());
    storage.upload(ticket); await complete(f.c, completion(f, p)); expect(await ownedMedia(executor, f.user.id)).toHaveLength(1);
  }));
  it.each(["fileName", "fileSize", "mimeType", "draftId"])("rejects changed preparation payload %s for an existing UUID", async field => rollback(`changed-${field}`, async (_tx, executor) => {
    const f = await seed(executor), other = await seed(executor), p = input(f); await prepare(f.c, p); const before = await ledger(executor, p.uploadId), count = storage.calls.length;
    const changed = { ...p, [field]: field === "fileSize" ? PNG.byteLength + 1 : field === "draftId" ? other.draft.id : field === "mimeType" ? "image/jpeg" : "changed.png" };
    await expect(prepare(f.c, changed)).rejects.toBeDefined(); expect(await ledger(executor, p.uploadId)).toEqual(before); expect(storage.calls).toHaveLength(count);
  }));
  it.each([{ fileSize: 0 }, { fileSize: 4 * 1024 * 1024 + 1 }, { mimeType: "application/pdf" }, { mimeType: "image/svg+xml" }, { uploadId: "../unsafe" }])("rejects invalid input %j before storage", async change => rollback(`invalid-${JSON.stringify(change)}`, async (_tx, executor) => {
    const f = await seed(executor); await expect(prepare(f.c, { ...input(f), ...change })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(storage.factoryCalls).toBe(0);
  }));
  it("refuses new work after original two-hour expiry without extending it", async () => rollback("expired-intent", async (_tx, executor) => {
    const f = await seed(executor), p = input(f), ticket = await prepare(f.c, p); storage.upload(ticket); const before = await ledger(executor, p.uploadId);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(new Date(ticket.expiresAt).getTime() + 1));
    await expect(prepare(f.c, p)).rejects.toBeDefined(); await expect(complete(f.c, completion(f, p))).rejects.toBeDefined();
    expect((await ledger(executor, p.uploadId))?.expires_at).toEqual(before?.expires_at); expect(await ownedMedia(executor, f.user.id)).toHaveLength(0);
  }));
  it("caps 40 outstanding preparations and does not charge UUID retries again", async () => rollback("outstanding-quota", async (_tx, executor) => {
    const f = await seed(executor), first = input(f); await prepare(f.c, first);
    for (let n = 1; n < 40; n++) await prepare(f.c, input(f));
    const calls = storage.calls.length; await expect(prepare(f.c, input(f))).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" }); expect(storage.calls).toHaveLength(calls);
    expect((await prepare(f.c, first)).uploadId).toBe(first.uploadId);
    const rows = await executor.execute(sql`select id from public.listing_photo_uploads where owner_id=${f.user.id}::uuid`); expect(rows).toHaveLength(40);
  }));
  it("caps 200 daily preparations across draft generations", async () => rollback("daily-quota", async (_tx, executor) => {
    const f = await seed(executor);
    for (let generation = 0; generation < 5; generation++) {
      for (let n = 0; n < 40; n++) await prepare(f.c, input(f));
      f.draft = await advanceListingFormDraft(executor, f.user.id, { id: f.draft.id, expectedRevision: f.draft.revision, nextId: randomUUID(), operationId: randomUUID() });
    }
    const count = storage.calls.length; await expect(prepare(f.c, input(f))).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" }); expect(storage.calls).toHaveLength(count);
    expect(await executor.execute(sql`select id from public.listing_photo_uploads where owner_id=${f.user.id}::uuid`)).toHaveLength(200);
  }), 30000);
  it("20 sequential photos use independent fail-closed allowance and leave strict10 available", async () => rollback("photo-rate-budget", async (_tx, executor) => {
    const f = await seed(executor); bridge.limitMode = "budget";
    for (let n = 0; n < 20; n++) { const result = await ready(f); f.draft = result.receipt.draft; }
    expect(f.draft.snapshot.uploadedMediaIds).toHaveLength(20);
    const photoLimits = [...bridge.limits]; expect(photoLimits.some(entry => entry.count === 60 && entry.identifier.includes(f.user.id))).toBe(true);
    expect(photoLimits.every(entry => entry.prefix !== "rl:strict")).toBe(true);
    for (let n = 0; n < 10; n++) await f.c.strictProbe(); await expect(f.c.strictProbe()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  }), 30000);
  it.each(["deny", "outage"] as const)("photo limiter %s fails closed before provider", async mode => rollback(`limiter-${mode}`, async (_tx, executor) => {
    const f = await seed(executor); bridge.limitMode = mode;
    await expect(prepare(f.c, input(f))).rejects.toMatchObject({ code: mode === "deny" ? "TOO_MANY_REQUESTS" : "SERVICE_UNAVAILABLE" }); expect(storage.factoryCalls).toBe(0);
  }));
  it("propagates missing storage security configuration without creating trusted media or appending", async () => rollback("storage-readiness-failure", async (_tx, executor) => {
    const f = await seed(executor), p = input(f); storage.factoryError = new Error("Private bucket restrictive-policy readiness failed");
    await expect(prepare(f.c, p)).rejects.toBeDefined(); expect(storage.calls).toHaveLength(0); expect(await ownedMedia(executor, f.user.id)).toHaveLength(0); expect((await loadDraft(executor, f))?.snapshot).toEqual(f.draft.snapshot);
  }));
  it.each(["missing", "short", "oversize", "pdf", "svg", "wrong-raster"])("rejects %s provider bytes without an append", async mode => rollback(`bytes-${mode}`, async (_tx, executor) => {
    const f = await seed(executor), first = await ready(f); f.draft = first.receipt.draft; const p = input(f), ticket = await prepare(f.c, p), before = await loadDraft(executor, f);
    const bytes = mode === "short" ? PNG.slice(0, 9) : mode === "oversize" ? new Uint8Array(4 * 1024 * 1024 + 1) : new Uint8Array(PNG.byteLength);
    if (mode === "pdf") bytes.set(new TextEncoder().encode("%PDF-1.7"));
    if (mode === "svg") bytes.set(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'));
    if (mode === "wrong-raster") bytes.set([255, 216, 255, 0]);
    if (mode !== "missing") storage.upload(ticket, bytes);
    await expect(complete(f.c, completion(f, p))).rejects.toBeDefined(); expect(await loadDraft(executor, f)).toEqual(before); expect(await ownedMedia(executor, f.user.id)).toHaveLength(1);
  }));
  it("validates the actual frozen copy before trusting a ready photo", async () => rollback("frozen-byte-substitution", async (_tx, executor) => {
    const f = await seed(executor), p = input(f), ticket = await prepare(f.c, p); storage.upload(ticket);
    storage.copyReplacement = new Uint8Array(PNG.byteLength); storage.copyReplacement.set(new TextEncoder().encode("%PDF-"));
    await expect(complete(f.c, completion(f, p))).rejects.toBeDefined(); expect(await ownedMedia(executor, f.user.id)).toHaveLength(0); expect((await loadDraft(executor, f))?.snapshot.uploadedMediaIds).toEqual([]);
  }));
  it("recovers a copy response lost after the immutable object was written", async () => rollback("lost-copy", async (_tx, executor) => {
    const f = await seed(executor), p = input(f), ticket = await prepare(f.c, p); storage.upload(ticket); storage.failCopyAfterWrite = true;
    try { await complete(f.c, completion(f, p)); } catch { /* uncertain provider response requires same-intent reconciliation */ }
    const receipt = await complete(f.c, completion(f, p)); expect(receipt.draft.snapshot.uploadedMediaIds).toEqual([receipt.photo.id]); expect(receipt.draft.revision).toBe(f.draft.revision + 1); expect(await ownedMedia(executor, f.user.id)).toHaveLength(1);
  }));
  it("returns one authoritative receipt after a lost completion response and has a compatible save fingerprint", async () => rollback("lost-complete", async (_tx, executor) => {
    const f = await seed(executor), { p, receipt } = await ready(f), providerCount = storage.calls.length;
    const repeat = await complete(f.c, completion(f, p)); expect(repeat).toEqual(receipt); expect(storage.calls).toHaveLength(providerCount); expect(await ownedMedia(executor, f.user.id)).toHaveLength(1);
    const existingSaveReceipt = await saveListingFormDraft(executor, f.user.id, { id: f.draft.id, expectedRevision: f.draft.revision, operationId: p.uploadId, snapshot: receipt.draft.snapshot });
    expect(existingSaveReceipt.revision).toBe(receipt.draft.revision);
  }));
  it("a completed photo removed later never returns to the selection on completion retry", async () => rollback("removed-no-resurrection", async (_tx, executor) => {
    const f = await seed(executor), { p, receipt } = await ready(f);
    const removed = await saveListingFormDraft(executor, f.user.id, { id: f.draft.id, expectedRevision: receipt.draft.revision, operationId: randomUUID(), snapshot: { ...receipt.draft.snapshot, uploadedMediaIds: [] } });
    const repeat = await complete(f.c, completion(f, p)); expect(repeat.photo.id).toBe(receipt.photo.id); expect(repeat.draft.snapshot.uploadedMediaIds).toEqual([]); expect(repeat.draft.revision).toBe(removed.revision);
    const listed = await list(f.c, { expectedOwnerId: f.user.id, draftId: f.draft.id }); expect(JSON.stringify(listed)).toContain(receipt.photo.id); safePhotoList(listed);
  }));
  it("preserves another device's text on stale revision and explicitly refreshed completion", async () => rollback("stale-revision", async (_tx, executor) => {
    const f = await seed(executor), p = input(f), ticket = await prepare(f.c, p); storage.upload(ticket);
    const newer = await saveListingFormDraft(executor, f.user.id, { id: f.draft.id, expectedRevision: f.draft.revision, operationId: randomUUID(), snapshot: { ...f.draft.snapshot, formData: { ...f.draft.snapshot.formData, description: "Other device reviewed this" } } });
    await expect(complete(f.c, completion(f, p))).rejects.toMatchObject({ code: "CONFLICT" }); expect(await loadDraft(executor, f)).toEqual(newer); expect(await ownedMedia(executor, f.user.id)).toHaveLength(0);
    const receipt = await complete(f.c, completion(f, p, newer.revision)); expect(receipt.draft.snapshot.formData).toEqual(newer.snapshot.formData); expect(receipt.draft.revision).toBe(newer.revision + 1);
  }));
  it.each(["save", "advance", "deactivate", "role-change"])("rechecks %s that occurs while provider transfer is in flight", async mode => rollback(`late-${mode}`, async (_tx, executor) => {
    const f = await seed(executor), p = input(f), ticket = await prepare(f.c, p); storage.upload(ticket); let advanced: Draft | null = null;
    storage.afterFrozenCopy = async () => {
      storage.afterFrozenCopy = null;
      if (mode === "save") await saveListingFormDraft(executor, f.user.id, { id: f.draft.id, expectedRevision: f.draft.revision, operationId: randomUUID(), snapshot: { ...f.draft.snapshot, formData: { title: "Concurrent new text" } } });
      if (mode === "advance") advanced = await advanceListingFormDraft(executor, f.user.id, { id: f.draft.id, expectedRevision: f.draft.revision, nextId: randomUUID(), operationId: randomUUID() });
      if (mode === "deactivate") await executor.update(schema.users).set({ active: false }).where(eq(schema.users.id, f.user.id));
      if (mode === "role-change") await executor.update(schema.users).set({ role: "buyer" }).where(eq(schema.users.id, f.user.id));
    };
    await expect(complete(f.c, completion(f, p))).rejects.toBeDefined(); expect(await ownedMedia(executor, f.user.id)).toHaveLength(0);
    const old = await executor.query.listingFormDrafts.findFirst({ where: eq(schema.listingFormDrafts.id, f.draft.id) }); expect(old?.snapshot.uploadedMediaIds).toEqual([]);
    if (advanced) expect((advanced as Draft).snapshot.uploadedMediaIds).toEqual([]);
  }));
  it("cannot append a 21st selected photo and preserves cover order", async () => rollback("selected-cap", async (_tx, executor) => {
    const f = await seed(executor); for (let n = 0; n < 20; n++) f.draft = (await ready(f)).receipt.draft;
    const before = await loadDraft(executor, f), p = input(f), ticket = await prepare(f.c, p); storage.upload(ticket);
    await expect(complete(f.c, completion(f, p))).rejects.toBeDefined(); expect(await loadDraft(executor, f)).toEqual(before); expect(await ownedMedia(executor, f.user.id)).toHaveLength(20);
  }), 30000);
  it("list excludes incomplete uploads and denies foreign/old drafts without leaking tokens", async () => rollback("safe-list", async (_tx, executor) => {
    const f = await seed(executor), other = await seed(executor), completed = await ready(f), pending = input(f); await prepare(f.c, pending);
    const result = await list(f.c, { expectedOwnerId: f.user.id, draftId: f.draft.id }); expect(JSON.stringify(result)).toContain(completed.receipt.photo.id); expect(JSON.stringify(result)).not.toContain(pending.uploadId); safePhotoList(result);
    await expect(list(other.c, { expectedOwnerId: other.user.id, draftId: f.draft.id })).rejects.toBeDefined();
    f.draft = completed.receipt.draft; await advanceListingFormDraft(executor, f.user.id, { id: f.draft.id, expectedRevision: f.draft.revision, nextId: randomUUID(), operationId: randomUUID() });
    await expect(list(f.c, { expectedOwnerId: f.user.id, draftId: f.draft.id })).rejects.toBeDefined();
  }));
  it("approval keeps exact photos attachable without a provider promotion and public UploadThing remains supported", async () => rollback("publication-gate", async (tx, executor) => {
    const f = await seed(executor), completed = await ready(f); await expect(assertListingCapacity(tx, f.user.id, 1)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await executor.update(schema.users).set({ verificationStatus: "verified", verified: true }).where(eq(schema.users.id, f.user.id)); await assertListingCapacity(tx, f.user.id, 1);
    const [listing] = await tx.insert(schema.listings).values({ sellerId: f.user.id, title: "Synthetic private photo lot", materialType: "hardwood", totalSqFt: 123, askPricePerSqFt: 1, condition: "new_overstock", status: "draft" }).returning();
    const [legacy] = await tx.insert(schema.media).values({ uploaderId: f.user.id, url: "https://utfs.io/f/synthetic-public-photo", key: `synthetic-${randomUUID()}`, fileName: "legacy.png", fileSize: PNG.byteLength, mimeType: "image/png" }).returning();
    const count = storage.calls.length; await saveListingMedia(tx, listing, [completed.receipt.photo.id, legacy.id]);
    // Canonical private-photo lineage requires original published history in
    // the same transaction as attachment; preserve the existing assertions.
    const savedDraft = await tx.query.listingFormDrafts.findFirst({ where: eq(schema.listingFormDrafts.id, f.draft.id) });
    assert(savedDraft); await consumeListingFormDraft(tx, savedDraft, listing.id, "a".repeat(64));
    expect(storage.calls).toHaveLength(count);
    expect((await ownedMedia(executor, f.user.id)).filter(row => row.listingId === listing.id).map(row => row.id).sort()).toEqual([completed.receipt.photo.id, legacy.id].sort());
  }));
});
