// @vitest-environment node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import zipcodes from "zipcodes";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db";

type Handler = (input: { event: { data: { listingId: string } }; step: { run: (name: string, body: () => Promise<unknown>) => Promise<unknown> } }) => Promise<unknown>;
const bridge = vi.hoisted(() => ({ executor: null as unknown, handler: null as Handler | null, send: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/inngest/client", () => ({ inngest: { createFunction: (_options: unknown, _event: unknown, handler: Handler) => { bridge.handler = handler; return {}; } } }));
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://match-proof.example.invalid", EMAIL_FROM: "PlankMarket <match@example.invalid>", RESEND_API_KEY: "synthetic-intercepted-no-network" } }));
vi.mock("@/server/db", () => ({ db: new Proxy({}, { get(_target, key) {
  assert(bridge.executor, "Database accessed before exact local admission");
  const target = bridge.executor as Record<PropertyKey, unknown>, value = Reflect.get(target, key);
  return typeof value === "function" ? value.bind(target) : value;
} }) }));
vi.mock("@/lib/email/client", () => ({ resend: { emails: { send: bridge.send } } }));
await import("@/lib/inngest/functions/preference-match-alerts");

const TARGET = "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
const SOURCE = ["src/lib/inngest/functions/preference-match-alerts.ts", "src/lib/saved-search-matching.ts", "src/lib/email/delivery.ts", "src/lib/email/delivery-policy.ts", "src/server/security/listing-visibility.ts", "src/server/db/schema/user-preferences.ts", "src/lib/validators/preferences.ts", "src/lib/inngest/functions/__tests__/preference-match-alerts-postgres.test.ts"];
const sources = () => SOURCE.map(file => ({ path: file, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") }));
type Preference = typeof schema.userPreferences.$inferInsert & { buyerMatchInAppEnabled?: boolean; buyerMatchEmailEnabled?: boolean };
type Listing = typeof schema.listings.$inferInsert;
type User = typeof schema.users.$inferInsert;
const denver = zipcodes.lookup("80202")!;
const north = (miles: number) => ({ locationLat: denver.latitude + miles / 3959 * 180 / Math.PI, locationLng: denver.longitude });

describe.skipIf(process.env.MATCH_ALERT_DB_PROOF !== "1")("preference alerts / actual PostgreSQL and email ledger", () => {
  let connection: ReturnType<typeof postgres>, db: Database, original: unknown;
  const runId = randomUUID(), directory = path.resolve("tmp/journey10/alert-controls/proof", runId);
  const proof: Record<string, unknown> = { runId, target: TARGET, cases: [], boundary: "Real handler/Drizzle/PostgreSQL/delivery ledger; forced rollback per case; scheduler and email provider simulated" };
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
    assert.equal(process.env.MATCH_ALERT_OTHER_FIXTURES_CLEANED, "1");
    assert.equal(process.env.DATABASE_URL, TARGET);
    fs.mkdirSync(directory, { recursive: true }); proof.sources = sources(); note();
    connection = postgres(TARGET, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {}, connection: {
      application_name: `match-proof-${runId.slice(0, 8)}`, search_path: "public,pg_catalog", statement_timeout: 10000, lock_timeout: 3000, idle_in_transaction_session_timeout: 15000 } });
    db = drizzle(connection, { schema });
    const [identity] = await connection`select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,current_setting('session_replication_role') replication,current_setting('row_security') row_security`;
    expect(identity).toMatchObject({ name: "plankmarket_bootstrap_design_20260929", role: "postgres", address: "127.0.0.1", port: 55439, replication: "origin", row_security: "on" });
    const checks = await connection`select conname,convalidated from pg_constraint where conrelid in ('public.users'::regclass,'public.listings'::regclass,'public.user_preferences'::regclass,'public.notifications'::regclass,'public.email_deliveries'::regclass) order by conname`;
    const legacyUnvalidated = new Set(["listings_stripe_tax_code_format_check", "listings_tax_code_status_check", "listings_total_sq_ft_nonnegative_check", "listings_verified_tax_code_evidence_check"]);
    // NOT VALID preserves historical rows; PostgreSQL still checks each new fixture write.
    assert(checks.length > 0 && checks.every(row => row.convalidated || legacyUnvalidated.has(row.conname)));
    proof.admission = { ...identity, checks }; original = await digest(); proof.before = original; note();
    vi.stubGlobal("fetch", () => { throw new Error("Network forbidden in match proof"); });
  }, 30000);
  afterAll(async () => {
    try {
      if (original) { proof.after = await digest(); expect(proof.after).toEqual(original); proof.publicDataUnchanged = true; }
      if (proof.sources) { proof.sourceReadback = sources(); expect(proof.sourceReadback).toEqual(proof.sources); }
      if (fs.existsSync(directory)) { note(); console.info(`Match proof: ${directory}/results.json`); }
    } finally { vi.unstubAllGlobals(); if (connection) await connection.end({ timeout: 2 }); }
  }, 30000);
  async function rollback(label: string, body: (executor: Database) => Promise<void>) {
    const sentinel = new Error("MATCH_PROOF_ROLLBACK"); let failed: unknown, passed = false, rolledBack = false;
    bridge.send.mockReset().mockResolvedValue({ data: { id: `synthetic-${randomUUID()}` }, error: null });
    vi.spyOn(console, "error").mockImplementation(() => {});
    try { await db.transaction(async tx => {
      bridge.executor = tx;
      try { await body(tx as unknown as Database); await tx.execute(sql`set constraints all immediate`); passed = true; }
      catch (error) { failed = error; }
      finally { throw sentinel; }
    }); } catch (error) { if (error === sentinel) rolledBack = true; else failed ??= error; }
    finally { bridge.executor = null; vi.restoreAllMocks(); }
    (proof.cases as unknown[]).push({ label, passed: passed && !failed, rolledBack, simulatedProviderCalls: bridge.send.mock.calls.length, error: failed instanceof Error ? failed.message : failed ? "unknown" : null }); note();
    expect(rolledBack).toBe(true); if (failed) throw failed;
  }
  async function seed(executor: Database, prefs: Partial<Preference> = {}, lot: Partial<Listing> = {}, buyer: Partial<User> = {}) {
    const ownerId = randomUUID(), buyerId = randomUUID(), listingId = randomUUID();
    await executor.insert(schema.users).values([
      { id: ownerId, authId: randomUUID(), email: `${ownerId}@example.invalid`, name: "Synthetic supplier", role: "seller", verified: true, verificationStatus: "verified" },
      { id: buyerId, authId: randomUUID(), email: `${buyerId}@example.invalid`, name: "Synthetic purchasing business", role: "seller", verified: true, verificationStatus: "verified", businessState: "CO", zipCode: "10001", ...buyer },
    ]);
    await executor.insert(schema.userPreferences).values({ userId: buyerId, role: "seller", preferredMaterialTypes: ["engineered"], preferredZip: "80202", preferredRadiusMiles: 100, profileComplete: false, buyerMatchInAppEnabled: true, buyerMatchEmailEnabled: true, ...prefs } as Preference);
    if (lot.specificationEvidenceId) await executor.insert(schema.media).values({ id: lot.specificationEvidenceId, uploaderId: ownerId, url: "https://match-proof.example.invalid/specification.png", mimeType: "image/png" });
    await executor.insert(schema.listings).values({ id: listingId, sellerId: ownerId, title: "Synthetic engineered lot", slug: `match-proof-${listingId}`, materialType: "engineered", condition: "new_overstock", totalSqFt: 900,
      askPricePerSqFt: 8, buyNowPrice: 3, status: "active", lastConfirmedAt: new Date(), confirmationDueAt: new Date(Date.now() + 86400000),
      ...north(10), locationCity: "Denver", locationState: "CO", locationZip: "80202", ...lot });
    if (lot.specificationEvidenceId) await executor.update(schema.media).set({ listingId }).where(eq(schema.media.id, lot.specificationEvidenceId));
    return { ownerId, buyerId, listingId, email: buyer.email ?? `${buyerId}@example.invalid` };
  }
  const run = (listingId: string, cache = new Map<string, unknown>(), beforeDelivery?: () => Promise<void>) => bridge.handler!({ event: { data: { listingId } }, step: { run: async (name, body) => {
    if (cache.has(name)) return cache.get(name);
    if (name === "create-notifications-and-send-emails") await beforeDelivery?.();
    const result = await body(); cache.set(name, result); return result;
  } } });
  async function assertFanout(executor: Database, f: Awaited<ReturnType<typeof seed>>, expected: number) {
    const notices = await executor.select().from(schema.notifications).where(eq(schema.notifications.userId, f.buyerId));
    const deliveries = await executor.select().from(schema.emailDeliveries).where(sql`${f.email} = any(${schema.emailDeliveries.recipientEmails})`);
    expect(notices).toHaveLength(expected); expect(deliveries).toHaveLength(expected); expect(bridge.send).toHaveBeenCalledTimes(expected);
    if (expected) { expect(notices[0]!.data).toMatchObject({ listingId: f.listingId, directPurchasePricePerSqFt: 3 }); expect(deliveries[0]!.status).toBe("accepted"); }
  }

  it.each([
    { name: "inside 100 miles", miles: 99.99, radius: 100, expected: 1 },
    { name: "outside 100 miles", miles: 100.01, radius: 100, expected: 0 },
    { name: "inside 500 miles", miles: 499, radius: 500, expected: 1 },
    { name: "500 is not nationwide", miles: 700, radius: 500, expected: 0 },
    { name: "no radius is unconstrained", miles: 700, radius: null, expected: 1 },
    { name: "zero is not unlimited", miles: 10, radius: 0, expected: 0 },
    { name: "negative radius", miles: 10, radius: -1, expected: 0 },
  ])("$name", async ({ name, miles, radius, expected }) => rollback(name, async executor => {
    const f = await seed(executor, { preferredRadiusMiles: radius }, north(miles)); await run(f.listingId); await assertFanout(executor, f, expected);
  }));
  it.each([
    { name: "missing ZIP", prefs: { preferredZip: null }, lot: {} },
    { name: "unknown ZIP", prefs: { preferredZip: "00000" }, lot: {} },
    { name: "missing latitude", prefs: {}, lot: { locationLat: null } },
    { name: "missing longitude", prefs: {}, lot: { locationLng: null } },
    { name: "non-finite latitude", prefs: {}, lot: { locationLat: NaN } },
    { name: "invalid latitude", prefs: {}, lot: { locationLat: 91 } },
    { name: "invalid longitude", prefs: {}, lot: { locationLng: 181 } },
  ])("excludes $name from geographic matches", async ({ name, prefs, lot }) => rollback(name, async executor => {
    const f = await seed(executor, prefs, lot); await run(f.listingId); await assertFanout(executor, f, 0);
  }));
  it.each([
    { name: "purchasing seller", prefs: {}, lot: {}, buyer: {}, expected: 1 },
    { name: "buyer with seller legacy metadata", prefs: {}, lot: {}, buyer: { role: "buyer" as const }, expected: 1 },
    { name: "inactive account", prefs: {}, lot: {}, buyer: { active: false }, expected: 0 },
    { name: "material mismatch", prefs: { preferredMaterialTypes: ["tile"] }, lot: {}, buyer: {}, expected: 0 },
    { name: "inclusive direct price", prefs: { priceMinPerSqFt: 3, priceMaxPerSqFt: 3 }, lot: {}, buyer: {}, expected: 1 },
    { name: "zero price maximum", prefs: { priceMaxPerSqFt: 0 }, lot: {}, buyer: {}, expected: 0 },
    { name: "inclusive lot bounds", prefs: { minLotSizeSqFt: 900, maxLotSizeSqFt: 900 }, lot: {}, buyer: {}, expected: 1 },
    { name: "undersized lot", prefs: { minLotSizeSqFt: 901 }, lot: {}, buyer: {}, expected: 0 },
    { name: "oversized lot", prefs: { maxLotSizeSqFt: 899 }, lot: {}, buyer: {}, expected: 0 },
    { name: "waterproof evidence missing", prefs: { waterproofRequired: true }, lot: { waterResistance: "waterproof" as const }, buyer: {}, expected: 0 },
    { name: "reviewed waterproof", prefs: { waterproofRequired: true }, lot: { waterResistance: "waterproof" as const, specificationProvenance: "evidence_reviewed" as const, specificationReviewedAt: new Date(), specificationEvidenceId: randomUUID() }, buyer: {}, expected: 1 },
    { name: "no radius and no coordinates", prefs: { preferredRadiusMiles: null }, lot: { locationLat: null, locationLng: null }, buyer: {}, expected: 1 },
    { name: "verified territory", prefs: {}, lot: { territoryMode: "allowed_states" as const, allowedDestinationStates: ["CO"] }, buyer: {}, expected: 1 },
    { name: "wrong verified territory", prefs: {}, lot: { territoryMode: "allowed_states" as const, allowedDestinationStates: ["UT"] }, buyer: {}, expected: 0 },
    { name: "unverified territory", prefs: {}, lot: { territoryMode: "allowed_states" as const, allowedDestinationStates: ["CO"] }, buyer: { verified: false, verificationStatus: "unverified" }, expected: 0 },
    { name: "stale listing", prefs: {}, lot: { confirmationDueAt: new Date(0) }, buyer: {}, expected: 0 },
    { name: "draft listing", prefs: {}, lot: { status: "draft" as const }, buyer: {}, expected: 0 },
  ])("preserves eligibility: $name", async ({ name, prefs, lot, buyer, expected }) => rollback(name, async executor => {
    const f = await seed(executor, prefs, lot, buyer); await run(f.listingId); await assertFanout(executor, f, expected);
  }));
  it("does not alert an owner buying their own lot", async () => rollback("own listing", async executor => {
    const f = await seed(executor); await executor.update(schema.listings).set({ sellerId: f.buyerId }).where(eq(schema.listings.id, f.listingId));
    await run(f.listingId); await assertFanout(executor, f, 0);
  }));
  it("deduplicates actual notification and accepted email ledger on event replay", async () => rollback("event replay", async executor => {
    const f = await seed(executor); await run(f.listingId); await run(f.listingId); await assertFanout(executor, f, 1);
  }));
  it("retries a refused delivery using cached steps and the existing notification", async () => rollback("delivery retry", async executor => {
    const f = await seed(executor), cache = new Map<string, unknown>();
    bridge.send.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "Synthetic refusal", statusCode: 422 } });
    await expect(run(f.listingId, cache)).rejects.toBeInstanceOf(AggregateError);
    await run(f.listingId, cache);
    expect(await executor.select().from(schema.notifications).where(eq(schema.notifications.userId, f.buyerId))).toHaveLength(1);
    const deliveries = await executor.select().from(schema.emailDeliveries).where(sql`${f.email} = any(${schema.emailDeliveries.recipientEmails})`);
    expect(deliveries).toHaveLength(1); expect(deliveries[0]).toMatchObject({ status: "accepted", attemptCount: 2 });
    expect(bridge.send).toHaveBeenCalledTimes(2); expect(bridge.send.mock.calls[0]![1]).toEqual(bridge.send.mock.calls[1]![1]);
  }));
  it("retains the in-app alert and records suppression without a provider call or retry failure", async () => rollback("suppressed recipient", async executor => {
    const f = await seed(executor);
    await executor.insert(schema.emailRecipientSuppressions).values({ email: f.email, reason: "complained", suppressedAt: new Date() });
    expect(await run(f.listingId)).toMatchObject({ notificationsSent: 1, emailsSent: 0, emailsSuppressed: 1 });
    expect(await run(f.listingId)).toMatchObject({ notificationsSent: 0, emailsSent: 0, emailsSuppressed: 1 });
    expect(bridge.send).not.toHaveBeenCalled();
    const deliveries = await executor.select().from(schema.emailDeliveries).where(sql`${f.email} = any(${schema.emailDeliveries.recipientEmails})`);
    expect(deliveries).toHaveLength(1); expect(deliveries[0]).toMatchObject({ status: "suppressed", attemptCount: 0, providerMessageId: null });
  }));

  it.each([
    { inApp: true, email: true }, { inApp: true, email: false },
    { inApp: false, email: true }, { inApp: false, email: false },
  ])("respects independently selected channels: %j", async ({ inApp, email }) => rollback(`channels-${inApp}-${email}`, async executor => {
    const f = await seed(executor, { buyerMatchInAppEnabled: inApp, buyerMatchEmailEnabled: email });
    await run(f.listingId); await run(f.listingId);
    expect(await executor.select().from(schema.notifications).where(eq(schema.notifications.userId, f.buyerId))).toHaveLength(Number(inApp));
    const deliveries = await executor.select().from(schema.emailDeliveries).where(sql`${f.email} = any(${schema.emailDeliveries.recipientEmails})`);
    expect(deliveries).toHaveLength(Number(email)); expect(bridge.send).toHaveBeenCalledTimes(Number(email));
  }));
  it.each([
    "inactive-account", "changed-material", "changed-radius", "changed-price-limit", "changed-quantity", "required-waterproof",
    "deleted-preferences", "inactive-listing", "stale-listing", "changed-price", "changed-title", "changed-email", "revoked-territory",
  ])("revalidates a queued candidate: %s", async mode => rollback(`queued-${mode}`, async executor => {
    const f = await seed(executor, {}, mode === "revoked-territory" ? { territoryMode: "allowed_states", allowedDestinationStates: ["CO"] } : {});
    await run(f.listingId, new Map(), async () => {
      if (mode === "inactive-account") await executor.update(schema.users).set({ active: false }).where(eq(schema.users.id, f.buyerId));
      if (mode === "changed-material") await executor.update(schema.userPreferences).set({ preferredMaterialTypes: ["tile"] }).where(eq(schema.userPreferences.userId, f.buyerId));
      if (mode === "changed-radius") await executor.update(schema.userPreferences).set({ preferredZip: "10001", preferredRadiusMiles: 10 }).where(eq(schema.userPreferences.userId, f.buyerId));
      if (mode === "changed-price-limit") await executor.update(schema.userPreferences).set({ priceMaxPerSqFt: 2 }).where(eq(schema.userPreferences.userId, f.buyerId));
      if (mode === "changed-quantity") await executor.update(schema.userPreferences).set({ minLotSizeSqFt: 1000 }).where(eq(schema.userPreferences.userId, f.buyerId));
      if (mode === "required-waterproof") await executor.update(schema.userPreferences).set({ waterproofRequired: true }).where(eq(schema.userPreferences.userId, f.buyerId));
      if (mode === "deleted-preferences") await executor.delete(schema.userPreferences).where(eq(schema.userPreferences.userId, f.buyerId));
      if (mode === "inactive-listing") await executor.update(schema.listings).set({ status: "archived" }).where(eq(schema.listings.id, f.listingId));
      if (mode === "stale-listing") await executor.update(schema.listings).set({ confirmationDueAt: new Date(0) }).where(eq(schema.listings.id, f.listingId));
      if (mode === "changed-price") await executor.update(schema.listings).set({ buyNowPrice: 3.5 }).where(eq(schema.listings.id, f.listingId));
      if (mode === "changed-title") await executor.update(schema.listings).set({ title: "Updated synthetic listing" }).where(eq(schema.listings.id, f.listingId));
      if (mode === "changed-email") await executor.update(schema.users).set({ email: `changed-${f.buyerId}@example.invalid` }).where(eq(schema.users.id, f.buyerId));
      if (mode === "revoked-territory") await executor.update(schema.users).set({ verified: false, verificationStatus: "unverified" }).where(eq(schema.users.id, f.buyerId));
    });
    expect(await executor.select().from(schema.notifications).where(eq(schema.notifications.userId, f.buyerId))).toHaveLength(0);
    expect(bridge.send).not.toHaveBeenCalled();
  }));
  it("honors a channel opt-out after cached selection and after an email failure", async () => rollback("queued-opt-out-retry", async executor => {
    const f = await seed(executor), cache = new Map<string, unknown>();
    bridge.send.mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "Synthetic refusal", statusCode: 422 } });
    await expect(run(f.listingId, cache)).rejects.toBeInstanceOf(AggregateError);
    await executor.execute(sql`update user_preferences set buyer_match_in_app_enabled=false,buyer_match_email_enabled=false where user_id=${f.buyerId}::uuid`);
    expect(await run(f.listingId, cache)).toMatchObject({ notificationsSent: 0, emailsSent: 0 });
    expect(bridge.send).toHaveBeenCalledTimes(1);
    expect(await executor.select().from(schema.notifications).where(eq(schema.notifications.userId, f.buyerId))).toHaveLength(1);
  }));
  it("rechecks email eligibility after the in-app channel completes", async () => rollback("changed-between-channels", async executor => {
    const f = await seed(executor);
    // Observe the actual committed inner notification transaction, then apply a
    // user preference update before the handler continues to its email channel.
    const transaction = executor.transaction.bind(executor);
    const proxied = new Proxy(executor, { get(target, key) {
      if (key === "transaction") return async (...args: Parameters<Database["transaction"]>) => {
        const result = await transaction(...args);
        await executor.execute(sql`update user_preferences set buyer_match_email_enabled=false where user_id=${f.buyerId}::uuid`);
        return result;
      };
      const value = Reflect.get(target, key); return typeof value === "function" ? value.bind(target) : value;
    } });
    bridge.executor = proxied;
    await run(f.listingId);
    expect(await executor.select().from(schema.notifications).where(eq(schema.notifications.userId, f.buyerId))).toHaveLength(1);
    expect(bridge.send).not.toHaveBeenCalled();
  }));
});
