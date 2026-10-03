// Candidate target: src/server/services/__tests__/provider-role-races.test.ts
// @vitest-environment node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@/server/db/schema";
import type { Database } from "@/server/db";
import { createProviderRaceFixture, type ProviderRaceFixture } from "./fixtures/provider-race-fixture";

const bridge = vi.hoisted(() => ({
  coordinate: undefined as undefined | (<T>(id: string, work: () => Promise<T>) => Promise<T>),
  read: undefined as undefined | ((id: string) => Promise<{ id: string; appMetadata: Record<string, unknown> }>),
  patch: undefined as undefined | ((id: string, patch: Record<string, unknown>) => Promise<void>),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: { NODE_ENV: "test" } }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/services/role-provider-coordinator", () => ({ withRoleProviderCoordinator: <T>(id: string, work: () => Promise<T>) => {
  if (!bridge.coordinate) throw new Error("Fixture coordinator not admitted"); return bridge.coordinate(id, work);
} }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class { static slidingWindow() { return {}; } async limit() { return { success: true }; } } }));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}) }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send() { throw new Error("External event forbidden"); } } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient() { throw new Error("External client forbidden"); },
  async createServiceClient() { return { auth: { admin: {
    async getUserById(id: string) {
      if (!bridge.read) throw new Error("No controlled provider");
      const value = await bridge.read(id); return { data: { user: { id: value.id, app_metadata: value.appMetadata } }, error: null };
    },
    async updateUserById(id: string, value: { app_metadata: Record<string, unknown> }) {
      if (!bridge.patch || !bridge.read) throw new Error("No controlled provider");
      await bridge.patch(id, value.app_metadata);
      const valueAfter = await bridge.read(id);
      return { data: { user: { id: valueAfter.id, app_metadata: valueAfter.appMetadata } }, error: null };
    },
  } } }; },
}));

