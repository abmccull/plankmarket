// @vitest-environment node
// Prepared before product edits. Root alone admits/integrates/executes this cohort.
// Run only through the disconnected wrapper and only against the exact local parent.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import zipcodes from "zipcodes";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db";
import type { createTRPCContext } from "@/server/trpc";

const boundary = vi.hoisted(() => ({
  stripeRetrieve: vi.fn(), redisGet: vi.fn(), redisSet: vi.fn(), redisEval: vi.fn(),
  unexpected: [] as string[],
}));
vi.mock("server-only", () => ({}));
// All admitted SQL must use the explicit A/B context, never the environment singleton.
vi.mock("@/server/db", () => ({ db: new Proxy({}, { get(_target, key) {
  boundary.unexpected.push(`global database access: ${String(key)}`);
  throw new Error("Global database forbidden; use the admitted clone context");
} }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => {
  boundary.unexpected.push("external authentication"); throw new Error("External auth forbidden");
} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  static slidingWindow() { return {}; }
  async limit() { return { success: true }; }
} }));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}), redis: new Proxy({
  get: boundary.redisGet, set: boundary.redisSet, eval: boundary.redisEval,
}, { get(target, key) {
  if (key in target) return Reflect.get(target, key);
  boundary.unexpected.push(`Redis method: ${String(key)}`); throw new Error("Unexpected Redis operation");
} }) }));
// Only this external Stripe endpoint has a simulated response. Every other endpoint fails closed.
vi.mock("@/lib/stripe", () => ({ stripe: new Proxy({ accounts: { retrieve: boundary.stripeRetrieve } }, {
  get(target, key) {
    if (key === "accounts") return target.accounts;
    boundary.unexpected.push(`Stripe endpoint: ${String(key)}`); throw new Error("Stripe operation forbidden");
  },
}) }));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { orderRouter } = await import("@/server/routers/order");
const { warehouseRouter } = await import("@/server/routers/warehouse");
const { loadWarehouseOrigin } = await import("@/server/services/warehouse-origin");
const { captureCommercialPolicy } = await import("@/lib/commercial-policy");
const { calculateOrderFees } = await import("@/lib/fees");
const { getShippingQuoteTokenKey, getShippingBookingSnapshotKeyByToken, shippingBookingSnapshotSchema, quoteArtifactTtlSeconds } =
  await import("@/server/services/shipping-workflow");
const createCaller = createCallerFactory(createTRPCRouter({ order: orderRouter, warehouse: warehouseRouter }));
type User = typeof schema.users.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type CheckoutMode = "direct" | "offer";
type MutationMode = "edit" | "assign";
type First = "checkout" | "warehouse";
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
const TARGET = "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
const PARENT_NAME = "plankmarket_bootstrap_design_20260929";
const CAS_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] and redis.call('get', KEYS[2]) == ARGV[2] then redis.call('del', KEYS[1]); redis.call('del', KEYS[2]); return 1 else return 0 end";
const SOURCE = [
  "src/server/routers/order.ts", "src/server/routers/warehouse.ts", "src/server/routers/listing.ts",
  "src/server/services/warehouse-mutation-lock.ts", "src/server/services/listing-warehouse-selection.ts",
  "src/server/services/seller-payout-readiness.ts", "src/server/services/stripe-connect-policy.ts",
  "src/server/services/warehouse-origin.ts", "src/server/services/checkout-idempotency.ts",
  "src/server/services/inventory-reservation.ts", "src/server/services/verified-artifact-consumption.ts",
  "src/server/services/shipping-workflow.ts", "src/server/services/stripe-tax.ts",
  "src/server/services/resale-exemption.ts", "src/server/services/pending-order-policy.ts",
  "src/server/trpc.ts", "src/lib/validators/order.ts", "src/lib/fees.ts", "src/lib/commercial-policy.ts",
  "src/server/db/schema/users.ts", "src/server/db/schema/listings.ts", "src/server/db/schema/warehouses.ts",
  "src/server/db/schema/orders.ts", "src/server/db/schema/offers.ts",
  "tmp/marketplace-excellence/run-isolated-check.cjs",
];
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
function sources() {
  return [...SOURCE, fileURLToPath(import.meta.url)].map(file => ({
    path: path.relative(process.cwd(), path.resolve(file)).replaceAll("\\", "/"),
    sha256: fs.existsSync(file) ? sha(fs.readFileSync(file)) : null,
  }));
}
function caller(db: Database, user: User) {
  return createCaller({ db, user, authUser: { id: user.authId, email_confirmed_at: "2026-09-01" },
    supabase: {}, clientIp: "127.0.0.1", getAuthAssurance: vi.fn().mockRejectedValue(
      new Error("Ordinary buyer/warehouse actions must not request payout MFA")),
  } as unknown as Awaited<ReturnType<typeof createTRPCContext>>);
}
function gate() {
  let enter!: () => void, release!: () => void;
  return { entered: new Promise<void>(r => { enter = r; }), released: new Promise<void>(r => { release = r; }),
    enter: () => enter(), release: () => release() };
}
async function outcome<T>(work: Promise<T>): Promise<Outcome<T>> {
  try { return { ok: true, value: await work }; } catch (error) { return { ok: false, error }; }
}
async function within<T>(work: Promise<T>, milliseconds = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Bounded interleaving deadline exceeded")), milliseconds);
  })]); } finally { clearTimeout(timer); }
}
function errorChain(error: unknown): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [], seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current); const e = current as Record<string, unknown>;
    result.push({ name: e.name, code: e.code, message: e.message, detail: e.detail, hint: e.hint });
    current = e.cause;
  }
  return result;
}
const codes = (result: Outcome<unknown>) => result.ok ? [] : errorChain(result.error).map(e => e.code);
const report = (result: Outcome<unknown>) => result.ok ? { ok: true, value: result.value } : { ok: false, errors: errorChain(result.error) };

