// Candidate target: src/server/services/__tests__/registration-role-proof.test.ts
// @vitest-environment node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { users, roleProviderWrites, type User } from "@/server/db/schema";
import type { Database } from "@/server/db";
import type { RegisterInput } from "@/lib/validators/auth";
import { createProviderRaceFixture, type ProviderRaceFixture } from "./fixtures/provider-race-fixture";

const bridge = vi.hoisted(() => ({
  target: "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929",
  allowLimit: true, limits: 0, signUps: 0, reads: 0, puts: 0, deletes: 0, welcomes: 0, events: 0, inserts: 0,
  read: undefined as undefined | ((id: string) => Promise<{ id: string; appMetadata: Record<string, unknown> }>),
  patch: undefined as undefined | ((id: string, patch: Record<string, unknown>) => Promise<void>),
  clients: [] as Array<{ end(options: { timeout: number }): Promise<void> }>,
  admissions: [] as Array<Record<string, unknown>>,
}));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: { NODE_ENV: "test", DATABASE_URL: bridge.target, NEXT_PUBLIC_APP_URL: "https://registration-proof.example.invalid" } }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  static slidingWindow() { return {}; }
  async limit() { bridge.limits += 1; return { success: bridge.allowLimit }; }
} }));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}) }));
vi.mock("@/lib/email/send", () => ({ async sendWelcomeEmail() { bridge.welcomes += 1; } }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { async send() { bridge.events += 1; return { ids: ["controlled-registration-event"] }; } } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient() { throw new Error("Unexpected external Supabase client"); },
  async createServiceClient() { return { auth: { admin: {
    async getUserById(id: string) {
      bridge.reads += 1; assert(bridge.read);
      const value = await bridge.read(id);
      return { data: { user: { id: value.id, app_metadata: value.appMetadata } }, error: null };
    },
    async updateUserById(id: string, value: { app_metadata: Record<string, unknown> }) {
      bridge.puts += 1; assert(bridge.patch); assert(bridge.read);
      await bridge.patch(id, value.app_metadata);
      const result = await bridge.read(id);
      return { data: { user: { id: result.id, app_metadata: result.appMetadata } }, error: null };
    },
    async deleteUser() { bridge.deletes += 1; throw new Error("Auth deletion forbidden by this registration contract"); },
  } } }; },
}));

// Execute the REAL product coordinator, including its local admitted flag and
// real max=1 pool. Only admit/track its pinned local connection for cleanup.
vi.mock("postgres", async importOriginal => {
  const original = await importOriginal<{ default: typeof import("postgres") }>();
  const factory = new Proxy(original.default, { apply(target, thisArg, args) {
    const result = Reflect.apply(target, thisArg, args) as ReturnType<typeof original.default>;
    const options = args[1] as { max?: number; prepare?: boolean; connection?: { application_name?: string } } | undefined;
    if (options?.connection?.application_name !== "plankmarket-role-coordinator") return result;
    assert.equal(args[0], bridge.target); assert.equal(options.max, 1); assert.equal(options.prepare, false);
    bridge.clients.push(result);
    return new Proxy(result, { get(client, key) {
      const value = Reflect.get(client, key);
      if (key === "begin") return async (...callArgs: unknown[]) => {
        const [identity] = await client.unsafe("select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,pg_backend_pid() pid");
        assert.deepEqual({ name: identity.name, role: identity.role, address: identity.address, port: identity.port },
          { name: "plankmarket_bootstrap_design_20260929", role: "postgres", address: "127.0.0.1", port: 55439 });
        bridge.admissions.push({ ...identity });
        return Reflect.apply(value as (...values: unknown[]) => unknown, client, callArgs);
      };
      return typeof value === "function" ? value.bind(client) : value;
    } });
  } });
  return { ...original, default: factory };
});

