// Prepared before product edits. Opt-in actual router/PostgreSQL proof; every case rolls back.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import zipcodes from "zipcodes";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db";
import type { createTRPCContext } from "@/server/trpc";
import type { ListingFormInput } from "@/lib/validators/listing";
import type { ShippingBookingSnapshot } from "@/server/services/shipping-workflow";

type ObserverHandler = (input: { event: { data: Record<string, string> }; step: { run: (name: string, fn: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown>;
const bridge = vi.hoisted(() => ({ db: null as unknown, events: [] as unknown[], captures: [] as Record<string, unknown>[], handlers: {} as Record<string, ObserverHandler> }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: new Proxy({}, { get(_target, key) {
  if (!bridge.db) throw new Error("No admitted test transaction");
  const value = (bridge.db as Record<PropertyKey, unknown>)[key];
  return typeof value === "function" ? value.bind(bridge.db) : value;
} }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => { throw new Error("Real authentication forbidden"); } }));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}), redis: { get: vi.fn(), set: vi.fn() } }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class { static slidingWindow() { return {}; } async limit() { return { success: true }; } } }));
vi.mock("@/server/services/content-moderation", () => ({ checkViolationStatus: vi.fn() }));
vi.mock("@/lib/analytics/posthog-server", () => ({ getPostHogServer: () => ({ captureAcknowledged: async (message: Record<string, unknown>) => { bridge.captures.push(message); } }) }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { createFunction: (options: { id: string }, _trigger: unknown, handler: ObserverHandler) => { bridge.handlers[options.id] = handler; return { id: options.id }; }, send: async (event: unknown) => { bridge.events.push(event); return { ids: ["synthetic-accepted-event"] }; } } }));
vi.mock("@/server/services/priority1", () => ({ priority1: { getSuggestedClass: () => { throw new Error("Carrier access forbidden"); } } }));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
await import("@/lib/inngest/functions/marketplace-funnel");
const { listingRouter } = await import("@/server/routers/listing");
const { warehouseRouter } = await import("@/server/routers/warehouse");
const { loadWarehouseOrigin, requireCurrentWarehouseOrigin } = await import("@/server/services/warehouse-origin");
const { restoreArchivedListing } = await import("@/server/services/listing-restoration");
const createCaller = createCallerFactory(createTRPCRouter({ listing: listingRouter, warehouse: warehouseRouter }));
type User = typeof schema.users.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const TARGET = "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
const SOURCE = ["src/server/services/registration-cohort.ts", "src/server/routers/admin.ts", "src/lib/inngest/functions/marketplace-funnel.ts", "src/lib/analytics/posthog-acknowledged.ts", "src/lib/marketplace/minimum-order-quantity.ts", "src/server/routers/listing.ts", "src/server/routers/warehouse.ts", "src/server/services/listing-warehouse-selection.ts", "src/server/services/warehouse-mutation-lock.ts", "src/server/services/listing-form-drafts.ts", "src/server/services/warehouse-origin.ts", "src/lib/validators/listing.ts", "src/lib/validators/listing-draft.ts", "src/lib/stores/listing-form-store.ts", "src/server/routers/__tests__/listing-warehouse-postgres.test.ts"];
const sources = () => SOURCE.map(file => ({ path: file, sha256: fs.existsSync(file) ? createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null }));
function caller(db: Database, user: User) {
  return createCaller({ db, user, authUser: { id: user.authId, email_confirmed_at: "2026-09-01" }, supabase: {}, clientIp: "127.0.0.1", getAuthAssurance: vi.fn().mockRejectedValue(new Error("Ordinary seller requires no payout MFA")) } as unknown as Awaited<ReturnType<typeof createTRPCContext>>);
}
async function seed(db: Database, role: "seller" | "buyer" | "admin" = "seller", status = "verified") {
  const id = randomUUID();
  const [user] = await db.insert(schema.users).values({ id, authId: randomUUID(), email: `warehouse-${id}@example.invalid`, name: "Synthetic Seller", businessName: "Synthetic Flooring", role, active: true, verified: status === "verified", verificationStatus: status, phone: "5555550101", businessAddress: "10 Office Road", businessCity: "Denver", businessState: "CO", businessZip: "80202" }).returning();
  const geo = zipcodes.lookup("77002")!;
  const [warehouse] = await db.insert(schema.warehouses).values({ sellerId: id, label: "Houston dock", address: "200 Warehouse Road", city: "Houston", state: "TX", zip: "77002", contactName: "Dock Lead", phone: "5555550102", pickupStart: "09:00", pickupEnd: "15:00", hasLoadingDock: true, hasForklift: false, active: true, isDefault: true, latitude: geo.latitude, longitude: geo.longitude }).returning();
  const [photo] = await db.insert(schema.media).values({ uploaderId: id, url: "https://example.invalid/synthetic-flooring.png", mimeType: "image/png", fileName: "synthetic-flooring.png", sortOrder: 0 }).returning();
  const form: Record<string, unknown> = { title: "Synthetic engineered flooring lot", materialType: "engineered", condition: "new_overstock", totalSqFt: 1200, totalPallets: 2, moq: 100, moqUnit: "sqft", palletWeight: 1400, palletLength: 48, palletWidth: 40, palletHeight: 44, freightClass: "70", locationCity: "Houston", locationState: "TX", locationZip: "77002", askPricePerSqFt: 2.75, allowOffers: false, certifications: [] };
  return { user, warehouse, photo, form, c: caller(db, user) };
}
type Fixture = Awaited<ReturnType<typeof seed>>;
const selected = (f: Fixture) => ({ ...f.form, warehouseId: f.warehouse.id, warehouseRevision: f.warehouse.revision });
const publish = (f: Fixture, input: Record<string, unknown>) => f.c.listing.create({ ...input, mediaIds: [f.photo.id] } as ListingFormInput);
async function draft(f: Fixture, form = selected(f)) {
  return f.c.listing.saveFormDraft({ id: randomUUID(), expectedRevision: null, operationId: randomUUID(), snapshot: { schemaVersion: 2, currentStep: 3, defaultsApplied: true, formData: form, uploadedMediaIds: [f.photo.id] } } as Parameters<Fixture["c"]["listing"]["saveFormDraft"]>[0]);
}
async function state(db: Database, f: Fixture) {
  return {
    listings: await db.select().from(schema.listings).where(eq(schema.listings.sellerId, f.user.id)),
    photos: await db.select().from(schema.media).where(eq(schema.media.uploaderId, f.user.id)),
    drafts: await db.select().from(schema.listingFormDrafts).where(eq(schema.listingFormDrafts.sellerId, f.user.id)),
    events: bridge.events.length,
  };
}