/** Execute original builders unchanged; pause only after a real awaited row lock/update. */
function withBarrier(database: Database, kind: "listing-lock" | "warehouse-update" | "listing-update", hold: ReturnType<typeof gate>): Database {
  let used = false;
  const wrap = (builder: object, method: "select" | "update", table?: unknown): object => new Proxy(builder, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        const result = Reflect.apply(value, target, args);
        const selectedTable = key === "from" ? args[0] : table;
        const selectedLock = kind === "listing-lock" && method === "select" && table === schema.listings && key === "for" && args[0] === "update";
        const selectedUpdate = method === "update" && key === "returning" &&
          ((kind === "warehouse-update" && table === schema.warehouses) || (kind === "listing-update" && table === schema.listings));
        if (!used && (selectedLock || selectedUpdate)) {
          used = true;
          return (async () => { const actual = await result; hold.enter(); await hold.released; return actual; })();
        }
        // Do not wrap execution promises (then/catch/finally). Only query-building stages.
        return key === "then" || key === "catch" || key === "finally" ? result :
          result && typeof result === "object" ? wrap(result, method, selectedTable) : result;
      };
    },
  });
  return new Proxy(database, { get(target, key) {
    if (key === "transaction") return (work: (tx: Tx) => Promise<unknown>) => database.transaction(async tx => work(new Proxy(tx, {
      get(transaction, member) {
        const value = Reflect.get(transaction, member);
        if (member === "select" || member === "update") return (...args: unknown[]) =>
          wrap(Reflect.apply(value, transaction, args) as object, member, member === "update" ? args[0] : undefined);
        return typeof value === "function" ? value.bind(transaction) : value;
      },
    })));
    const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
  } });
}

