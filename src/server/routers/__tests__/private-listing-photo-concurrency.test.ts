// Candidate: src/server/routers/__tests__/private-listing-photo-concurrency.test.ts
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

const bridge = vi.hoisted(() => ({
  globalDb: null as unknown, storage: null as unknown, labels: new Map<unknown, string>(),
  beforeStorage: null as null | ((label: string, operation: string, paths: string[]) => Promise<void>),
  events: [] as unknown[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://private-photo-concurrency.example.invalid" } }));
vi.mock("@/server/db", () => ({ db: new Proxy({}, { get(_target, key) {
  assert(bridge.globalDb, "Database not admitted");
  const target = bridge.globalDb as Record<PropertyKey, unknown>, value = Reflect.get(target, key);
  return typeof value === "function" ? value.bind(target) : value;
} }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => { throw new Error("Live auth forbidden"); }, createServiceClient: () => { throw new Error("Live storage forbidden"); } }));
vi.mock("@/server/services/listing-photo-storage", async importOriginal => {
  const actual = await importOriginal<typeof import("@/server/services/listing-photo-storage")>();
  return { ...actual, privateListingPhotoStorage: async (options: { database?: unknown } = {}) => {
    const label = bridge.labels.get(options.database); assert(label, "Storage must receive the actual caller's database dependency");
    const store = await (bridge.storage as PhotoStorageFixture).factory();
    return {
      createSignedUploadUrl: async (...args: Parameters<PhotoStorageFixture["createSignedUploadUrl"]>) => {
        await bridge.beforeStorage?.(label, "sign", [args[0]]); return store.createSignedUploadUrl(...args);
      },
      download: async (objectPath: string) => { await bridge.beforeStorage?.(label, "download", [objectPath]); return store.download(objectPath); },
      copy: async (from: string, to: string) => { await bridge.beforeStorage?.(label, "copy", [from, to]); return store.copy(from, to); },
      remove: async (paths: string[]) => { await bridge.beforeStorage?.(label, "remove", paths); return store.remove(paths); },
    };
  } };
});
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}), redis: { get: async () => null, set: async () => "OK", del: async () => 0 } }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class { static slidingWindow() { return {}; } async limit() { return { success: true }; } } }));
vi.mock("@/server/services/content-moderation", () => ({ checkViolationStatus: vi.fn() }));
vi.mock("@/server/services/priority1", () => ({ priority1: { getSuggestedClass: () => { throw new Error("Freight provider forbidden; fixture supplies class"); } } }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { async send(event: unknown) { bridge.events.push(event); return { ids: [`local-publication-${bridge.events.length}`] }; } } }));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { listingPhotoRouter } = await import("@/server/routers/listing-photo");
const { listingRouter } = await import("@/server/routers/listing");
const { listingFormSchema } = await import("@/lib/validators/listing");
const createCaller = createCallerFactory(createTRPCRouter({ listingPhoto: listingPhotoRouter, listing: listingRouter }));
type Caller = ReturnType<typeof createCaller>;
type User = typeof schema.users.$inferSelect;
type Draft = NonNullable<Awaited<ReturnType<Caller["listing"]["getFormDraft"]>>>;
type PoolName = "a" | "b" | "control" | "observer";
type Outcome<T> = { status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown };
const settle = <T>(promise: Promise<T>): Promise<Outcome<T>> => promise.then((value): Outcome<T> => ({ status: "fulfilled", value }), (reason): Outcome<T> => ({ status: "rejected", reason }));
const TARGET = "postgresql://postgres@127.0.0.1:55439/plankmarket_private_photos_concurrency_20261001";
const SOURCE = ["drizzle/0014_auth_data_hardening.sql", "drizzle/0033_security_privacy_and_tenancy.sql", "drizzle/0047_private_listing_photos.sql", "src/server/routers/listing-photo.ts", "src/server/routers/listing.ts", "src/server/services/listing-photos.ts", "src/server/services/listing-photo-storage.ts", "src/lib/listing-photos.ts", "src/server/services/listing-form-drafts.ts", "src/server/services/listing-media.ts", "src/server/services/listing-publication.ts", "src/server/db/schema/listing-photo-uploads.ts", "src/server/db/schema/listing-form-drafts.ts", "src/server/db/schema/media.ts", "src/server/trpc.ts", "src/server/routers/__tests__/private-listing-photo-storage-fixture.ts", "src/server/routers/__tests__/private-listing-photo-concurrency.test.ts"];
const sourceBinding = () => SOURCE.map(file => ({ path: file, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") }));
const LEGACY_NOT_VALID = new Set(["media_one_parent_max_check", "media_uploader_required_check", "media_buyer_request_owner_lineage_fk", "media_listing_owner_lineage_fk"]);
const ALLOWED_ADDITIONS = new Set(["users", "listing_form_drafts", "listing_photo_uploads", "media", "listings", "audit_events"]);
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { release, async wait(label: string, ms = 8000) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`Barrier deadline: ${label}`)), ms); })]); }
    finally { if (timer) clearTimeout(timer); }
  } };
}
function makeCaller(db: Database, user: User) {
  return createCaller({ db, user, authUser: { id: user.authId, email_confirmed_at: "2026-09-01" }, supabase: {}, clientIp: "127.0.0.1",
    getAuthAssurance: async () => { throw new Error("Ordinary seller must not require admin MFA"); },
  } as unknown as Awaited<ReturnType<typeof createTRPCContext>>);
}