function barrier() {
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  return { entered, released, enter, release };
}
async function within<T>(work: Promise<T>, ms = 4000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Registration barrier did not progress")), ms); })]); }
  finally { clearTimeout(timer); }
}
function resetCounts() {
  bridge.allowLimit = true;
  bridge.limits = bridge.signUps = bridge.reads = bridge.puts = bridge.deletes = bridge.welcomes = bridge.events = bridge.inserts = 0;
}
function countedDatabase(db: Database): Database {
  return new Proxy(db, { get(target, key) {
    const value = Reflect.get(target, key);
    if (key === "insert") return (...args: unknown[]) => {
      if (args[0] === users) bridge.inserts += 1;
      return Reflect.apply(value as (...values: unknown[]) => unknown, target, args);
    };
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
function controlledIdentity(authId: string, initial: Record<string, unknown> = {}) {
  let metadata = { fixtureUnrelated: { keep: "unchanged" }, ...initial } as Record<string, unknown>;
  let pending: Record<string, unknown> | null = null;
  const boundary = {
    deferOnce: false,
    current: () => structuredClone(metadata),
    async read(id: string) { assert.equal(id, authId); return { id, appMetadata: structuredClone(metadata) }; },
    async patch(id: string, patch: Record<string, unknown>) {
      assert.equal(id, authId);
      assert.deepEqual(Object.keys(patch).sort(), ["plankmarket_role_write", "plankmarket_seller_activation", "role"]);
      assert.match(String(patch.plankmarket_role_write), /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
      if (boundary.deferOnce) { boundary.deferOnce = false; pending = structuredClone(patch); throw new Error("Local timeout before original remote PUT applies"); }
      metadata = { ...metadata, ...structuredClone(patch) };
    },
    settleOriginal() { assert(pending); metadata = { ...metadata, ...pending }; pending = null; },
    pending: () => structuredClone(pending),
  };
  bridge.read = boundary.read; bridge.patch = boundary.patch;
  return boundary;
}

describe.skipIf(process.env.REGISTRATION_ROLE_DB_PROOF !== "1")("actual registration router on isolated PostgreSQL", () => {
  let f: ProviderRaceFixture;
  let authRouter: (typeof import("@/server/routers/auth"))["authRouter"];
  let coordinate: (typeof import("@/server/services/role-provider-coordinator"))["withRoleProviderCoordinator"];
  beforeAll(async () => {
    assert.equal(process.env.ROLE_PROVIDER_DB_PROOF, "1", "Existing exact-local fixture opt-in is also required");
    vi.stubGlobal("fetch", () => { throw new Error("Network provider fetch forbidden in registration proof"); });
    f = await createProviderRaceFixture("fixed");
    ({ authRouter } = await import("@/server/routers/auth"));
    ({ withRoleProviderCoordinator: coordinate } = await import("@/server/services/role-provider-coordinator"));
    const paths = ["src/server/routers/auth.ts", "src/server/trpc.ts", "src/lib/validators/auth.ts", "src/server/services/role-provider-coordinator.ts", "src/server/services/role-provider-write-session.ts", "src/server/services/resume-account-setup.ts", "src/server/services/seller-activation-provider.ts", "src/server/services/__tests__/registration-role-proof.test.ts", "src/server/services/__tests__/fixtures/provider-race-fixture.ts", "drizzle/0044_role_provider_writes.sql"];
    f.note("registration-source-bindings", paths.map(file => ({ file, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") })));
  }, 30000);
  afterAll(async () => {
    const errors: unknown[] = [];
    for (const client of bridge.clients) {
      try { await client.end({ timeout: 2 }); } catch (error) { errors.push(error); }
    }
    try { if (f) f.note("registration-coordinator-admission", { connections: bridge.clients.length, admissions: bridge.admissions, shutdownErrors: errors.length }); }
    catch (error) { errors.push(error); }
    try {
      if (f) await f.cleanup();
    } catch (error) {
      errors.push(error);
    } finally { vi.unstubAllGlobals(); }
    if (errors.length) throw new AggregateError(errors, "Registration proof cleanup failed");
  }, 30000);
  const input = (email: string, role: "buyer" | "seller" = "buyer"): RegisterInput => ({ email, password: "Only-a-local-fixture-password", name: "Registration Fixture", role, businessName: "Fixture Flooring", zipCode: "80202" });
  function caller(authId: string, registrationEmail: string, user: User | null = null, authenticatedAuthId: string | null = null) {
    return authRouter.createCaller({
      db: countedDatabase(f.a.db), user, authUser: authenticatedAuthId ? { id: authenticatedAuthId } : null, clientIp: "127.0.0.1",
      supabase: { auth: { async signUp() {
        bridge.signUps += 1;
        return { data: { user: { id: authId, email: registrationEmail, app_metadata: {}, email_confirmed_at: null }, session: null }, error: null };
      } } },
      getAuthAssurance: async () => { throw new Error("Registration/resume must not invoke external assurance"); },
    } as never);
  }
  const profile = (authId: string) => f.c.db.query.users.findFirst({ where: eq(users.authId, authId) });
  const receipts = (userId: string) => f.c.db.select().from(roleProviderWrites).where(eq(roleProviderWrites.userId, userId));
  async function counts() {
    const [r] = await f.c.sql`select (select count(*)::int from users) users,(select count(*)::int from role_provider_writes) receipts`;
    return r;
  }

  it("busy admission precedes signUp/profile/PUT and the same input succeeds after release", async () => {
    resetCounts(); const authId = randomUUID(), email = `busy-${authId}@example.invalid`, p = controlledIdentity(authId);
    const before = await counts(), gate = barrier(), unrelated = randomUUID();
    const held = coordinate(unrelated, async () => { gate.enter(); await gate.released; });
    try {
      await within(gate.entered);
      await expect(caller(authId, email).register(input(email))).rejects.toMatchObject({ code: "CONFLICT" });
      expect(bridge.limits).toBeGreaterThan(0);
      expect({ signUps: bridge.signUps, inserts: bridge.inserts, puts: bridge.puts, deletes: bridge.deletes }).toEqual({ signUps: 0, inserts: 0, puts: 0, deletes: 0 });
      expect(await counts()).toEqual(before); expect(await profile(authId)).toBeUndefined();
      expect(p.current()).toEqual({ fixtureUnrelated: { keep: "unchanged" } });
      f.note("registration-busy-zero-effects", { authId, unrelated, counts: before, signUps: 0, inserts: 0, puts: 0, realCoordinatorAdmission: true });
    } finally { gate.release(); await held; }
    const result = await caller(authId, email).register(input(email));
    const saved = await profile(authId); assert(saved);
    expect(result.user.id).toBe(saved.id); expect(saved).toMatchObject({ role: "buyer", verified: false, verificationStatus: "unverified" });
    const writes = await receipts(saved.id); expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ purpose: "registration", expectedRole: "buyer" }); expect(writes[0].confirmedAt).not.toBeNull();
    expect({ signUps: bridge.signUps, inserts: bridge.inserts, puts: bridge.puts, deletes: bridge.deletes, welcomes: bridge.welcomes, events: bridge.events })
      .toEqual({ signUps: 1, inserts: 1, puts: 1, deletes: 0, welcomes: 1, events: 1 });
    f.note("registration-after-busy-success", { userId: saved.id, authId, oneProfile: true, oneConfirmedWrite: true, controlledWelcomeAndEvent: true });
  }, 15000);

  it("duplicate existing identity cannot rewrite buyer role or delete the account", async () => {
    const seeded = await f.seed(), before = await profile(seeded.user.authId); assert(before);
    resetCounts(); const p = controlledIdentity(before.authId, { role: before.role }); const beforeCounts = await counts();
    await expect(caller(before.authId, before.email).register(input(before.email, "seller"))).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(bridge.signUps).toBe(1); expect(bridge.inserts).toBe(1);
    expect({ reads: bridge.reads, puts: bridge.puts, deletes: bridge.deletes, welcomes: bridge.welcomes, events: bridge.events })
      .toEqual({ reads: 0, puts: 0, deletes: 0, welcomes: 0, events: 0 });
    expect(await profile(before.authId)).toEqual(before); expect(await counts()).toEqual(beforeCounts); expect(await receipts(before.id)).toHaveLength(0);
    expect(p.current()).toEqual({ role: before.role, fixtureUnrelated: { keep: "unchanged" } });
    f.note("registration-duplicate-preserved", { userId: before.id, authId: before.authId, profileUnchanged: true, providerWrites: 0, authDeletes: 0, controlledDuplicateSignUpResponse: true });
  });

  it("unknown initialization recovers through the actual authenticated router without a second PUT", async () => {
    resetCounts(); const authId = randomUUID(), email = `unknown-${authId}@example.invalid`, p = controlledIdentity(authId); p.deferOnce = true;
    await expect(caller(authId, email).register(input(email, "seller"))).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const saved = await profile(authId); assert(saved); const savedBefore = structuredClone(saved);
    expect(saved).toMatchObject({ role: "seller", verified: false, verificationStatus: "unverified" });
    const issued = await receipts(saved.id); expect(issued).toHaveLength(1); expect(issued[0]).toMatchObject({ purpose: "registration", expectedRole: "seller", activationMarker: null, confirmedAt: null });
    expect(p.pending()?.plankmarket_role_write).toBe(issued[0].id); expect(bridge.puts).toBe(1);

    await expect(caller(authId, email).register(input(email, "seller"))).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(bridge.signUps).toBe(2); expect(bridge.puts).toBe(1); expect(bridge.deletes).toBe(0); expect(await profile(authId)).toEqual(savedBefore);
    const readsBeforeRefusal = bridge.reads;
    await expect(caller(authId, email).resumeAccountSetup()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller(authId, email, saved, randomUUID()).resumeAccountSetup()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    bridge.allowLimit = false;
    try { await expect(caller(authId, email, saved, authId).resumeAccountSetup()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" }); }
    finally { bridge.allowLimit = true; }
    expect(bridge.reads).toBe(readsBeforeRefusal); expect(bridge.puts).toBe(1);

    await expect(caller(authId, email, saved, authId).resumeAccountSetup()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(await receipts(saved.id)).toEqual(issued); expect(bridge.puts).toBe(1); expect(p.current().role).toBeUndefined();
    p.settleOriginal();
    await expect(caller(authId, email, saved, authId).resumeAccountSetup()).resolves.toEqual({ complete: true, role: "seller" });
    const confirmed = await receipts(saved.id); expect(confirmed).toHaveLength(1); expect(confirmed[0].id).toBe(issued[0].id); expect(confirmed[0].confirmedAt).not.toBeNull();
    await expect(caller(authId, email, saved, authId).resumeAccountSetup()).resolves.toEqual({ complete: true, role: "seller" });
    expect(await receipts(saved.id)).toEqual(confirmed); expect(await profile(authId)).toEqual(savedBefore); expect(bridge.puts).toBe(1); expect(bridge.deletes).toBe(0);
    expect(p.current()).toMatchObject({ role: "seller", plankmarket_role_write: issued[0].id, plankmarket_seller_activation: null, fixtureUnrelated: { keep: "unchanged" } });
    f.note("registration-unknown-router-recovery", { userId: saved.id, authId, receiptId: issued[0].id, providerPuts: 1, duplicateRegistrationPreserved: true, unauthenticatedRefused: true, mismatchedAuthRefused: true, deniedLimiterRefused: true, exactReadbackConfirmed: true, repeatReadOnly: true });
  }, 15000);
});