// In-memory transport preserves Redis string comparison, atomic pair deletion and TTL restoration.
// No business helper is replaced. Each case admits exactly its two token-scoped keys.
function quoteTransport(pair: { quoteKey: string; snapshotKey: string; quoteValue: string; snapshotValue: string; expiresAt: number }) {
  const admitted = new Set([pair.quoteKey, pair.snapshotKey]);
  const initialTtl = quoteArtifactTtlSeconds(pair.expiresAt); assert(initialTtl && initialTtl > 0);
  const artifactExpiresAt = Date.now() + initialTtl * 1000;
  const values = new Map([[pair.quoteKey, { value: pair.quoteValue, expiresAt: artifactExpiresAt }],
    [pair.snapshotKey, { value: pair.snapshotValue, expiresAt: artifactExpiresAt }]]);
  const operations: Array<Record<string, unknown>> = [];
  const read = (key: string) => {
    assert(admitted.has(key), `Unexpected Redis key: ${key}`);
    const value = values.get(key);
    if (value && value.expiresAt <= Date.now()) { values.delete(key); return null; }
    return value?.value ?? null;
  };
  boundary.redisGet.mockReset().mockImplementation(async (key: string) => {
    operations.push({ kind: "get", key }); return read(key);
  });
  boundary.redisEval.mockReset().mockImplementation(async (script: string, keys: string[], args: string[]) => {
    assert.equal(script, CAS_SCRIPT); assert.deepEqual(keys, [pair.quoteKey, pair.snapshotKey]); assert.equal(args.length, 2);
    const consumed = read(keys[0]) === args[0] && read(keys[1]) === args[1];
    if (consumed) { values.delete(keys[0]); values.delete(keys[1]); }
    operations.push({ kind: "compare-delete", keys, expectedHashes: args.map(sha), consumed }); return consumed ? 1 : 0;
  });
  boundary.redisSet.mockReset().mockImplementation(async (key: string, value: string, options: { ex: number }) => {
    assert(admitted.has(key)); assert.equal(typeof value, "string"); assert(Number.isInteger(options.ex) && options.ex > 0);
    assert.equal(value, key === pair.quoteKey ? pair.quoteValue : pair.snapshotValue);
    const expectedTtl = quoteArtifactTtlSeconds(pair.expiresAt); assert(expectedTtl && expectedTtl > 0);
    assert(Math.abs(options.ex - expectedTtl) <= 1, "Restoration TTL must preserve the actual bookability buffer and cap");
    values.set(key, { value, expiresAt: Date.now() + options.ex * 1000 });
    operations.push({ kind: "restore", key, valueHash: sha(value), ttlSeconds: options.ex }); return "OK";
  });
  return { operations, snapshot: () => ({ quote: read(pair.quoteKey), booking: read(pair.snapshotKey) }),
    consumedCount: () => operations.filter(o => o.kind === "compare-delete" && o.consumed).length,
    restoreCount: () => operations.filter(o => o.kind === "restore").length };
}