function barrier() {
  let enter!: () => void, release!: () => void;
  return { entered: new Promise<void>(r => { enter = r; }), released: new Promise<void>(r => { release = r; }), enter: () => enter(), release: () => release() };
}
async function within<T>(work: Promise<T>, ms = 4000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Expected interleaving did not progress")), ms); })]); }
  finally { clearTimeout(timer); }
}
async function outcome<T>(work: Promise<T>) { try { return { ok: true as const, value: await work }; } catch (error) { return { ok: false as const, error }; } }
function provider(id: string, options: { initialRole?: "buyer" | "seller" | "admin"; initialActivationMarker?: string; initialWriteMarker?: string } = { initialRole: "buyer" }) {
  let metadata: Record<string, unknown> = { ...(options.initialRole === undefined ? {} : { role: options.initialRole }), ...(options.initialActivationMarker ? { plankmarket_seller_activation: options.initialActivationMarker } : {}), ...(options.initialWriteMarker ? { plankmarket_role_write: options.initialWriteMarker } : {}), fixtureUnrelated: { keep: "unchanged" }, unrelatedFlatFlag: true };
  const calls: unknown[] = [], writes: Record<string, unknown>[] = [];
  const value = {
    beforePatch: undefined as undefined | ((patch: Record<string, unknown>) => Promise<void>),
    calls, writes, pending: null as Record<string, unknown> | null,
    deferRemoteOnce: false,
    current: () => structuredClone(metadata),
    async readUser(authId: string) { assert.equal(authId, id); calls.push({ read: authId }); return { id, appMetadata: structuredClone(metadata) }; },
    async patchRole(authId: string, patch: Record<string, unknown>) {
      assert.equal(authId, id);
      if (process.env.ROLE_PROVIDER_PROOF_MODE === "fixed") {
        assert.deepEqual(Object.keys(patch).sort(), ["plankmarket_role_write", "plankmarket_seller_activation", "role"]);
        assert.match(String(patch.plankmarket_role_write), /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
      } else assert(Object.keys(patch).every(key => ["role", "plankmarket_seller_activation"].includes(key)));
      writes.push(structuredClone(patch)); calls.push({ write: authId, patch: structuredClone(patch) });
      await value.beforePatch?.(patch);
      if (value.deferRemoteOnce) { value.deferRemoteOnce = false; value.pending = structuredClone(patch); throw new Error("Local timeout; remote request remains in flight"); }
      metadata = { ...metadata, ...structuredClone(patch) };
    },
    settleRemote() { assert(value.pending); metadata = { ...metadata, ...value.pending }; value.pending = null; },
  };
  bridge.read = value.readUser; bridge.patch = value.patchRole;
  return value;
}

// This facade delays only dispatch of the real users UPDATE. All reads, input
// validation, role decisions, middleware, transaction semantics and writes remain
// the actual admin.updateUser implementation and actual PostgreSQL.
function pauseBuyerUpdate(db: Database, gate: ReturnType<typeof barrier>): Database {
  const wrap = (target: object): object => new Proxy(target, { get(object, key) {
    if (key === "transaction") return (fn: (tx: unknown) => unknown) => (object as Database).transaction(tx => fn(wrap(tx)) as Promise<unknown>);
    if (key === "update") return (table: unknown) => {
      const query = (object as Database).update(table as typeof users);
      return new Proxy(query, { get(q, k) {
        if (k === "set") return (values: Record<string, unknown>) => {
          const updated = q.set(values);
          if (table !== users || values.role !== "buyer") return updated;
          return new Proxy(updated, { get(u, p) {
            if (p === "where") return (...args: Parameters<typeof u.where>) => {
              const filtered = u.where(...args);
              return new Proxy(filtered, { get(z, part) {
                if (part === "returning") return async () => { gate.enter(); await gate.released; return z.returning(); };
                const item = Reflect.get(z, part); return typeof item === "function" ? item.bind(z) : item;
              } });
            };
            const item = Reflect.get(u, p); return typeof item === "function" ? item.bind(u) : item;
          } });
        };
        const item = Reflect.get(q, k); return typeof item === "function" ? item.bind(q) : item;
      } });
    };
    const item = Reflect.get(object, key); return typeof item === "function" ? item.bind(object) : item;
  } });
  return wrap(db) as Database;
}

const mode = process.env.ROLE_PROVIDER_PROOF_MODE;
describe.skipIf(process.env.ROLE_PROVIDER_DB_PROOF !== "1")("real PostgreSQL provider-role concurrency", () => {
  let f: ProviderRaceFixture;
  let service: typeof import("@/server/services/seller-activation");
  let router: ReturnType<(typeof import("@/server/trpc"))["createTRPCRouter"]>;
  beforeAll(async () => {
    assert(mode === "baseline" || mode === "fixed", "Set explicit baseline or fixed proof mode");
    vi.stubGlobal("fetch", () => { throw new Error("All network providers forbidden in role proof"); });
    f = await createProviderRaceFixture(mode); bridge.coordinate = f.coordinate;
    service = await import("@/server/services/seller-activation");
    const { createTRPCRouter } = await import("@/server/trpc");
    const { adminRouter } = await import("@/server/routers/admin");
    router = createTRPCRouter({ admin: adminRouter });
  }, 30000);
  afterAll(async () => { try { if (f) await f.cleanup(); } finally { vi.unstubAllGlobals(); } }, 30000);
  async function approved() {
    const s = await f.seed();
    await service.saveSellerActivationDraft(f.a.db, s.user.id, { requestId: s.requestId, expectedRevision: null, businessWebsite: "https://seller-fixture.example.invalid", einTaxId: "12-3456789", documentId: s.document.id });
    let row = await f.a.db.query.sellerActivationRequests.findFirst({ where: (t, { eq }) => eq(t.requestId, s.requestId) }); assert(row);
    await service.submitSellerActivation(f.a.db, s.user.id, { requestId: s.requestId, expectedRevision: row.revision });
    row = await f.application(row.id); assert(row);
    await service.reviewSellerActivation(f.a.db, f.admin.id, { id: row.id, expectedRevision: row.revision, reviewRequestId: randomUUID(), decision: "approved", note: "Current existing-business seller evidence reviewed." });
    return { ...s, application: (await f.application(row.id))!, provider: provider(s.user.authId) };
  }
  function admin(db = f.b.db) {
    return router.createCaller({ db, authUser: { id: f.admin.authId }, user: f.admin, clientIp: "127.0.0.1", supabase: {},
      getAuthAssurance: async () => ({ currentLevel: "aal2", nextLevel: "aal2", lastFactorVerificationAt: new Date().toISOString(), recentVerificationSatisfied: true }),
    } as never) as unknown as { admin: { updateUser(input: { userId: string; role: "buyer" | "seller" | "admin" }): Promise<unknown> } };
  }
  const reconcile = (s: Awaited<ReturnType<typeof approved>>, db = f.a.db) => service.reconcileSellerActivation(db, s.user.id, s.application.id, s.provider);
  async function invalidate(s: Awaited<ReturnType<typeof approved>>) {
    await f.c.db.update(users).set({ businessName: "Changed Fixture Business", updatedAt: new Date() }).where(eq(users.id, s.user.id));
    expect(await f.application(s.application.id)).toMatchObject({ status: "stale", syncState: "blocked", claimToken: null });
  }
  async function replacementRefused(s: Awaited<ReturnType<typeof approved>>) {
    await expect(service.saveSellerActivationDraft(f.c.db, s.user.id, { requestId: randomUUID(), expectedRevision: null })).rejects.toMatchObject({ code: "CONFLICT" });
  }
  function preserved(p: ReturnType<typeof provider>) { expect(p.current()).toMatchObject({ fixtureUnrelated: { keep: "unchanged" }, unrelatedFlatFlag: true }); }

  async function unverified(role: "buyer" | "seller" = "buyer") {
    const s = await f.seed();
    await f.a.db.update(users).set({ role, verified: false, verificationStatus: "unverified", updatedAt: new Date() }).where(eq(users.id, s.user.id));
    const user = (await f.user(s.user.id))!;
    return { ...s, user, provider: provider(user.authId, { initialRole: undefined }) };
  }

  it.skipIf(mode !== "fixed").each(["buyer", "seller"] as const)("resume initializes only the current unverified %s role and repeats read-only", async role => {
    const { resumeAccountSetup } = await import("@/server/services/resume-account-setup");
    const s = await unverified(role), beforeUser = await f.user(s.user.id);
    const beforeReceipts = await f.c.sql`select id from role_provider_writes where user_id=${s.user.id}`;
    expect(beforeReceipts).toHaveLength(0); expect(s.provider.current().role).toBeUndefined();
    await expect(resumeAccountSetup(f.a.db, s.user.id, s.user.authId)).resolves.toEqual({ complete: true, role });
    expect(s.provider.writes).toHaveLength(1);
    expect(s.provider.current()).toMatchObject({ role, plankmarket_seller_activation: null });
    const firstReceipt = await f.c.sql`select id,version,expected_role,purpose,confirmed_at from role_provider_writes where user_id=${s.user.id} order by version`;
    expect(firstReceipt).toHaveLength(1); expect(firstReceipt[0]).toMatchObject({ version: 1, expected_role: role, purpose: "registration" });
    expect(firstReceipt[0].confirmed_at).not.toBeNull(); expect(s.provider.current().plankmarket_role_write).toBe(firstReceipt[0].id);
    await expect(resumeAccountSetup(f.b.db, s.user.id, s.user.authId)).resolves.toEqual({ complete: true, role });
    await expect(resumeAccountSetup(f.a.db, s.user.id, s.user.authId)).resolves.toEqual({ complete: true, role });
    expect(s.provider.writes).toHaveLength(1);
    expect(await f.c.sql`select id,version,expected_role,purpose,confirmed_at from role_provider_writes where user_id=${s.user.id} order by version`).toEqual(firstReceipt);
    expect(await f.user(s.user.id)).toEqual(beforeUser); preserved(s.provider);
    f.note("resume-service-receipt-absent", { role, userId: s.user.id, writes: s.provider.writes, receipt: firstReceipt, repeatedResumeReadOnly: true, actualRouterCovered: false });
  });

  it.skipIf(mode !== "fixed").each(["wrong-auth", "admin", "verified", "inactive"] as const)("resume rejects %s without provider PUT or receipt", async kind => {
    const { resumeAccountSetup } = await import("@/server/services/resume-account-setup");
    const s = await unverified();
    if (kind === "admin") await f.a.db.update(users).set({ role: "admin" }).where(eq(users.id, s.user.id));
    if (kind === "verified") await f.a.db.update(users).set({ verified: true, verificationStatus: "verified" }).where(eq(users.id, s.user.id));
    if (kind === "inactive") await f.a.db.update(users).set({ active: false }).where(eq(users.id, s.user.id));
    const beforeUser = await f.user(s.user.id);
    await expect(resumeAccountSetup(f.a.db, s.user.id, kind === "wrong-auth" ? randomUUID() : s.user.authId)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(s.provider.writes).toHaveLength(0); expect(s.provider.current().role).toBeUndefined();
    expect(await f.c.sql`select id from role_provider_writes where user_id=${s.user.id}`).toHaveLength(0);
    expect(await f.user(s.user.id)).toEqual(beforeUser); preserved(s.provider);
    f.note("resume-service-rejected", { kind, userId: s.user.id, writes: 0, receipts: 0, actualRouterCovered: false });
  });

  it.skipIf(mode !== "fixed")("unknown initialization cannot issue another PUT; exact later settlement resumes read-only", async () => {
    const { resumeAccountSetup } = await import("@/server/services/resume-account-setup");
    const s = await unverified("seller"), beforeUser = await f.user(s.user.id);
    s.provider.deferRemoteOnce = true;
    await expect(resumeAccountSetup(f.a.db, s.user.id, s.user.authId)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(s.provider.writes).toHaveLength(1); expect(s.provider.pending).not.toBeNull(); expect(s.provider.current().role).toBeUndefined();
    const issued = await f.c.sql`select id,version,expected_role,purpose,confirmed_at from role_provider_writes where user_id=${s.user.id} order by version`;
    expect(issued).toHaveLength(1); expect(issued[0]).toMatchObject({ version: 1, expected_role: "seller", purpose: "registration", confirmed_at: null });
    await expect(resumeAccountSetup(f.b.db, s.user.id, s.user.authId)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(s.provider.writes).toHaveLength(1);
    expect(await f.c.sql`select id,version,expected_role,purpose,confirmed_at from role_provider_writes where user_id=${s.user.id} order by version`).toEqual(issued);
    s.provider.settleRemote();
    await expect(resumeAccountSetup(f.a.db, s.user.id, s.user.authId)).resolves.toEqual({ complete: true, role: "seller" });
    await expect(resumeAccountSetup(f.b.db, s.user.id, s.user.authId)).resolves.toEqual({ complete: true, role: "seller" });
    expect(s.provider.writes).toHaveLength(1); expect(s.provider.current()).toMatchObject({ role: "seller", plankmarket_seller_activation: null, plankmarket_role_write: issued[0].id });
    const settled = await f.c.sql`select id,version,confirmed_at from role_provider_writes where user_id=${s.user.id} order by version`;
    expect(settled).toHaveLength(1); expect(settled[0].id).toBe(issued[0].id); expect(settled[0].version).toBe(1); expect(settled[0].confirmed_at).not.toBeNull();
    expect(await f.user(s.user.id)).toEqual(beforeUser); preserved(s.provider);
    f.note("resume-service-unknown-write", { userId: s.user.id, issued, settled, writes: s.provider.writes, secondPutPrevented: true, actualRouterCovered: false });
  });

  it.skipIf(mode !== "fixed").each(["activation", "write"] as const)("resume rejects matching buyer role with a foreign %s marker and no receipt", async kind => {
    const { resumeAccountSetup } = await import("@/server/services/resume-account-setup");
    const s = await unverified(), foreign = randomUUID();
    const p = provider(s.user.authId, { initialRole: "buyer", ...(kind === "activation" ? { initialActivationMarker: foreign } : { initialWriteMarker: foreign }) });
    const beforeUser = await f.user(s.user.id), beforeProvider = p.current();
    await expect(resumeAccountSetup(f.a.db, s.user.id, s.user.authId)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(p.writes).toHaveLength(0); expect(p.current()).toEqual(beforeProvider);
    expect(await f.c.sql`select id from role_provider_writes where user_id=${s.user.id}`).toHaveLength(0);
    expect(await f.user(s.user.id)).toEqual(beforeUser);
    f.note("resume-service-foreign-marker", { kind, userId: s.user.id, writes: 0, receipts: 0, actualRouterCovered: false });
  });

  it.skipIf(mode !== "fixed")("resume rejects a confirmed matching-role receipt from a non-registration operation", async () => {
    const { resumeAccountSetup } = await import("@/server/services/resume-account-setup");
    const { openRoleProviderWriteSession } = await import("@/server/services/role-provider-write-session");
    const s = await unverified();
    await f.coordinate(s.user.id, async () => {
      const session = await openRoleProviderWriteSession(f.a.db, s.user.id, s.provider);
      await session.ensure({ role: "buyer", plankmarket_seller_activation: null }, "admin_role", f.admin.id);
    });
    const before = await f.c.sql`select id,version,purpose,confirmed_at from role_provider_writes where user_id=${s.user.id}`;
    expect(before).toHaveLength(1); expect(before[0].purpose).toBe("admin_role"); expect(before[0].confirmed_at).not.toBeNull();
    await expect(resumeAccountSetup(f.b.db, s.user.id, s.user.authId)).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(s.provider.writes).toHaveLength(1);
    expect(await f.c.sql`select id,version,purpose,confirmed_at from role_provider_writes where user_id=${s.user.id}`).toEqual(before);
    expect(s.provider.current()).toMatchObject({ role: "buyer", plankmarket_role_write: before[0].id });
    f.note("resume-service-foreign-purpose", { userId: s.user.id, receipt: before, newWrites: 0, actualRouterCovered: false });
  });

  it("beforePatch invalidation cannot let cleanup cancel ahead of an issued write", async () => {
    const s = await approved(), gate = barrier();
    s.provider.beforePatch = async () => { s.provider.beforePatch = undefined; gate.enter(); await gate.released; };
    const first = outcome(reconcile(s));
    try {
      await within(gate.entered); await invalidate(s);
      const calls = s.provider.calls.length;
      const second = await within(outcome(reconcile(s, f.b.db)));
      if (mode === "fixed") {
        expect(second.ok).toBe(false); expect(s.provider.calls.length).toBe(calls);
        expect((await f.application(s.application.id))?.syncState).not.toBe("cancelled"); await replacementRefused(s);
      } else expect(await f.application(s.application.id)).toMatchObject({ syncState: "cancelled" });
      gate.release(); await within(first);
      expect((await f.user(s.user.id))?.role).toBe("buyer");
      if (mode === "fixed") {
        await reconcile(s, f.b.db); expect(s.provider.current()).toMatchObject({ role: "buyer", plankmarket_seller_activation: null });
        expect(await f.application(s.application.id)).toMatchObject({ syncState: "cancelled" });
      } else expect(s.provider.current()).toMatchObject({ role: "seller", plankmarket_seller_activation: s.application.activationOperationId });
      preserved(s.provider); f.note("beforePatch-invalidation", { mode, userId: s.user.id, application: await f.application(s.application.id), provider: s.provider.current(), calls: s.provider.calls });
    } finally { gate.release(); await first; }
  }, 20000);

  it("activation-first rejects overlapping actual admin role work and later demotes from a fresh read", async () => {
    const s = await approved(), gate = barrier();
    s.provider.beforePatch = async () => { s.provider.beforePatch = undefined; gate.enter(); await gate.released; };
    const activation = outcome(reconcile(s));
    try {
      await within(gate.entered);
      const writes = s.provider.writes.length;
      const overlapping = await within(outcome(admin().admin.updateUser({ userId: s.user.id, role: "buyer" })));
      expect(overlapping.ok).toBe(mode === "baseline"); expect(s.provider.writes.length).toBe(writes);
      gate.release(); expect((await within(activation)).ok).toBe(true);
      expect((await f.user(s.user.id))?.role).toBe("seller");
      await admin().admin.updateUser({ userId: s.user.id, role: "buyer" });
      expect((await f.user(s.user.id))?.role).toBe("buyer"); expect(s.provider.current().role).toBe("buyer");
      expect(s.provider.writes.length).toBe(writes + 1);
      await reconcile(s); expect((await f.user(s.user.id))?.role).toBe("buyer"); expect(s.provider.writes.length).toBe(writes + 1);
      preserved(s.provider); f.note("activation-first-admin", { mode, writes: s.provider.writes, application: await f.application(s.application.id) });
    } finally { gate.release(); await activation; }
  }, 20000);

  it("actual admin same-role input cannot cache buyer and overwrite completed activation", async () => {
    const s = await approved(), gate = barrier();
    const adminCall = outcome(admin(pauseBuyerUpdate(f.b.db, gate)).admin.updateUser({ userId: s.user.id, role: "buyer" }));
    try {
      await within(gate.entered);
      const first = await within(outcome(reconcile(s)));
      if (mode === "fixed") { expect(first.ok).toBe(false); expect((await f.user(s.user.id))?.role).toBe("buyer"); }
      else { expect(first.ok).toBe(true); expect((await f.user(s.user.id))?.role).toBe("seller"); }
      gate.release(); expect((await within(adminCall)).ok).toBe(true);
      if (mode === "fixed") {
        await reconcile(s); expect((await f.user(s.user.id))?.role).toBe("seller");
        await admin().admin.updateUser({ userId: s.user.id, role: "buyer" });
        expect(s.provider.current()).toMatchObject({ role: "buyer", plankmarket_seller_activation: null });
      } else expect(s.provider.current()).toMatchObject({ role: "seller" });
      expect((await f.user(s.user.id))?.role).toBe("buyer");
      const writes = s.provider.writes.length; await reconcile(s);
      expect((await f.user(s.user.id))?.role).toBe("buyer"); expect(s.provider.writes.length).toBe(writes);
      preserved(s.provider); f.note("actual-admin-same-role", { mode, userId: s.user.id, databaseRole: (await f.user(s.user.id))?.role, metadata: s.provider.current(), writes: s.provider.writes });
    } finally { gate.release(); await adminCall; }
  }, 20000);

  it("local timeout and elapsed claim cannot settle an unknown remote PUT", async () => {
    const s = await approved(); let originalDeadline: Date | null = null;
    s.provider.beforePatch = async () => { originalDeadline = (await f.application(s.application.id))!.claimExpiresAt; s.provider.beforePatch = undefined; };
    s.provider.deferRemoteOnce = true;
    await outcome(reconcile(s)); assert(originalDeadline); expect(s.provider.pending).not.toBeNull();
    await invalidate(s);
    // Real clock passage, never rewrite immutable claim deadlines or bypass a
    // canonical guard. The local timeout has already returned/released the lane.
    const waitMs = Math.max(0, (originalDeadline as Date).getTime() - Date.now() + 50);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    const [clock] = await f.c.sql`select clock_timestamp() now`;
    expect(new Date(clock.now).getTime()).toBeGreaterThan((originalDeadline as Date).getTime());
    const writes = s.provider.writes.length;
    await outcome(reconcile(s, f.b.db));
    if (mode === "fixed") {
      expect((await f.application(s.application.id))?.syncState).not.toBe("cancelled");
      for (const role of ["buyer", "admin", "seller"] as const) expect((await outcome(admin().admin.updateUser({ userId: s.user.id, role }))).ok).toBe(false);
      expect(s.provider.writes.length).toBe(writes); await replacementRefused(s);
      const pending = await f.c.sql`select id,confirmed_at from role_provider_writes where user_id=${s.user.id} order by version`;
      expect(pending).toHaveLength(1); expect(pending[0].confirmed_at).toBeNull();
    } else expect(await f.application(s.application.id)).toMatchObject({ syncState: "cancelled" });
    expect(s.provider.current().role).toBe("buyer");
    s.provider.settleRemote(); await outcome(reconcile(s, f.b.db));
    if (mode === "fixed") {
      expect(s.provider.current()).toMatchObject({ role: "buyer", plankmarket_seller_activation: null });
      expect(s.provider.writes.length).toBe(writes + 1);
      const settled = await f.c.sql`select id,confirmed_at from role_provider_writes where user_id=${s.user.id} order by version`;
      expect(settled).toHaveLength(2); expect(settled.every(r => r.confirmed_at !== null)).toBe(true);
      expect(s.provider.writes[0].plankmarket_role_write).not.toBe(s.provider.writes[1].plankmarket_role_write);
    } else expect(s.provider.current().role).toBe("seller");
    expect((await f.user(s.user.id))?.role).toBe("buyer"); preserved(s.provider);
    f.note("unknown-remote-after-expiry", { mode, originalDeadline, observedDatabaseTime: clock.now, application: await f.application(s.application.id), metadata: s.provider.current(), writes: s.provider.writes });
  }, 90000);
});