describe.skipIf(process.env.PRIVATE_LISTING_PHOTO_CONCURRENCY_PROOF !== "1")("private listing photos separate-session canonical clone proof", () => {
  const runId = randomUUID(), directory = path.resolve("tmp/journey10/private-listing-photos/concurrency/proof", runId);
  const pools = {} as Record<PoolName, ReturnType<typeof postgres>>;
  const databases = {} as Record<PoolName, Database>;
  const pids = {} as Record<PoolName, number>;
  let original: Record<string, { count: number; hashes: Record<string, number> }> | undefined;
  let storage: PhotoStorageFixture;
  const owners: string[] = [];
  const proof: Record<string, unknown> = { runId, target: TARGET, cases: [], cleanup: "REQUIRED: root drops this exact disposable clone after retaining proof; private history is never row-deleted",
    boundary: "Separate max:1 PostgreSQL pools and actual routers; canonical constraints/triggers enabled; simulated storage/Redis/Inngest; postgres privilege does not prove RLS; no HTTP/browser/provider acceptance" };
  const note = () => fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(proof, null, 2));
  async function dataSnapshot() {
    const connection = pools.observer;
    const tables = await connection`select c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname`;
    const result: Record<string, { count: number; hashes: Record<string, number> }> = {};
    for (const table of tables) {
      const rows = await connection`select md5(to_jsonb(t)::text) hash,count(*)::int count from public.${connection(String(table.name))} t group by md5(to_jsonb(t)::text)`;
      const hashes = Object.fromEntries(rows.map(row => [String(row.hash), Number(row.count)]));
      result[String(table.name)] = { count: Object.values(hashes).reduce((a, b) => a + b, 0), hashes };
    }
    return result;
  }
  beforeAll(async () => {
    assert.equal(process.env.PRIVATE_LISTING_PHOTO_DISPOSABLE_CLONE_ADMITTED, "1");
    assert.equal(process.env.PRIVATE_LISTING_PHOTO_OTHER_FIXTURES_CLEANED, "1");
    const url = new URL(TARGET);
    assert.deepEqual({ host: url.hostname, port: url.port, database: url.pathname, user: url.username, password: url.password },
      { host: "127.0.0.1", port: "55439", database: "/plankmarket_private_photos_concurrency_20261001", user: "postgres", password: "" });
    fs.mkdirSync(directory, { recursive: true }); proof.sources = sourceBinding(); note();
    for (const name of ["a", "b", "control", "observer"] as const) {
      const connection = postgres(TARGET, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {}, connection: {
        application_name: `photo-concurrency-${runId.slice(0, 8)}-${name}`, search_path: "public,pg_catalog", statement_timeout: 15000, lock_timeout: 12000, idle_in_transaction_session_timeout: 15000,
      } });
      pools[name] = connection; databases[name] = drizzle(connection, { schema }); bridge.labels.set(databases[name], name);
      const [identity] = await connection`select pg_backend_pid() pid,current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,current_setting('session_replication_role') replication,current_setting('row_security') row_security`;
      expect(identity).toMatchObject({ name: "plankmarket_private_photos_concurrency_20261001", role: "postgres", address: "127.0.0.1", port: 55439, replication: "origin", row_security: "on" }); pids[name] = Number(identity.pid);
    }
    expect(new Set(Object.values(pids)).size).toBe(4); proof.backendPids = pids;
    const checks = await pools.observer`select c.relname table_name,x.conname,x.convalidated from pg_constraint x join pg_class c on c.oid=x.conrelid where x.conrelid in ('public.listing_form_drafts'::regclass,'public.listing_photo_uploads'::regclass,'public.media'::regclass) order by x.conname`;
    for (const check of checks) assert(check.convalidated || (check.table_name === "media" && LEGACY_NOT_VALID.has(String(check.conname))), `Unvalidated nonlegacy constraint ${check.conname}`);
    const triggers = await pools.observer`select c.relname,t.tgname,t.tgenabled,t.tgisinternal from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.oid in ('public.listing_form_drafts'::regclass,'public.listing_photo_uploads'::regclass,'public.media'::regclass) order by c.relname,t.tgname`;
    for (const name of ["listing_photo_uploads_guard", "media_listing_photo_guard", "listing_photo_ready_consistency", "media_listing_photo_consistency", "listing_drafts_private_photo_guard"]) assert(triggers.some(row => row.tgname === name), `Missing canonical trigger ${name}`);
    assert(triggers.every(row => ["O", "A"].includes(String(row.tgenabled))));
    proof.admission = { checks, triggers }; bridge.globalDb = databases.observer;
    vi.stubGlobal("fetch", async () => { throw new Error("Network fetch forbidden in disconnected concurrency proof"); });
    original = await dataSnapshot(); proof.before = original; note();
  }, 30000);
  afterAll(async () => {
    try {
      if (original) {
        const after = await dataSnapshot(); proof.after = after;
        const additions: Record<string, number> = {};
        expect(Object.keys(after)).toEqual(Object.keys(original));
        for (const [table, before] of Object.entries(original)) {
          for (const [hash, count] of Object.entries(before.hashes)) expect(after[table].hashes[hash] ?? 0, `Pre-existing row changed: ${table}`).toBeGreaterThanOrEqual(count);
          const delta = after[table].count - before.count; expect(delta).toBeGreaterThanOrEqual(0);
          if (delta) { expect(ALLOWED_ADDITIONS.has(table), `Unexpected changed table ${table}`).toBe(true); additions[table] = delta; }
        }
        proof.originalRowsPreserved = true; proof.additions = additions;
      }
      if (proof.sources) { proof.sourceReadback = sourceBinding(); expect(proof.sourceReadback).toEqual(proof.sources); }
      proof.fixtureOwners = owners;
    } finally {
      if (fs.existsSync(directory)) note(); bridge.globalDb = null; bridge.beforeStorage = null; vi.unstubAllGlobals();
      await Promise.allSettled(Object.values(pools).map(pool => pool.end({ timeout: 2 })));
    }
  }, 30000);
  beforeEach(() => { storage = new PhotoStorageFixture(); bridge.storage = storage; bridge.beforeStorage = null; bridge.events = []; });
  async function record(label: string, body: (evidence: Record<string, unknown>) => Promise<void>) {
    const evidence: Record<string, unknown> = { label, passed: false, pids: { ...pids } };
    try { await body(evidence); evidence.passed = true; }
    catch (error) { evidence.errorName = error instanceof Error ? error.name : "unknown"; evidence.errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : null; throw error; }
    finally { bridge.beforeStorage = null; evidence.providerCalls = storage.calls.map(call => call.op); (proof.cases as unknown[]).push(evidence); proof.fixtureOwners = owners; note(); }
  }
  async function seed() {
    const id = randomUUID(); owners.push(id);
    const [user] = await databases.control.insert(schema.users).values({ id, authId: randomUUID(), email: `photo-concurrency-${id}@example.invalid`, name: "Synthetic concurrency seller", businessName: "Synthetic flooring warehouse", role: "seller", active: true, verificationStatus: "verified", verified: true }).returning();
    const a = makeCaller(databases.a, user), b = makeCaller(databases.b, user);
    const snapshot: ListingDraftSnapshot = { schemaVersion: 2, currentStep: 3, defaultsApplied: true, uploadedMediaIds: [], formData: {
      title: "Synthetic Oak Concurrency Lot", description: "Synthetic stock for disconnected concurrency proof", materialType: "hardwood", totalSqFt: 100, totalPallets: 1, askPricePerSqFt: 1,
      condition: "new_overstock", moq: 1, moqUnit: "pallets", palletWeight: 100, palletLength: 48, palletWidth: 40, palletHeight: 36,
      locationCity: "Denver", locationState: "CO", locationZip: "80202", freightClass: "70", allowOffers: true,
    } };
    const draft = await a.listing.saveFormDraft({ id: randomUUID(), expectedRevision: null, operationId: randomUUID(), snapshot });
    return { user, a, b, draft };
  }
  type Fixture = Awaited<ReturnType<typeof seed>>;
  async function pending(f: Fixture, caller = f.a) {
    const input = { expectedOwnerId: f.user.id, draftId: f.draft.id, uploadId: randomUUID(), fileName: "synthetic-floor.png", fileSize: PNG.byteLength, mimeType: "image/png" as const };
    const ticket = await caller.listingPhoto.prepare(input); storage.upload(ticket);
    const row = await databases.observer.query.listingPhotoUploads.findFirst({ where: eq(schema.listingPhotoUploads.id, input.uploadId) }); assert(row);
    return { input, ticket, frozenPath: row.frozenPath, complete: { expectedOwnerId: f.user.id, draftId: f.draft.id, uploadId: input.uploadId, expectedRevision: f.draft.revision } };
  }
  async function ready(f: Fixture) { const p = await pending(f); const result = await f.a.listingPhoto.complete(p.complete); f.draft = result.draft; return { ...p, result }; }
  const currentDraft = (f: Fixture) => f.a.listing.getFormDraft({ id: f.draft.id });
  const currentMedia = (f: Fixture) => databases.observer.select().from(schema.media).where(eq(schema.media.uploaderId, f.user.id));
  const createInput = (draft: Draft) => ({ ...listingFormSchema.parse({ ...draft.snapshot.formData, mediaIds: draft.snapshot.uploadedMediaIds }), accountDraft: { id: draft.id, revision: draft.revision } });
  function holdFrozenRead(p: { frozenPath: string }) {
    const started = gate(), release = gate(); let held = false;
    bridge.beforeStorage = async (label, operation, paths) => {
      if (label === "a" && operation === "download" && paths[0] === p.frozenPath && storage.objects.has(p.frozenPath) && !held) {
        held = true; started.release(); await release.wait("release frozen read");
      }
    };
    return { started, release };
  }

  it("simultaneous same-upload completion yields one committed ready append", async () => record("same-upload-completion", async evidence => {
    const f = await seed(), p = await pending(f), arrived = new Set<string>(), both = gate(), release = gate();
    bridge.beforeStorage = async (label, operation, paths) => {
      if (["a", "b"].includes(label) && operation === "download" && paths[0] === p.frozenPath && !arrived.has(label)) {
        arrived.add(label); if (arrived.size === 2) both.release(); await release.wait("simultaneous frozen reads");
      }
    };
    const pa = settle(f.a.listingPhoto.complete(p.complete)), pb = settle(f.b.listingPhoto.complete(p.complete));
    try { await both.wait("both independent callers reached provider boundary"); evidence.providerBarrier = [...arrived].sort(); }
    finally { release.release(); await Promise.all([pa, pb]); }
    const outcomes = await Promise.all([pa, pb]); expect(outcomes.every(result => result.status === "fulfilled")).toBe(true);
    const first = outcomes[0]; assert(first.status === "fulfilled"); const second = outcomes[1]; assert(second.status === "fulfilled");
    expect(second.value.photo.id).toBe(first.value.photo.id); expect(first.value.draft.revision).toBe(f.draft.revision + 1); expect(second.value.draft.revision).toBe(first.value.draft.revision);
    expect((await currentDraft(f))?.snapshot.uploadedMediaIds).toEqual([first.value.photo.id]); expect(await currentMedia(f)).toHaveLength(1);
    const ledger = await databases.observer.query.listingPhotoUploads.findFirst({ where: eq(schema.listingPhotoUploads.id, p.input.uploadId) }); expect(ledger).toMatchObject({ readyMediaId: first.value.photo.id, completedRevision: f.draft.revision + 1 });
    expect(ledger?.contentSha256).toBe(createHash("sha256").update(PNG).digest("hex")); expect(storage.objects.get(p.frozenPath)).toEqual(PNG);
    bridge.beforeStorage = null; const retry = await f.b.listingPhoto.complete(p.complete); expect(retry.draft.revision).toBe(first.value.draft.revision); expect(await currentMedia(f)).toHaveLength(1);
    evidence.uploadId = p.input.uploadId; evidence.mediaId = first.value.photo.id;
  }), 30000);

  it("a committed save on another connection defeats stale completion without losing text", async () => record("competing-draft-revision", async evidence => {
    const f = await seed(), p = await pending(f), hold = holdFrozenRead(p), completing = settle(f.a.listingPhoto.complete(p.complete)); let newer: Draft | null = null;
    try {
      await hold.started.wait("caller A ready for final commit");
      newer = await f.b.listing.saveFormDraft({ id: f.draft.id, expectedRevision: f.draft.revision, operationId: randomUUID(), snapshot: { ...f.draft.snapshot, formData: { ...f.draft.snapshot.formData, description: "Reviewed on the second connection" } } });
    } finally { hold.release.release(); await completing; }
    const outcome = await completing; expect(outcome).toMatchObject({ status: "rejected", reason: { code: "CONFLICT" } }); assert(newer);
    expect(await currentDraft(f)).toEqual(newer); expect(await currentMedia(f)).toHaveLength(0);
    const before = await databases.observer.query.listingPhotoUploads.findFirst({ where: eq(schema.listingPhotoUploads.id, p.input.uploadId) }); expect(before?.readyMediaId).toBeNull();
    bridge.beforeStorage = null; const retry = await f.a.listingPhoto.complete({ ...p.complete, expectedRevision: newer.revision });
    expect(retry.draft.snapshot.formData).toEqual(newer.snapshot.formData); expect(retry.draft.revision).toBe(newer.revision + 1); expect(await currentMedia(f)).toHaveLength(1);
    evidence.otherConnectionCommittedRevision = newer.revision; evidence.completedRevision = retry.draft.revision;
  }), 30000);

  it("two lock-blocked preparations compete for only the final outstanding slot", async () => record("outstanding-last-slot", async evidence => {
    const f = await seed();
    const inputs = Array.from({ length: 41 }, () => ({ expectedOwnerId: f.user.id, draftId: f.draft.id, uploadId: randomUUID(), fileName: "quota.png", fileSize: PNG.byteLength, mimeType: "image/png" as const }));
    for (const input of inputs.slice(0, 39)) await f.a.listingPhoto.prepare(input);
    const held = gate(), release = gate();
    const holder = settle(databases.control.transaction(async tx => { await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`listing-form-drafts:${f.user.id}`}, 0))`); held.release(); await release.wait("release quota lock"); }));
    try { await held.wait("control owns quota serialization lock"); }
    catch (error) { release.release(); await holder; throw error; }
    const pa = settle(f.a.listingPhoto.prepare(inputs[39])), pb = settle(f.b.listingPhoto.prepare(inputs[40]));
    let waits: unknown[] = [];
    try {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const rows = await pools.observer`select pid,wait_event_type,wait_event,state from pg_stat_activity where pid in (${pids.a},${pids.b}) order by pid`;
        if (rows.length === 2 && rows.every(row => row.wait_event_type === "Lock")) { waits = [...rows]; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waits).toHaveLength(2); evidence.databaseLockWaits = waits;
    } finally { release.release(); await Promise.all([holder, pa, pb]); }
    expect(await holder).toMatchObject({ status: "fulfilled" });
    const outcomes = await Promise.all([pa, pb]), success = outcomes.filter(result => result.status === "fulfilled"), failure = outcomes.filter(result => result.status === "rejected");
    expect(success).toHaveLength(1); expect(failure).toHaveLength(1); expect(failure[0]).toMatchObject({ reason: { code: "TOO_MANY_REQUESTS" } });
    expect(await databases.observer.select().from(schema.listingPhotoUploads).where(eq(schema.listingPhotoUploads.ownerId, f.user.id))).toHaveLength(40);
    expect(storage.calls.filter(call => call.op === "sign")).toHaveLength(40);
    const winner = outcomes[0].status === "fulfilled" ? inputs[39] : inputs[40]; await f.a.listingPhoto.prepare(winner);
    expect(await databases.observer.select().from(schema.listingPhotoUploads).where(eq(schema.listingPhotoUploads.ownerId, f.user.id))).toHaveLength(40);
    evidence.winnerUploadId = winner.uploadId;
  }), 30000);

  it("publication commits original photos while a late completion is refused", async () => record("publication-wins", async evidence => {
    const f = await seed(), first = await ready(f), reviewed = f.draft, p = await pending(f), hold = holdFrozenRead(p), completing = settle(f.a.listingPhoto.complete(p.complete));
    let listing: Awaited<ReturnType<Caller["listing"]["create"]>> | null = null;
    try { await hold.started.wait("pending next photo before publication"); listing = await f.b.listing.create(createInput(reviewed)); }
    finally { hold.release.release(); await completing; }
    expect(await completing).toMatchObject({ status: "rejected", reason: { code: "CONFLICT" } }); assert(listing);
    const draft = await currentDraft(f); expect(draft).toMatchObject({ state: "published", publishedListingId: listing.id, revision: reviewed.revision + 1 });
    expect(draft?.snapshot).toEqual(reviewed.snapshot); expect(draft?.snapshot.uploadedMediaIds).toEqual([first.result.photo.id]);
    const photos = await currentMedia(f); expect(photos).toHaveLength(1); expect(photos[0]).toMatchObject({ id: first.result.photo.id, listingId: listing.id });
    const pendingLedger = await databases.observer.query.listingPhotoUploads.findFirst({ where: eq(schema.listingPhotoUploads.id, p.input.uploadId) }); expect(pendingLedger?.readyMediaId).toBeNull();
    expect((await databases.observer.select().from(schema.listings).where(eq(schema.listings.sellerId, f.user.id)))).toHaveLength(1);
    const published = await databases.observer.select().from(schema.auditEvents).where(eq(schema.auditEvents.idempotencyKey, `listing-published:${listing.id}`)); expect(published).toHaveLength(1);
    evidence.publishedListingId = listing.id; evidence.preservedMediaId = first.result.photo.id;
  }), 30000);

  it("a second connection cannot publish its stale reviewed revision after completion", async () => record("completion-wins-stale-publication", async evidence => {
    const f = await seed(); await ready(f); const stale = f.draft; await ready(f);
    await expect(f.b.listing.create(createInput(stale))).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await currentDraft(f)).toEqual(f.draft); expect(f.draft.snapshot.uploadedMediaIds).toHaveLength(2); expect(await currentMedia(f)).toHaveLength(2);
    expect(await databases.observer.select().from(schema.listings).where(eq(schema.listings.sellerId, f.user.id))).toHaveLength(0);
    evidence.staleRevision = stale.revision; evidence.currentRevision = f.draft.revision; evidence.schedule = "separate-session stale-reference control; no asserted lock wait";
  }), 30000);
});