async function seed(db: Database, checkoutMode: CheckoutMode) {
  async function user(role: "seller" | "buyer") {
    const id = randomUUID();
    const [saved] = await db.insert(schema.users).values({ id, authId: randomUUID(),
      email: `checkout-lock-${id}@example.invalid`, name: `Synthetic ${role}`, businessName: `Synthetic ${role} business`,
      role, active: true, verified: true, verificationStatus: "verified", phone: "5555550101",
      businessAddress: "10 Office Road", businessCity: "Denver", businessState: "CO", businessZip: "80202",
      ...(role === "seller" ? { stripeAccountId: `acct_synthetic_${id.replaceAll("-", "")}`, stripeOnboardingComplete: true } : {}),
    }).returning(); return saved;
  }
  const seller = await user("seller"), buyer = await user("buyer");
  const geo = zipcodes.lookup("77002")!;
  const warehouseData = { sellerId: seller.id, city: "Houston", state: "TX", zip: "77002", contactName: "Dock Lead",
    phone: "5555550102", pickupStart: "09:00", pickupEnd: "15:00", hasLoadingDock: true, hasForklift: false,
    active: true, latitude: geo.latitude, longitude: geo.longitude, coordinateSource: "zip_centroid" };
  const [originalWarehouse] = await db.insert(schema.warehouses).values({ ...warehouseData, label: "Original dock", address: "200 Warehouse Road", isDefault: true }).returning();
  const [replacementWarehouse] = await db.insert(schema.warehouses).values({ ...warehouseData, label: "Replacement dock", address: "300 Warehouse Road", isDefault: false }).returning();
  const [listing] = await db.insert(schema.listings).values({ sellerId: seller.id, warehouseId: originalWarehouse.id,
    title: "Synthetic checkout concurrency flooring", materialType: "engineered", condition: "new_overstock", status: "active",
    totalSqFt: 1200, totalPallets: 2, sqFtPerBox: 20, boxesPerPallet: 30, moq: 100, moqUnit: "sqft",
    palletWeight: 1400, palletLength: 48, palletWidth: 40, palletHeight: 44, freightClass: "70",
    locationCity: "Houston", locationState: "TX", locationZip: "77002", locationLat: geo.latitude, locationLng: geo.longitude,
    askPricePerSqFt: 2.75, buyNowPrice: 2.75, allowOffers: true, fullLotOnly: false, certifications: [],
    territoryMode: "unrestricted", freightPaymentMode: "buyer_pays", sellerFreightStates: [],
    lastConfirmedAt: new Date(), confirmationDueAt: new Date(Date.now() + 86400000 * 7),
  }).returning();
  const quantitySqFt = 200;
  const offer = checkoutMode === "offer" ? (await db.insert(schema.offers).values({ listingId: listing.id, buyerId: buyer.id,
    sellerId: seller.id, offerPricePerSqFt: 2.5, quantitySqFt, totalPrice: 500, status: "accepted",
    expiresAt: new Date(Date.now() + 86400000),
  }).returning())[0] : null;
  const origin = await loadWarehouseOrigin(db, listing);
  const token = `synthetic-lock-${randomUUID()}`, quoteId = 321, expiresAt = Date.now() + 3600000;
  const sharedQuote = { quoteId, carrierName: "Synthetic Freight", carrierScac: "TEST", carrierRate: 400,
    shippingPrice: 500, transitDays: 3, quoteExpiresAt: new Date(expiresAt).toISOString(), listingId: listing.id,
    buyerId: buyer.id, quantitySqFt, destinationZip: "80202" };
  const policy = captureCommercialPolicy();
  const windowDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const snapshot = shippingBookingSnapshotSchema.parse({ ...sharedQuote, version: 1, accessorialCodes: [], commercialPolicy: policy,
    originIdentity: origin.identity, originRevision: origin.revision, originLocation: origin.location,
    originCapabilities: { hasLoadingDock: origin.hasLoadingDock, hasForklift: origin.hasForklift,
      coordinateSource: origin.coordinateSource, latitude: origin.latitude, longitude: origin.longitude },
    lineItems: [{ freightClass: "70", packagingType: "Pallet", units: 1, pieces: 10, totalWeight: 1400,
      length: 48, width: 40, height: 44, description: "Synthetic engineered flooring", isStackable: false, isHazardous: false, isUsed: false }],
    pickupWindow: { date: windowDate, startTime: "09:00", endTime: "15:00" },
    deliveryWindow: { date: windowDate, startTime: "09:00", endTime: "17:00" },
  });
  const quoteValue = JSON.stringify({ ...sharedQuote, quoteToken: token, destinationState: "CO", freightFundingMode: "buyer_pays",
    buyerFreightCharge: 500, sellerFreightContribution: 0, freightFundingReason: "buyer_pays", appliedBuyerDropCharge: 0 });
  const pair = { quoteKey: getShippingQuoteTokenKey(token), snapshotKey: getShippingBookingSnapshotKeyByToken(token),
    quoteValue, snapshotValue: JSON.stringify(snapshot), expiresAt };
  const input = { requestId: randomUUID(), purchasePurpose: "business_use" as const, shippingName: "Synthetic Buyer",
    shippingAddress: "10 Delivery Road", shippingCity: "Denver", shippingState: "CO", shippingZip: "80202", selectedQuoteToken: token };
  const transport = quoteTransport(pair);
  boundary.stripeRetrieve.mockReset().mockImplementation(async (id: string, options: unknown) => {
    assert.equal(id, seller.stripeAccountId); assert.deepEqual(options, { timeout: 4000, maxNetworkRetries: 0 });
    return { id, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: "active" } };
  });
  return { seller, buyer, originalWarehouse, replacementWarehouse, listing, offer, quantitySqFt, origin, policy, snapshot,
    pair, input, transport, checkoutMode };
}
type Fixture = Awaited<ReturnType<typeof seed>>;
function checkout(db: Database, f: Fixture) {
  const c = caller(db, f.buyer);
  return f.checkoutMode === "direct" ? c.order.create({ ...f.input, listingId: f.listing.id, quantitySqFt: f.quantitySqFt }) :
    c.order.createFromOffer({ ...f.input, offerId: f.offer!.id });
}
async function mutate(db: Database, f: Fixture, mode: MutationMode) {
  const c = caller(db, f.seller);
  if (mode === "assign") return c.warehouse.assignListing({ listingId: f.listing.id, warehouseId: f.replacementWarehouse.id });
  const w = f.originalWarehouse;
  return c.warehouse.save({ id: w.id, data: { label: w.label, address: "201 Warehouse Road", city: w.city, state: w.state, zip: w.zip,
    contactName: w.contactName, phone: w.phone, pickupStart: w.pickupStart, pickupEnd: w.pickupEnd,
    hasLoadingDock: w.hasLoadingDock, hasForklift: w.hasForklift, active: true, isDefault: true } });
}
async function state(db: Database, f: Fixture) {
  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, f.listing.id));
  return { listing, orders: await db.select().from(schema.orders).where(eq(schema.orders.listingId, f.listing.id)),
    offers: await db.select().from(schema.offers).where(eq(schema.offers.listingId, f.listing.id)),
    warehouses: await db.select().from(schema.warehouses).where(eq(schema.warehouses.sellerId, f.seller.id)),
    origin: await loadWarehouseOrigin(db, listing),
    addresses: await db.select().from(schema.shippingAddresses).where(eq(schema.shippingAddresses.userId, f.buyer.id)),
  };
}