describe.skipIf(process.env.LISTING_WAREHOUSE_DB_PROOF !== "1")("listing warehouse actual router / canonical PostgreSQL", () => {
  let connection: ReturnType<typeof postgres>, db: Database, original: unknown;
  const runId = randomUUID(), directory = path.resolve("tmp/journey10/warehouse-selection/database-proof", runId);
  const proof: Record<string, unknown> = { runId, target: TARGET, cases: [], boundary: "Actual tRPC parser, router, draft/publication services and PostgreSQL; outer rollback; auth/Redis/event acceptance simulated; privileged DB does not prove RLS or concurrent sessions" };
  const note = () => fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(proof, null, 2));
  async function digest() {
    const result: Record<string, unknown> = {};
    const tables = await connection`select c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname`;
    for (const row of tables) { const [value] = await connection`select count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public.${connection(String(row.name))} t`; result[String(row.name)] = { count: Number(value.count), digest: String(value.digest) }; }
    return result;
  }
  beforeAll(async () => {
    assert.equal(process.env.LISTING_WAREHOUSE_OTHER_FIXTURES_CLEANED, "1"); assert.equal(process.env.DATABASE_URL, TARGET);
    fs.mkdirSync(directory, { recursive: true }); proof.sources = sources(); note();
    connection = postgres(TARGET, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {}, connection: { application_name: `warehouse-create-proof-${runId.slice(0,8)}`, statement_timeout: 10000, lock_timeout: 3000 } });
    db = drizzle(connection, { schema });
    const [identity] = await connection`select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,current_setting('session_replication_role') replication`;
    expect(identity).toMatchObject({ name: "plankmarket_bootstrap_design_20260929", role: "postgres", address: "127.0.0.1", port: 55439, replication: "origin" });
    const constraints = await connection`select conname,convalidated from pg_constraint where conname in ('listings_warehouse_seller_fk','warehouses_id_seller_key')`;
    expect(constraints).toHaveLength(2); expect(constraints.every(c => c.convalidated)).toBe(true);
    proof.admission = { identity, constraints }; original = await digest(); proof.before = original; note();
    vi.stubGlobal("fetch", () => { throw new Error("Network forbidden in database proof"); });
  }, 30000);
  afterAll(async () => {
    try { if (original) { proof.after = await digest(); expect(proof.after).toEqual(original); proof.publicDataUnchanged = true; } proof.sourceReadback = sources(); expect(proof.sourceReadback).toEqual(proof.sources); if (fs.existsSync(directory)) note(); }
    finally { vi.unstubAllGlobals(); if (connection) await connection.end({ timeout: 2 }); }
  }, 30000);
  async function rollback(label: string, body: (executor: Database) => Promise<void>) {
    const sentinel = new Error("FORCED_WAREHOUSE_ROLLBACK"); let failed: unknown, rolledBack = false, passed = false; bridge.events = [];
    try { await db.transaction(async tx => { const executor = tx as unknown as Database; bridge.db = executor;
      try { await body(executor); await tx.execute(sql`set constraints all immediate`); passed = true; } catch (e) { failed = e; } finally { throw sentinel; }
    }); } catch (e) { if (e === sentinel) rolledBack = true; else failed ??= e; }
    finally { bridge.db = null; }
    (proof.cases as unknown[]).push({ label, passed: passed && !failed, rolledBack, simulatedEvents: bridge.events.length, error: failed instanceof Error ? failed.message : failed ? "unknown" : null }); note();
    expect(rolledBack).toBe(true); if (failed) throw failed;
  }

  it("measures registration receipts without duplicate or foreign completion", async () => rollback("registration cohort", async executor => {
    const { getRegistrationCohort } = await import("@/server/services/registration-cohort");
    const start = new Date("2026-01-01T00:00:00Z"), end = new Date("2026-02-01T00:00:00Z");
    expect(await getRegistrationCohort(executor, start, end)).toMatchObject({ profilesCreated: 0, receiptConfirmed: 0, completionUnknown: 0, originalBuyers: 0, originalSellers: 0 });
    const create = async (role: "buyer" | "seller" | "admin", when = start) => {
      const id = randomUUID();
      const [user] = await executor.insert(schema.users).values({ id, authId: randomUUID(), email: `${id}@example.invalid`, name: "Synthetic cohort", role, createdAt: when }).returning();
      return user;
    };
    const buyer = await create("seller"), legacy = await create("buyer"), pending = await create("seller"), foreign = await create("buyer");
    await create("admin"); await create("buyer", end); await create("seller", new Date(start.getTime() - 1));
    const receipt = async (user: User, version: number, purpose: "registration" | "seller_activation", expectedRole: "buyer" | "seller", confirmed = true) => {
      const id = randomUUID();
      await executor.insert(schema.roleProviderWrites).values({ id, version, userId: user.id, authId: user.authId, purpose, expectedRole, issuedAt: start });
      if (confirmed) await executor.update(schema.roleProviderWrites).set({ confirmedAt: new Date(start.getTime() + version * 1000) }).where(eq(schema.roleProviderWrites.id, id));
    };
    await receipt(buyer, 1, "registration", "buyer"); await receipt(buyer, 2, "registration", "seller"); await receipt(buyer, 3, "seller_activation", "seller");
    await receipt(pending, 1, "registration", "seller", false);
    await receipt(foreign, 1, "registration", "buyer");
    await executor.update(schema.users).set({ authId: randomUUID() }).where(eq(schema.users.id, foreign.id));
    const late = await create("seller");
    await receipt(late, 1, "registration", "seller", false);
    await executor.update(schema.roleProviderWrites).set({ confirmedAt: end }).where(eq(schema.roleProviderWrites.userId, late.id));
    const before = await executor.select().from(schema.roleProviderWrites);
    expect(await getRegistrationCohort(executor, start, end)).toMatchObject({ profilesCreated: 5, receiptConfirmed: 1, completionUnknown: 4, originalBuyers: 1, originalSellers: 0 });
    expect(await executor.select().from(schema.roleProviderWrites)).toEqual(before);
    expect(legacy.id).toBeTruthy();
  }));

  it.each(["sqFtPerBox", "boxesPerPallet"] as const)("blocks missing %s across SQL listing boundaries", async missing => rollback(`pallet ${missing}`, async executor => {
    const f = await seed(executor);
    const terms = { moq: 1, moqUnit: "pallets", sqFtPerBox: 24, boxesPerPallet: 40, [missing]: undefined };
    const before = await state(executor, f);
    await expect(publish(f, { ...selected(f), ...terms })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await state(executor, f)).toEqual(before);
    const requestId = randomUUID();
    await expect(f.c.listing.bulkCreate({ requestId, rows: [{ ...f.form, ...terms }] } as Parameters<Fixture["c"]["listing"]["bulkCreate"]>[0])).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await state(executor, f)).toEqual(before);
    expect(await executor.select().from(schema.importRequests).where(eq(schema.importRequests.requestId, requestId))).toHaveLength(0);
    const [persisted] = await executor.insert(schema.listings).values({ ...f.form, ...terms, sellerId: f.user.id, status: "draft" } as typeof schema.listings.$inferInsert).returning();
    await executor.update(schema.media).set({ listingId: persisted.id }).where(eq(schema.media.id, f.photo.id));
    const draftState = await state(executor, f);
    await expect(f.c.listing.publishBulk({ listingIds: [persisted.id] })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await state(executor, f)).toEqual(draftState);
  }));

  it("allows measured pallets and prevents clearing packaging in SQL", async () => rollback("measured pallet edit", async executor => {
    const f = await seed(executor);
    const created = await publish(f, { ...selected(f), moq: 1, moqUnit: "pallets", sqFtPerBox: 24, boxesPerPallet: 40 });
    expect(created).toMatchObject({ moq: 1, moqUnit: "pallets", sqFtPerBox: 24, boxesPerPallet: 40 });
    const before = await state(executor, f);
    for (const field of ["sqFtPerBox", "boxesPerPallet"] as const) {
      await expect(f.c.listing.update({ id: created.id, data: { [field]: null } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(await state(executor, f)).toEqual(before);
    }
  }));

  it("observes durable publication with real SQL consent and no business mutation", async () => rollback("publication analytics observer", async executor => {
    const f = await seed(executor);
    const created = await publish(f, selected(f));
    await executor.insert(schema.userPreferences).values({ userId: f.user.id, role: "seller", analyticsTrackingEnabled: true }).onConflictDoUpdate({ target: schema.userPreferences.userId, set: { analyticsTrackingEnabled: true } });
    const before = await state(executor, f);
    const start = bridge.captures.length;
    const input = { event: { data: { listingId: created.id, sellerId: f.user.id } }, step: { run: async (_name: string, fn: () => Promise<unknown>) => fn() } };
    await bridge.handlers["analytics-listing-published"](input);
    await bridge.handlers["analytics-listing-published"](input);
    expect(bridge.captures).toHaveLength(start + 2);
    expect(bridge.captures[start]).toMatchObject({ distinctId: f.user.id, event: "listing_published" });
    expect(bridge.captures[start + 1]).toEqual(bridge.captures[start]);
    expect(await state(executor, f)).toEqual(before);
    await executor.update(schema.userPreferences).set({ analyticsTrackingEnabled: false }).where(eq(schema.userPreferences.userId, f.user.id));
    const denied = await state(executor, f);
    await bridge.handlers["analytics-listing-published"](input);
    expect(bridge.captures).toHaveLength(start + 2);
    expect(await state(executor, f)).toEqual(denied);
    await bridge.handlers["analytics-listing-published"]({ ...input, event: { data: { listingId: created.id, sellerId: randomUUID() } } });
    expect(bridge.captures).toHaveLength(start + 2);
  }));

  // Synthetic persisted payment states prove SQL selection and consent, not Stripe acceptance.
  it("observes confirmed payment SQL state without changing the order or inventory", async () => rollback("payment analytics observer", async executor => {
    const seller = await seed(executor), buyer = await seed(executor, "buyer");
    const listing = await publish(seller, selected(seller));
    await executor.insert(schema.userPreferences).values({ userId: buyer.user.id, role: "buyer", analyticsTrackingEnabled: true });
    const [order] = await executor.insert(schema.orders).values({
      orderNumber: `SQL-${randomUUID().slice(0, 8)}`, buyerId: buyer.user.id,
      sellerId: seller.user.id, listingId: listing.id, quantitySqFt: 200,
      pricePerSqFt: 2.75, subtotal: 550, buyerFee: 0, sellerFee: 0,
      totalPrice: 550, originalSellerPayout: 550, sellerPayout: 550,
      stripePaymentIntentId: "pi_synthetic_sql_only", paymentStatus: "pending",
    }).returning();
    const input = { event: { data: { orderId: order.id } }, step: { run: async (_name: string, fn: () => Promise<unknown>) => fn() } };
    const start = bridge.captures.length;
    const snapshot = async () => ({ order: await executor.select().from(schema.orders).where(eq(schema.orders.id, order.id)), seller: await state(executor, seller), buyer: await state(executor, buyer) });
    const pending = await snapshot();
    await bridge.handlers["analytics-payment-completed"](input);
    expect(bridge.captures).toHaveLength(start);
    expect(await snapshot()).toEqual(pending);
    const confirmedAt = new Date("2026-09-29T10:00:00.000Z");
    await executor.update(schema.orders).set({ paymentStatus: "succeeded", status: "confirmed", confirmedAt, escrowStatus: "held" }).where(eq(schema.orders.id, order.id));
    const confirmed = await snapshot();
    await bridge.handlers["analytics-payment-completed"](input);
    await bridge.handlers["analytics-payment-completed"](input);
    expect(bridge.captures).toHaveLength(start + 2);
    expect(bridge.captures[start]).toMatchObject({ distinctId: buyer.user.id, event: "payment_completed", timestamp: confirmedAt, properties: { amount: 550, quantity_sqft: 200, measurement: "confirmed_checkout_gross" } });
    expect(bridge.captures[start + 1]).toEqual(bridge.captures[start]);
    expect(await snapshot()).toEqual(confirmed);
    await executor.update(schema.userPreferences).set({ analyticsTrackingEnabled: false }).where(eq(schema.userPreferences.userId, buyer.user.id));
    await bridge.handlers["analytics-payment-completed"](input);
    expect(bridge.captures).toHaveLength(start + 2);
    await executor.update(schema.userPreferences).set({ analyticsTrackingEnabled: true }).where(eq(schema.userPreferences.userId, buyer.user.id));
    await executor.update(schema.orders).set({ paymentStatus: "refunded", status: "refunded", escrowStatus: "refunded", refundedAmount: 550 }).where(eq(schema.orders.id, order.id));
    const refunded = await snapshot();
    await bridge.handlers["analytics-payment-completed"](input);
    expect(bridge.captures).toHaveLength(start + 3);
    expect(bridge.captures[start + 2]).toEqual(bridge.captures[start]);
    expect(await snapshot()).toEqual(refunded);
    await executor.update(schema.orders).set({ confirmedAt: null }).where(eq(schema.orders.id, order.id));
    const unconfirmed = await snapshot();
    await bridge.handlers["analytics-payment-completed"](input);
    expect(bridge.captures).toHaveLength(start + 3);
    expect(await snapshot()).toEqual(unconfirmed);
    await bridge.handlers["analytics-payment-completed"]({ ...input, event: { data: { orderId: randomUUID() } } });
    expect(bridge.captures).toHaveLength(start + 3);
  }));

  it("binds owned and empty inventory responses to the authenticated SQL seller", async () => rollback("inventory response owner", async executor => {
    const seller = await seed(executor), foreign = await seed(executor), empty = await seed(executor);
    const owned = await publish(seller, selected(seller));
    await publish(foreign, selected(foreign));
    const result = await seller.c.listing.getMyListings({ page: 1, limit: 20 });
    expect(result.ownerId).toBe(seller.user.id);
    expect(result.items.map(row => row.id)).toEqual([owned.id]);
    expect(result.items.every(row => row.sellerId === result.ownerId)).toBe(true);
    expect(result.total).toBe(1);
    const blank = await empty.c.listing.getMyListings({ page: 1, limit: 20 });
    expect(blank).toMatchObject({ ownerId: empty.user.id, items: [], total: 0, hasMore: false });
  }));

  it.each(["unverified", "pending", "rejected"])("preserves %s inventory-read authorization while allowing private preparation", async status => rollback("inventory read " + status, async executor => {
    const f = await seed(executor, "seller", status);
    await expect(f.c.listing.getMyListings({ page: 1, limit: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const saved = await draft(f);
    expect(saved.id).toBeTruthy();
    expect((await f.c.listing.getFormDraft({}))?.snapshot.formData.title).toBe(f.form.title);
    expect((await state(executor, f)).listings).toHaveLength(0);
  }));

  it("creates the owned warehouse listing and resolves its actual pickup origin", async () => rollback("owned warehouse publication", async executor => {
    const f = await seed(executor), result = await publish(f, selected(f));
    expect(result).toMatchObject({ warehouseId: f.warehouse.id, sellerId: f.user.id, locationCity: "Houston", locationState: "TX", locationZip: "77002", totalSqFt: 1200, palletWeight: 1400, askPricePerSqFt: 2.75 });
    expect(result.locationLat).toBeCloseTo(f.warehouse.latitude!, 3);
    const origin = await loadWarehouseOrigin(executor, result);
    expect(origin).toMatchObject({ identity: `warehouse:${f.warehouse.id}`, pickupStart: "09:00", pickupEnd: "15:00", hasLoadingDock: true, location: { address: { addressLine1: "200 Warehouse Road", postalCode: "77002" }, contact: { contactName: "Dock Lead" } } });
    expect(bridge.events).toHaveLength(1); expect((await state(executor, f)).photos[0].listingId).toBe(result.id);
  }));
  it("keeps manual legacy publication compatible", async () => rollback("manual origin", async executor => {
    const f = await seed(executor), result = await publish(f, { ...f.form, locationCity: "Denver", locationState: "CO", locationZip: "80202" });
    expect(result.warehouseId).toBeNull(); expect((await loadWarehouseOrigin(executor, result)).identity).toBe(`legacy:${f.user.id}`);
  }));
  // Review found persisted-row validation also used the create-form schema.
  // These integration regressions are recorded before separating the schemas.
  it("publishes an existing draft with an assigned warehouse", async () => rollback("assigned persisted draft", async executor => {
    const f = await seed(executor);
    const [created] = await executor.insert(schema.listings).values({ ...f.form, sellerId: f.user.id, warehouseId: f.warehouse.id, status: "draft" } as typeof schema.listings.$inferInsert).returning();
    await executor.update(schema.media).set({ listingId: created.id }).where(eq(schema.media.id, f.photo.id));
    await f.c.listing.publishBulk({ listingIds: [created.id] });
    const [current] = await executor.select().from(schema.listings).where(eq(schema.listings.id, created.id));
    expect(current.status).toBe("active"); expect(current.warehouseId).toBe(f.warehouse.id);
  }));
  it("restores an archived warehouse-assigned listing", async () => rollback("assigned archived listing", async executor => {
    const f = await seed(executor), admin = await seed(executor, "admin"), created = await publish(f, selected(f));
    await f.c.listing.delete({ id: created.id });
    const [version] = await executor.select({ value: sql<string>`to_char(${schema.listings.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')` }).from(schema.listings).where(eq(schema.listings.id, created.id));
    await restoreArchivedListing(executor, admin.user.id, { listingId: created.id, restorationVersion: version.value });
    const [current] = await executor.select().from(schema.listings).where(eq(schema.listings.id, created.id));
    expect(current.status).toBe("active"); expect(current.warehouseId).toBe(f.warehouse.id);
  }));
  it("saves, reads and publishes the exact selected warehouse draft", async () => rollback("draft persistence", async executor => {
    const f = await seed(executor), saved = await draft(f);
    const restored = await f.c.listing.getFormDraft({}); expect(restored?.snapshot.formData).toMatchObject({ warehouseId: f.warehouse.id, warehouseRevision: 1 });
    const created = await publish(f, { ...selected(f), accountDraft: { id: saved.id, revision: saved.revision } });
    expect(created.warehouseId).toBe(f.warehouse.id); expect((await f.c.listing.getFormDraft({}))?.publishedListingId).toBe(created.id);
  }));
  it.each(["foreign", "missing", "inactive", "stale"])("rejects %s warehouse without side effects", async kind => rollback(kind, async executor => {
    const f = await seed(executor), input = selected(f);
    if (kind === "foreign") input.warehouseId = (await seed(executor)).warehouse.id;
    if (kind === "missing") input.warehouseId = randomUUID();
    if (kind === "inactive") await executor.update(schema.warehouses).set({ active: false, isDefault: false }).where(eq(schema.warehouses.id, f.warehouse.id));
    if (kind === "stale") await executor.update(schema.warehouses).set({ address: "201 Warehouse Road", revision: 2 }).where(eq(schema.warehouses.id, f.warehouse.id));
    const before = await state(executor, f);
    await expect(publish(f, input)).rejects.toMatchObject({ code: kind === "stale" ? "CONFLICT" : "NOT_FOUND" });
    expect(await state(executor, f)).toEqual(before);
  }));
  it.each([{ warehouseRevision: undefined }, { warehouseId: undefined }, { warehouseRevision: 0 }, { warehouseId: "invalid" }])("rejects malformed selection %j", async patch => rollback("malformed "+JSON.stringify(patch), async executor => {
    const f = await seed(executor), before = await state(executor, f);
    await expect(publish(f, { ...selected(f), ...patch })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(await state(executor, f)).toEqual(before);
  }));
  it.each(["locationCity", "locationState", "locationZip"])("rejects inconsistent %s instead of publishing mixed location", async field => rollback(field, async executor => {
    const f = await seed(executor), values = { locationCity: "Denver", locationState: "CO", locationZip: "80202" }, before = await state(executor, f);
    await expect(publish(f, { ...selected(f), [field]: values[field as keyof typeof values] })).rejects.toMatchObject({ code: "CONFLICT" }); expect(await state(executor, f)).toEqual(before);
  }));
  it("keeps the selected draft and rolls back insertion when photo attachment fails", async () => rollback("photo rollback", async executor => {
    const f = await seed(executor), saved = await draft(f);
    await executor.update(schema.media).set({ mimeType: "application/pdf" }).where(eq(schema.media.id, f.photo.id));
    const before = await state(executor, f);
    await expect(publish(f, { ...selected(f), accountDraft: { id: saved.id, revision: saved.revision } })).rejects.toMatchObject({ code: "BAD_REQUEST" }); expect(await state(executor, f)).toEqual(before);
  }));
  it("replays one publication after warehouse deactivation and preserves quote invalidation", async () => rollback("publication replay and quote revision", async executor => {
    const f = await seed(executor), saved = await draft(f), input = { ...selected(f), accountDraft: { id: saved.id, revision: saved.revision } };
    const created = await publish(f, input), origin = await loadWarehouseOrigin(executor, created);
    const snapshot = { originIdentity: origin.identity, originRevision: origin.revision, originLocation: origin.location } as ShippingBookingSnapshot;
    await executor.update(schema.warehouses).set({ address: "201 Warehouse Road", revision: 2 }).where(eq(schema.warehouses.id, f.warehouse.id));
    expect(() => requireCurrentWarehouseOrigin(snapshot, { ...origin, revision: "changed" })).toThrow();
    expect(() => requireCurrentWarehouseOrigin(snapshot, origin)).not.toThrow();
    const changed = await loadWarehouseOrigin(executor, created); expect(() => requireCurrentWarehouseOrigin(snapshot, changed)).toThrow();
    await executor.update(schema.warehouses).set({ active: false, isDefault: false, revision: 3 }).where(eq(schema.warehouses.id, f.warehouse.id));
    const replay = await publish(f, input); expect(replay.id).toBe(created.id); expect((await state(executor, f)).listings).toHaveLength(1); expect(bridge.events).toHaveLength(1);
  }));
  it("does not admit warehouse reassignment through generic listing update", async () => rollback("update cannot reassign", async executor => {
    const f = await seed(executor), created = await publish(f, selected(f)), foreign = await seed(executor);
    await f.c.listing.update({ id: created.id, data: { warehouseId: foreign.warehouse.id, warehouseRevision: 1 } } as Parameters<Fixture["c"]["listing"]["update"]>[0]);
    const current = await f.c.listing.getForEdit({ id: created.id }); expect(current.warehouseId).toBe(f.warehouse.id); expect(current.locationZip).toBe("77002");
  }));
  it("rejects a different warehouse selection than the saved draft revision", async () => rollback("draft fingerprint", async executor => {
    const f = await seed(executor), saved = await draft(f);
    await expect(publish(f, { ...selected(f), warehouseRevision: 2, accountDraft: { id: saved.id, revision: saved.revision } })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await f.c.listing.getFormDraft({}))?.state).toBe("editing"); expect((await state(executor, f)).listings).toHaveLength(0);
  }));
  it.each(["pending", "unverified"])("keeps %s seller publication gated", async status => rollback(status, async executor => {
    const f = await seed(executor, "seller", status); await expect(publish(f, selected(f))).rejects.toMatchObject({ code: "FORBIDDEN" }); expect((await state(executor, f)).listings).toHaveLength(0);
  }));
});

// Separate committed fixture in an owned clone: two actual sessions demonstrate
// row-lock ordering. This cohort is never enabled by the normal repository suite.
describe.skipIf(process.env.LISTING_WAREHOUSE_CONCURRENCY_PROOF !== "1")("listing warehouse independent PostgreSQL sessions", () => {
  const runId = randomUUID(), cloneName = `pm_wh_${runId.replaceAll("-", "")}`;
  const marker = `listing-warehouse-concurrency:${runId}`;
  const directory = path.resolve("tmp/journey10/warehouse-selection/concurrency-proof", runId);
  let admin: ReturnType<typeof postgres>, a: ReturnType<typeof postgres>, b: ReturnType<typeof postgres>;
  let dbA: Database, dbB: Database, pidA: number, pidB: number, created = false;
  const evidence: Record<string, unknown> = { runId, cloneName, marker, cases: [], localOnly: true };
  const write = () => fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(evidence, null, 2));
  function gate() {
    let enter!: () => void, release!: () => void;
    return { entered: new Promise<void>(r => { enter = r; }), released: new Promise<void>(r => { release = r; }), enter: () => enter(), release: () => release() };
  }
  function holdMutation(database: Database, method: "insert" | "update", table: unknown, timing: "before" | "after", hold: ReturnType<typeof gate>): Database {
    const wrapBuilder = (builder: object): object => new Proxy(builder, { get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = Reflect.apply(value, target, args);
        if (key === "returning") return (async () => {
          if (timing === "before") { hold.enter(); await hold.released; return await result; }
          const saved = await result; hold.enter(); await hold.released; return saved;
        })();
        return result && typeof result === "object" ? wrapBuilder(result) : result;
      };
    } });
    return new Proxy(database, { get(target, key) {
      if (key === "transaction") return (work: (tx: Tx) => Promise<unknown>) => database.transaction(async tx => work(new Proxy(tx, { get(transaction, member) {
        const value = Reflect.get(transaction, member);
        if (member === method) return (candidate: unknown) => { const builder = Reflect.apply(value, transaction, [candidate]); return candidate === table ? wrapBuilder(builder as object) : builder; };
        return typeof value === "function" ? value.bind(transaction) : value;
      } })));
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
  }
  async function outcome<T>(work: Promise<T>) { try { return { ok: true as const, value: await work }; } catch (error) { return { ok: false as const, error }; } }
  async function within<T>(work: Promise<T>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Interleaving deadline")), 5000); })]); }
    finally { clearTimeout(timer); }
  }
  async function blocked(waiter: number, blocker: number, done: () => boolean) {
    for (let n = 0; n < 100; n++) {
      const [row] = await admin`select ${waiter}::int pid,pg_blocking_pids(${waiter}::int) blockers`;
      if ((row.blockers as number[]).includes(blocker)) return row;
      if (done()) throw new Error("Operation completed instead of waiting for the required warehouse/user lock");
      await new Promise(r => setTimeout(r, 20));
    }
    throw new Error("Required PostgreSQL blocking relationship was not observed");
  }
  const changed = (f: Fixture) => ({ label: f.warehouse.label, address: "201 Warehouse Road", city: "Houston", state: "TX", zip: "77002", contactName: "Dock Lead", phone: "5555550102", pickupStart: "09:00", pickupEnd: "15:00", hasLoadingDock: true, hasForklift: false, active: true, isDefault: true });
  beforeAll(async () => {
    assert.equal(process.env.LISTING_WAREHOUSE_OTHER_FIXTURES_CLEANED, "1"); assert.equal(process.env.DATABASE_URL, TARGET);
    assert(/^pm_wh_[a-f0-9]{32}$/.test(cloneName));
    fs.mkdirSync(directory, { recursive: true }); evidence.sources = sources(); write();
    admin = postgres(TARGET, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {} });
    const [identity] = await admin`select current_database() name,host(inet_server_addr()) address,inet_server_port() port`;
    expect(identity).toMatchObject({ name: "plankmarket_bootstrap_design_20260929", address: "127.0.0.1", port: 55439 });
    const others = await admin`select pid from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()`; expect(others).toHaveLength(0);
    await admin.unsafe(`create database "${cloneName}" template "plankmarket_bootstrap_design_20260929"`); created = true;
    await admin.unsafe(`comment on database "${cloneName}" is '${marker}'`);
    const url = `postgresql://postgres@127.0.0.1:55439/${cloneName}`;
    const options = { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {}, connection: { statement_timeout: 10000, lock_timeout: 7000 } };
    a = postgres(url, options); b = postgres(url, options); dbA = drizzle(a, { schema }); dbB = drizzle(b, { schema });
    pidA = Number((await a`select pg_backend_pid() pid`)[0].pid); pidB = Number((await b`select pg_backend_pid() pid`)[0].pid); expect(pidA).not.toBe(pidB);
    evidence.admission = { identity, pidA, pidB, cloneName }; bridge.db = dbA; write();
    vi.stubGlobal("fetch", () => { throw new Error("Network forbidden in concurrency proof"); });
  }, 30000);
  afterAll(async () => {
    vi.unstubAllGlobals(); bridge.db = null;
    try {
      if (a) await a.end({ timeout: 2 }); if (b) await b.end({ timeout: 2 });
      if (created) {
        const [owned] = await admin`select datname,pg_get_userbyid(datdba) owner,shobj_description(oid,'pg_database') marker from pg_database where datname=${cloneName}`;
        expect(owned).toMatchObject({ datname: cloneName, owner: "postgres", marker });
        expect(await admin`select pid from pg_stat_activity where datname=${cloneName}`).toHaveLength(0);
        await admin.unsafe(`drop database "${cloneName}"`); expect(await admin`select datname from pg_database where datname=${cloneName}`).toHaveLength(0); evidence.cloneDropped = true;
      }
      evidence.sourceReadback = sources(); expect(evidence.sourceReadback).toEqual(evidence.sources); write();
    } finally { if (admin) await admin.end({ timeout: 2 }); }
  }, 30000);
  it("serializes warehouse edits behind an in-flight publication", async () => {
    const hold = gate(), f = await seed(dbA), paused = holdMutation(dbA, "insert", schema.listings, "before", hold);
    const publishing = outcome(publish({ ...f, c: caller(paused, f.user) }, selected(f)));
    let editing: ReturnType<typeof outcome<Awaited<ReturnType<Fixture["c"]["warehouse"]["save"]>>>> | undefined;
    try {
      await within(hold.entered); let editDone = false;
      editing = outcome(caller(dbB, f.user).warehouse.save({ id: f.warehouse.id, data: changed(f) })).then(r => { editDone = true; return r; });
      const locks = await blocked(pidB, pidA, () => editDone); hold.release();
      const result = await within(publishing), edit = await within(editing); expect(result.ok).toBe(true); expect(edit.ok).toBe(true);
      if (!result.ok || !edit.ok) throw new Error("Expected both serialized operations to complete");
      const current = await f.c.listing.getForEdit({ id: result.value.id }); expect(current.warehouseId).toBe(f.warehouse.id);
      expect((await loadWarehouseOrigin(dbA, current)).location.address.addressLine1).toBe("201 Warehouse Road");
      (evidence.cases as unknown[]).push({ label: "publication before edit", passed: true, locks }); write();
    } finally { hold.release(); await publishing; if (editing) await editing; }
  }, 20000);
  it("rejects a stale selection after a concurrent warehouse edit commits", async () => {
    const hold = gate(), f = await seed(dbA), paused = holdMutation(dbB, "update", schema.warehouses, "after", hold);
    const editing = outcome(caller(paused, f.user).warehouse.save({ id: f.warehouse.id, data: changed(f) }));
    let publishing: ReturnType<typeof outcome<Awaited<ReturnType<typeof publish>>>> | undefined;
    try {
      await within(hold.entered); let publishDone = false;
      publishing = outcome(publish(f, selected(f))).then(r => { publishDone = true; return r; });
      const locks = await blocked(pidA, pidB, () => publishDone); hold.release();
      expect((await within(editing)).ok).toBe(true); const result = await within(publishing); expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Stale selected warehouse unexpectedly published");
      expect(result.error).toMatchObject({ code: "CONFLICT" }); expect((await state(dbA, f)).listings).toHaveLength(0);
      (evidence.cases as unknown[]).push({ label: "edit before publication", passed: true, locks }); write();
    } finally { hold.release(); await editing; if (publishing) await publishing; }
  }, 20000);
});