describe.skipIf(process.env.CHECKOUT_WAREHOUSE_LOCK_PROOF !== "1")("checkout / warehouse independent PostgreSQL sessions", () => {
  const runId = randomUUID(), cloneName = `pm_cw_${runId.replaceAll("-", "")}`, marker = `checkout-warehouse-lock:${runId}`;
  const mode = process.env.CHECKOUT_WAREHOUSE_LOCK_MODE;
  const directory = path.resolve("tmp/journey10/checkout-warehouse-lock/proof", `${mode ?? "unadmitted"}-${runId}`);
  let admin: ReturnType<typeof postgres> | undefined, a: ReturnType<typeof postgres> | undefined, b: ReturnType<typeof postgres> | undefined;
  let dbA: Database, dbB: Database, pidA: number, pidB: number, created = false, marked = false;
  let original: Record<string, unknown> | undefined;
  const evidence: Record<string, unknown> = { runId, cloneName, marker, target: TARGET, mode, cases: [], candidatePassed: false,
    boundary: "Actual tRPC routers, SQL locks, payout readiness, idempotency, origin, fees, disabled-test-tax, resale and inventory. Synthetic auth/rate limiting, Stripe.accounts.retrieve and faithful Redis quote transport. No external provider success or RLS claim." };
  const write = () => { if (fs.existsSync(directory)) fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(evidence, null, 2)); };
  async function digest(connection: ReturnType<typeof postgres>) {
    const result: Record<string, unknown> = {};
    const tables = await connection`select c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname`;
    for (const row of tables) {
      const [value] = await connection`select count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public.${connection(String(row.name))} t`;
      result[String(row.name)] = { count: Number(value.count), digest: String(value.digest) };
    }
    return result;
  }
  async function blocked(waiter: number, blocker: number, done: () => boolean) {
    assert(admin);
    for (let i = 0; i < 150; i++) {
      const rows = await admin`select pid,datname,state,wait_event_type,wait_event,pg_blocking_pids(pid) blockers,query
        from pg_stat_activity where pid in (${waiter},${blocker}) order by pid`;
      const waiting = rows.find(r => Number(r.pid) === waiter);
      if (waiting && (waiting.blockers as number[]).includes(blocker)) return { waiter, blocker, observation: rows };
      if (done()) throw new Error("Operation completed instead of blocking on the required real row lock");
      await new Promise(r => setTimeout(r, 20));
    }
    throw new Error("Required pg_blocking_pids relationship was not observed");
  }
  beforeAll(async () => {
    assert.equal(process.env.CHECKOUT_WAREHOUSE_LOCK_OTHER_FIXTURES_CLEANED, "1");
    assert.equal(process.env.DATABASE_URL, TARGET); assert.equal(process.env.NODE_ENV, "test");
    assert.equal(process.env.STRIPE_SECRET_KEY, "sk_test_disconnected"); assert.equal(process.env.STRIPE_TAX_MODE, "disabled");
    assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, "local-test"); assert.equal(process.env.UPSTASH_REDIS_REST_TOKEN, "local");
    assert.equal(process.env.PRIORITY1_DRY_RUN, "true"); assert(mode === "baseline" || mode === "candidate");
    assert(/^pm_cw_[a-f0-9]{32}$/.test(cloneName)); assert(/^checkout-warehouse-lock:[a-f0-9-]{36}$/.test(marker));
    boundary.unexpected.length = 0;
    fs.mkdirSync(directory, { recursive: true }); evidence.sources = sources(); write();
    vi.stubGlobal("fetch", () => { boundary.unexpected.push("network fetch"); throw new Error("Network forbidden in local concurrency proof"); });
    admin = postgres(TARGET, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {},
      connection: { application_name: `checkout-lock-observer-${runId.slice(0, 8)}`, statement_timeout: 15000 } });
    const [identity] = await admin`select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,current_setting('session_replication_role') replication`;
    expect(identity).toMatchObject({ name: PARENT_NAME, role: "postgres", address: "127.0.0.1", port: 55439, replication: "origin" });
    expect(await admin`select pid from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()`).toHaveLength(0);
    original = await digest(admin); evidence.canonicalBefore = original;
    const constraints = await admin`select conname,convalidated from pg_constraint where conname in ('listings_warehouse_seller_fk','warehouses_id_seller_key') order by conname`;
    expect(constraints).toHaveLength(2); expect(constraints.every(c => c.convalidated)).toBe(true);
    evidence.admission = { identity, constraints }; write();
    await admin.unsafe(`create database "${cloneName}" template "${PARENT_NAME}"`); created = true;
    await admin.unsafe(`comment on database "${cloneName}" is '${marker}'`); marked = true;
    const [owned] = await admin`select datname,pg_get_userbyid(datdba) owner,shobj_description(oid,'pg_database') marker from pg_database where datname=${cloneName}`;
    expect(owned).toMatchObject({ datname: cloneName, owner: "postgres", marker }); evidence.cloneAdmission = owned;
    const url = `postgresql://postgres@127.0.0.1:55439/${cloneName}`;
    const options = { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {},
      connection: { statement_timeout: 12000, lock_timeout: 8000, deadlock_timeout: 250 } };
    a = postgres(url, { ...options, connection: { ...options.connection, application_name: `checkout-lock-A-${runId.slice(0, 8)}` } });
    b = postgres(url, { ...options, connection: { ...options.connection, application_name: `checkout-lock-B-${runId.slice(0, 8)}` } });
    const identities = [];
    for (const connection of [a, b]) {
      const [id] = await connection`select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,pg_backend_pid() pid,current_setting('session_replication_role') replication,current_setting('deadlock_timeout') deadlock_timeout`;
      expect(id).toMatchObject({ name: cloneName, role: "postgres", address: "127.0.0.1", port: 55439, replication: "origin" }); identities.push(id);
    }
    pidA = Number(identities[0].pid); pidB = Number(identities[1].pid); expect(pidA).not.toBe(pidB);
    dbA = drizzle(a, { schema }); dbB = drizzle(b, { schema });
    evidence.sessions = identities; evidence.cloneBefore = await digest(a); expect(evidence.cloneBefore).toEqual(original); write();
  }, 60000);
  afterAll(async () => {
    const cleanupErrors: Array<Record<string, unknown>> = [];
    async function cleanup(work: () => Promise<void>) { try { await work(); } catch (error) { cleanupErrors.push(...errorChain(error)); } }
    await cleanup(async () => { if (a) evidence.cloneAfter = await digest(a); });
    await cleanup(async () => { if (a) await a.end({ timeout: 2 }); });
    await cleanup(async () => { if (b) await b.end({ timeout: 2 }); });
    await cleanup(async () => {
      if (!created) return;
      assert(admin); assert(marked, "Unmarked clone must be reconciled manually; refusing DROP");
      const [owned] = await admin`select datname,pg_get_userbyid(datdba) owner,shobj_description(oid,'pg_database') marker from pg_database where datname=${cloneName}`;
      expect(owned).toMatchObject({ datname: cloneName, owner: "postgres", marker });
      expect(await admin`select pid from pg_stat_activity where datname=${cloneName}`).toHaveLength(0);
      await admin.unsafe(`drop database "${cloneName}"`);
      expect(await admin`select datname from pg_database where datname=${cloneName}`).toHaveLength(0);
      evidence.cloneDropped = true;
    });
    await cleanup(async () => {
      if (!admin || !original) return;
      evidence.canonicalAfter = await digest(admin); expect(evidence.canonicalAfter).toEqual(original); evidence.canonicalPublicDataUnchanged = true;
    });
    await cleanup(async () => { evidence.sourceReadback = sources(); expect(evidence.sourceReadback).toEqual(evidence.sources); expect(boundary.unexpected).toEqual([]); });
    evidence.cleanupErrors = cleanupErrors; evidence.unexpectedOperations = boundary.unexpected;
    const cases = evidence.cases as Array<{ passed?: boolean; deadlockObserved?: boolean }>;
    evidence.candidatePassed = mode === "candidate" && cases.length === 8 && cases.every(c => c.passed) && cleanupErrors.length === 0 && evidence.cloneDropped === true && evidence.canonicalPublicDataUnchanged === true;
    evidence.baselineReproduced = mode === "baseline" && cases.length === 8 && cases.every(c => c.passed) && cases.filter(c => c.deadlockObserved).length === 4;
    write(); vi.unstubAllGlobals(); if (admin) await admin.end({ timeout: 2 });
    expect(cleanupErrors).toEqual([]);
  }, 60000);

  const cases: Array<[CheckoutMode, MutationMode, First]> = [];
  for (const c of ["direct", "offer"] as const) for (const m of ["edit", "assign"] as const) for (const first of ["checkout", "warehouse"] as const) cases.push([c, m, first]);
  it.each(cases)("%s checkout / warehouse %s / %s first", async (checkoutMode, mutationMode, first) => {
    const record: Record<string, unknown> = { checkoutMode, mutationMode, first, passed: false };
    (evidence.cases as unknown[]).push(record); write();
    let checkoutWork: Promise<Outcome<Awaited<ReturnType<typeof checkout>>>> | undefined;
    let mutationWork: Promise<Outcome<Awaited<ReturnType<typeof mutate>>>> | undefined;
    const hold = gate();
    try {
      const f = await seed(dbA, checkoutMode); record.fixture = { sellerId: f.seller.id, buyerId: f.buyer.id, listingId: f.listing.id, offerId: f.offer?.id ?? null,
        originalWarehouseId: f.originalWarehouse.id, replacementWarehouseId: f.replacementWarehouse.id, requestId: f.input.requestId,
        quoteHash: sha(f.pair.quoteValue), snapshotHash: sha(f.pair.snapshotValue) };
      const before = await state(dbA, f); record.before = before;
      let checkoutDone = false, mutationDone = false;
      if (first === "checkout") {
        checkoutWork = outcome(checkout(withBarrier(dbA, "listing-lock", hold), f)).then(r => { checkoutDone = true; return r; });
        await within(hold.entered);
        mutationWork = outcome(mutate(dbB, f, mutationMode)).then(r => { mutationDone = true; return r; });
        record.blocking = await blocked(pidB, pidA, () => mutationDone);
      } else {
        mutationWork = outcome(mutate(withBarrier(dbB, mutationMode === "edit" ? "warehouse-update" : "listing-update", hold), f, mutationMode)).then(r => { mutationDone = true; return r; });
        await within(hold.entered);
        checkoutWork = outcome(checkout(dbA, f)).then(r => { checkoutDone = true; return r; });
        record.blocking = await blocked(pidA, pidB, () => checkoutDone);
      }
      hold.release();
      const [purchase, mutation] = await within(Promise.all([checkoutWork, mutationWork]));
      record.checkout = report(purchase); record.mutation = report(mutation);
      const allCodes = [...codes(purchase), ...codes(mutation)]; record.sqlAndRpcCodes = allCodes;
      expect(allCodes).not.toContain("55P03"); expect(allCodes).not.toContain("57014");
      const after = await state(dbA, f); record.after = after;
      record.redis = f.transport.operations; record.stripeAccountReads = boundary.stripeRetrieve.mock.calls.length;
      expect(boundary.unexpected).toEqual([]);
      if (first === "checkout" && mode === "baseline") {
        expect(allCodes).toContain("40P01"); record.deadlockObserved = true;
        expect(Number(purchase.ok) + Number(mutation.ok)).toBe(1);
        // PostgreSQL may choose either victim; assert winner-consistent authoritative state below.
      } else {
        expect(allCodes).not.toContain("40P01");
        if (first === "checkout") {
          expect(purchase.ok).toBe(true); expect(mutation.ok).toBe(false);
          if (!mutation.ok) expect(mutation.error).toMatchObject({ code: "CONFLICT", message: mutationMode === "edit" ?
            "Complete or cancel reserved orders before changing this pickup location." : "Complete or cancel reserved orders before reassigning this listing." });
        } else {
          expect(mutation.ok).toBe(true); expect(purchase.ok).toBe(false);
          if (!purchase.ok) expect(purchase.error).toMatchObject({ code: "PRECONDITION_FAILED", message: "Pickup information changed. Request fresh shipping options before paying." });
        }
      }
      if (purchase.ok) {
        expect(after.orders).toHaveLength(1); const order = after.orders[0];
        expect(order.id).toBe(purchase.value.id);
        expect(order).toMatchObject({ buyerId: f.buyer.id, sellerId: f.seller.id, listingId: f.listing.id, checkoutRequestId: f.input.requestId,
          quantitySqFt: 200, status: "pending", inventoryReleasedAt: null, taxStatus: "disabled", taxAmount: 0, taxLiability: "none",
          shippingPrice: 500, carrierRate: 400, buyerFreightCharge: 500, sellerFreightContribution: 0, freightFundingMode: "buyer_pays" });
        const expectedFees = calculateOrderFees(checkoutMode === "offer" ? 500 : 550, 500, 0, f.policy);
        expect(order.totalPrice).toBe(expectedFees.totalCharge); expect(order.sellerPayout).toBe(expectedFees.sellerPayout);
        expect(order.buyerFee).toBe(expectedFees.buyerFee); expect(order.sellerFee).toBe(expectedFees.sellerFee);
        expect(order.shippingBookingSnapshot).toEqual(f.snapshot);
        expect(after.listing.totalSqFt).toBe(1000); expect(after.listing.status).toBe("active");
        expect(after.origin).toEqual(before.origin); expect(after.warehouses).toEqual(before.warehouses);
        expect(after.listing.warehouseId).toBe(f.originalWarehouse.id);
        if (f.offer) { expect(after.offers).toHaveLength(1); expect(after.offers[0].orderId).toBe(order.id); expect(order.offerId).toBe(f.offer.id); }
        else { expect(after.offers).toHaveLength(0); expect(order.offerId).toBeNull(); }
        expect(f.transport.consumedCount()).toBe(1); expect(f.transport.snapshot()).toEqual({ quote: null, booking: null });
        expect(boundary.stripeRetrieve).toHaveBeenCalledTimes(1);
        const calls = boundary.stripeRetrieve.mock.calls.length, redisCalls = f.transport.operations.length;
        const replay = await checkout(dbA, f); expect(replay.id).toBe(order.id);
        expect(await state(dbA, f)).toEqual(after); expect(boundary.stripeRetrieve.mock.calls).toHaveLength(calls);
        expect(f.transport.operations).toHaveLength(redisCalls); record.replay = { id: replay.id, stateUnchanged: true, noProviderOrRedisRepeat: true };
      } else {
        expect(after.orders).toHaveLength(0); expect(after.listing.totalSqFt).toBe(1200); expect(after.listing.status).toBe("active");
        expect(after.addresses).toHaveLength(0);
        if (f.offer) { expect(after.offers).toHaveLength(1); expect(after.offers[0].orderId).toBeNull(); expect(after.offers[0].status).toBe("accepted"); }
        expect(f.transport.consumedCount()).toBe(0); expect(boundary.redisEval).not.toHaveBeenCalled();
        expect(f.transport.snapshot()).toEqual({ quote: f.pair.quoteValue, booking: f.pair.snapshotValue });
        expect(mutation.ok).toBe(true); expect(after.origin.revision).not.toBe(before.origin.revision);
        if (mutationMode === "edit") {
          expect(after.listing.warehouseId).toBe(f.originalWarehouse.id); expect(after.origin.location.address.addressLine1).toBe("201 Warehouse Road");
          expect(after.warehouses.find(w => w.id === f.originalWarehouse.id)?.revision).toBe(f.originalWarehouse.revision + 1);
        } else {
          expect(after.listing.warehouseId).toBe(f.replacementWarehouse.id); expect(after.origin.identity).toBe(`warehouse:${f.replacementWarehouse.id}`);
          expect(after.origin.location.address.addressLine1).toBe("300 Warehouse Road"); expect(after.warehouses).toEqual(before.warehouses);
        }
        if (first === "warehouse") expect(boundary.stripeRetrieve).toHaveBeenCalledTimes(1);
      }
      expect(f.transport.restoreCount()).toBe(0); // These lock/stale-origin failures occur before CAS, not during restoration.
      expect(after.listing.locationCity).toBe("Houston"); expect(after.listing.locationState).toBe("TX"); expect(after.listing.locationZip).toBe("77002");
      expect(after.warehouses.filter(w => w.isDefault)).toHaveLength(1);
      record.passed = true;
    } catch (error) { record.failure = errorChain(error); throw error; }
    finally {
      hold.release();
      // Observe every started promise so rejected concurrency work cannot leak into another case.
      const remaining = [checkoutWork, mutationWork].filter((p): p is NonNullable<typeof p> => p !== undefined);
      if (remaining.length) await within(Promise.all(remaining));
      write();
    }
  }, 45000);
});
