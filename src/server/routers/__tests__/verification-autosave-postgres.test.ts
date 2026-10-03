// Candidate target: src/server/routers/__tests__/verification-autosave-postgres.test.ts
// @vitest-environment node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db";
import type { createTRPCContext } from "@/server/trpc";

const bridge = vi.hoisted(() => ({
  executor: null as unknown,
  depth: 0,
  forbidGlobalDuringTransaction: false,
  limits: [] as Array<{ prefix: string; identifier: string; count: number; window: string }>,
  limitMode: "allow" as "allow" | "deny" | "outage" | "budget",
  counters: new Map<string, number>(),
  queue: null as null | ((event: unknown) => Promise<unknown>),
  events: [] as unknown[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://verification-proof.example.invalid" } }));
vi.mock("@/server/db", () => ({ db: new Proxy({}, { get(_target, key) {
  assert(bridge.executor, "Unadmitted database access");
  if (key === "query" && bridge.forbidGlobalDuringTransaction && bridge.depth > 0) throw new Error("Global database read inside an active product transaction");
  const target = bridge.executor as Record<PropertyKey, unknown>;
  const value = Reflect.get(target, key);
  return typeof value === "function" ? value.bind(target) : value;
} }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => { throw new Error("Real Supabase forbidden in local router proof"); },
  createServiceClient: () => { throw new Error("Real Supabase service forbidden in local router proof"); },
}));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}) }));
vi.mock("@/server/services/content-moderation", () => ({ checkViolationStatus: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendWelcomeEmail: () => { throw new Error("Email forbidden"); } }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { async send(event: unknown) {
  bridge.events.push(event);
  if (bridge.queue) return bridge.queue(event);
  return { ids: ["local-accepted-event"] };
} } }));
vi.mock("@upstash/ratelimit", () => ({ Ratelimit: class {
  static slidingWindow(count: number, window: string) { return { count, window }; }
  constructor(private options: { prefix: string; limiter: { count: number; window: string } }) {}
  async limit(identifier: string) {
    const entry = { prefix: this.options.prefix, identifier, ...this.options.limiter };
    bridge.limits.push(entry);
    if (bridge.limitMode === "outage") throw new Error("Synthetic limiter outage");
    if (bridge.limitMode === "deny") return { success: false };
    const key = `${entry.prefix}:${identifier}`, count = (bridge.counters.get(key) ?? 0) + 1;
    bridge.counters.set(key, count);
    return { success: bridge.limitMode !== "budget" || count <= entry.count };
  }
} }));

const { createCallerFactory, createTRPCRouter, strictProtectedProcedure } = await import("@/server/trpc");
const { authRouter } = await import("@/server/routers/auth");
const createCaller = createCallerFactory(createTRPCRouter({ auth: authRouter,
  // Probes the unchanged strict allowance without invoking storage providers.
  strictProbe: strictProtectedProcedure.mutation(() => ({ admitted: true })),
}));
const TARGET = "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
const SOURCE = ["src/server/routers/auth.ts", "src/server/trpc.ts", "src/lib/validators/auth.ts", "src/server/services/verification-draft.ts", "src/server/services/verification-documents.ts", "drizzle/0045_private_verification_deletion_intent.sql", "drizzle/0046_private_verification_residue.sql"];
const FIELDS = ["businessWebsite", "einTaxId", "verificationDocUrl", "businessAddress", "businessCity", "businessState", "businessZip"] as const;
const EIN = "12-3456789";
type User = typeof schema.users.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Client = ReturnType<typeof createCaller>;
type DraftInput = Record<string, unknown> & { currentStep: number };
type SubmitInput = { expectedOwnerId: string; expectedUpdatedAt: Date };
type Receipt = { verificationStatus: "pending"; submissionId: string; requestedAt: Date };
const savedHash = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const sourceBinding = () => SOURCE.map(file => ({ path: file, sha256: savedHash(file) }));
function bound(db: Database): Database {
  return new Proxy(db, { get(target, key) {
    const value = Reflect.get(target, key);
    if (key === "transaction") return async (body: (tx: Tx) => Promise<unknown>) => {
      bridge.depth += 1;
      try { return await target.transaction(body); }
      finally { bridge.depth -= 1; }
    };
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
function caller(db: Database, user: User, changes: Partial<User> = {}) {
  return createCaller({ db, authUser: { id: user.authId, email_confirmed_at: "2026-09-01" },
    user: { ...user, ...changes }, supabase: {}, clientIp: "127.0.0.1",
    getAuthAssurance: vi.fn().mockRejectedValue(new Error("Ordinary business verification must not require admin MFA")),
  } as unknown as Awaited<ReturnType<typeof createTRPCContext>>);
}
function save(client: Client, input: DraftInput) {
  // Future required bindings pass through the actual old/new router parsers.
  return client.auth.saveVerificationDraft(input as Parameters<Client["auth"]["saveVerificationDraft"]>[0]);
}
function submit(client: Client, input: unknown) {
  return (client.auth.submitVerificationDraft as unknown as (input: SubmitInput) => Promise<Receipt>)(input as SubmitInput);
}

describe.skipIf(process.env.VERIFICATION_AUTOSAVE_DB_PROOF !== "1")("verification autosave actual-router canonical rollback proof", () => {
  let client: ReturnType<typeof postgres>, db: Database, original: unknown;
  const runId = randomUUID();
  const directory = path.resolve("tmp/journey10/verification-autosave/backend/proof", runId);
  const proof: Record<string, unknown> = { runId, target: TARGET, cases: [],
    boundary: "Canonical PostgreSQL checks/triggers and real router; one forced rollback per case; service-role bypasses RLS; injected Redis/Inngest; sequential stale-version schedules, not independent concurrent sessions" };
  const note = () => fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify(proof, null, 2));
  async function digest() {
    const tables = await client`select c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname`;
    const result: Record<string, unknown> = {};
    for (const row of tables) {
      const [value] = await client`select count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) digest from public.${client(String(row.name))} t`;
      result[String(row.name)] = { count: Number(value.count), digest: String(value.digest) };
    }
    return result;
  }
  beforeAll(async () => {
    assert.equal(process.env.VERIFICATION_AUTOSAVE_DB_PROOF, "1");
    assert.equal(process.env.VERIFICATION_AUTOSAVE_OTHER_FIXTURES_CLEANED, "1", "Root must confirm no other fixture writers");
    const url = new URL(TARGET);
    assert.deepEqual({ hostname: url.hostname, port: url.port, pathname: url.pathname, username: url.username, password: url.password },
      { hostname: "127.0.0.1", port: "55439", pathname: "/plankmarket_bootstrap_design_20260929", username: "postgres", password: "" });
    fs.mkdirSync(directory, { recursive: true });
    proof.sources = sourceBinding(); note();
    client = postgres(TARGET, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {},
      connection: { application_name: `verification-autosave-${runId.slice(0, 8)}`, search_path: "public,pg_catalog", statement_timeout: 10000, lock_timeout: 3000, idle_in_transaction_session_timeout: 15000 } });
    db = drizzle(client, { schema });
    const [identity] = await client`select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,current_setting('session_replication_role') replication,current_setting('row_security') row_security`;
    assert.deepEqual({ name: identity.name, role: identity.role, address: identity.address, port: identity.port },
      { name: "plankmarket_bootstrap_design_20260929", role: "postgres", address: "127.0.0.1", port: 55439 });
    assert.equal(identity.replication, "origin"); assert.equal(identity.row_security, "on");
    const triggers = await client`select tgname,tgenabled from pg_trigger where tgname in ('drafts_private_verification_document','users_private_verification_document','verification_drafts_set_retention_defaults','users_set_verification_retention_defaults') order by tgname`;
    assert.equal(triggers.length, 4); assert(triggers.every(row => row.tgenabled === "O" || row.tgenabled === "A"));
    proof.admission = { ...identity, triggers }; original = await digest(); proof.before = original; note();
  }, 20000);
  afterAll(async () => {
    try {
      if (original) { proof.after = await digest(); expect(proof.after).toEqual(original); proof.publicDataUnchanged = true; }
      if (proof.sources) { proof.sourceReadback = sourceBinding(); expect(proof.sourceReadback).toEqual(proof.sources); }
      note();
    } finally { if (client) await client.end({ timeout: 2 }); }
  }, 20000);
  beforeEach(() => {
    bridge.events = []; bridge.limits = []; bridge.limitMode = "allow"; bridge.counters.clear(); bridge.queue = null; bridge.depth = 0; bridge.forbidGlobalDuringTransaction = false;
  });
  async function rollback(label: string, body: (tx: Tx, executor: Database) => Promise<void>) {
    const sentinel = new Error("FORCED_VERIFICATION_PROOF_ROLLBACK");
    let failed: unknown, passed = false, rolledBack = false;
    try {
      await db.transaction(async tx => {
        const executor = bound(tx as unknown as Database); bridge.executor = executor;
        try { await body(tx, executor); passed = true; }
        catch (error) { failed = error; }
        finally { throw sentinel; }
      });
    } catch (error) { if (error !== sentinel) failed ??= error; else rolledBack = true; }
    finally { bridge.executor = null; vi.restoreAllMocks(); }
    (proof.cases as unknown[]).push({ label, passed: passed && !failed, rolledBack,
      errorName: failed instanceof Error ? failed.name : failed ? "unknown" : null }); note();
    expect(rolledBack).toBe(true);
    if (failed) throw failed;
  }
  async function seed(tx: Tx, role: "buyer" | "seller" = "buyer", status = "unverified") {
    const id = randomUUID();
    await tx.insert(schema.users).values({ id, authId: randomUUID(), email: `autosave-${id}@example.invalid`, name: "Synthetic verification owner", role,
      active: true, verificationStatus: status, verified: status === "verified", businessWebsite: "https://existing.example.invalid", einTaxId: EIN,
      businessAddress: "123 Existing Way", businessCity: "Denver", businessState: "CO", businessZip: "80202" }).returning();
    const documentId = randomUUID();
    await tx.insert(schema.verificationDocuments).values({ id: documentId, userId: id, objectPath: `${id}/ready/${documentId}`, fileName: "synthetic-license.pdf", purpose: "business_verification", mimeType: "application/pdf", fileSize: 120, readyAt: new Date() });
    const verificationDocUrl = `verification-document:${documentId}`;
    const [complete] = await tx.update(schema.users).set({ verificationDocUrl }).where(eq(schema.users.id, id)).returning();
    return { user: complete, documentId, values: { currentStep: 3, expectedOwnerId: id, expectedUpdatedAt: null, businessWebsite: "example.invalid", einTaxId: EIN,
      verificationDocUrl, businessAddress: "456 New Way", businessCity: "Denver", businessState: "co", businessZip: "80202" } };
  }
  const row = (tx: Tx, id: string) => tx.query.verificationDrafts.findFirst({ where: eq(schema.verificationDrafts.userId, id) });
  const userRow = (tx: Tx, id: string) => tx.query.users.findFirst({ where: eq(schema.users.id, id) });

  it.each(["buyer", "seller"] as const)("seeds an absent %s draft without writing and labels its owner", async role => rollback(`seed-${role}`, async (tx, executor) => {
    const f = await seed(tx, role), result = await caller(executor, f.user).auth.getVerificationDraft();
    expect(result).toMatchObject({ ownerId: f.user.id, updatedAt: null, einTaxId: EIN, verificationDocUrl: f.values.verificationDocUrl });
    expect(await row(tx, f.user.id)).toBeUndefined();
  }));
  it.each(FIELDS)("keeps explicit %s clear empty after real save/read despite profile fallback", async field => rollback(`clear-${field}`, async (tx, executor) => {
    const f = await seed(tx), c = caller(executor, f.user);
    const receipt = await save(c, { ...f.values, [field]: "" });
    expect((await row(tx, f.user.id))?.[field]).toBeNull();
    expect((await c.auth.getVerificationDraft())[field]).toBe("");
    expect(receipt).toMatchObject({ ownerId: f.user.id });
  }));
  it("saves incomplete input, normalizes state, and preserves omitted fields", async () => rollback("incomplete-patch", async (tx, executor) => {
    const f = await seed(tx, "seller"), c = caller(executor, f.user);
    const first = await save(c, { ...f.values, einTaxId: "12-", businessWebsite: "" });
    const next = await save(c, { currentStep: 2, expectedOwnerId: f.user.id, expectedUpdatedAt: first.updatedAt, businessCity: " Boulder " });
    expect(await row(tx, f.user.id)).toMatchObject({ einTaxId: "12-", businessWebsite: null, businessState: "CO", businessCity: "Boulder" });
    await expect(submit(c, { expectedOwnerId: f.user.id, expectedUpdatedAt: next.updatedAt })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(bridge.events).toHaveLength(0);
  }));
  it.each(["missing-owner", "other-owner", "missing-version"])("rejects save %s before writing", async mode => rollback(mode, async (tx, executor) => {
    const f = await seed(tx), input: DraftInput = { ...f.values };
    if (mode === "missing-owner") delete input.expectedOwnerId;
    if (mode === "other-owner") input.expectedOwnerId = randomUUID();
    if (mode === "missing-version") delete input.expectedUpdatedAt;
    await expect(save(caller(executor, f.user), input)).rejects.toMatchObject({ code: mode === "other-owner" ? "FORBIDDEN" : "BAD_REQUEST" });
    expect(await row(tx, f.user.id)).toBeUndefined(); expect(bridge.events).toHaveLength(0);
  }));
  it("strictly advances frozen-clock versions and denies stale/null retries", async () => rollback("monotonic-cas", async (tx, executor) => {
    const f = await seed(tx), c = caller(executor, f.user), future = new Date("2030-01-01T12:00:00Z");
    await tx.insert(schema.verificationDrafts).values({ userId: f.user.id, currentStep: 3, businessCity: "Before", updatedAt: future });
    vi.spyOn(Date, "now").mockReturnValue(future.getTime());
    const a = await save(c, { currentStep: 3, expectedOwnerId: f.user.id, expectedUpdatedAt: future, businessCity: "First" });
    const b = await save(c, { currentStep: 3, expectedOwnerId: f.user.id, expectedUpdatedAt: a.updatedAt, businessCity: "Second" });
    expect(a.updatedAt.getTime()).toBeGreaterThan(future.getTime()); expect(b.updatedAt.getTime()).toBeGreaterThan(a.updatedAt.getTime());
    for (const version of [future, a.updatedAt, null]) await expect(save(c, { currentStep: 3, expectedOwnerId: f.user.id, expectedUpdatedAt: version, businessCity: "Stale" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await row(tx, f.user.id))?.businessCity).toBe("Second");
  }));
  it.each(["missing-owner", "other-owner", "missing-version", "null-version"])("rejects submit %s without queueing", async mode => rollback(`submit-${mode}`, async (tx, executor) => {
    const f = await seed(tx), c = caller(executor, f.user), saved = await save(c, f.values);
    const input: Record<string, unknown> = { expectedOwnerId: f.user.id, expectedUpdatedAt: saved.updatedAt };
    if (mode === "missing-owner") delete input.expectedOwnerId;
    if (mode === "other-owner") input.expectedOwnerId = randomUUID();
    if (mode === "missing-version") delete input.expectedUpdatedAt;
    if (mode === "null-version") input.expectedUpdatedAt = null;
    await expect(submit(c, input)).rejects.toMatchObject({ code: mode === "other-owner" ? "FORBIDDEN" : "BAD_REQUEST" });
    expect((await userRow(tx, f.user.id))?.verificationStatus).toBe("unverified"); expect(bridge.events).toHaveLength(0);
  }));
  it("rejects a previously reviewed version after another tab saved", async () => rollback("reviewed-snapshot", async (tx, executor) => {
    const f = await seed(tx), c = caller(executor, f.user), a = await save(c, f.values);
    const b = await save(c, { ...f.values, expectedUpdatedAt: a.updatedAt, businessCity: "Boulder" });
    await expect(submit(c, { expectedOwnerId: f.user.id, expectedUpdatedAt: a.updatedAt })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await userRow(tx, f.user.id))?.businessCity).toBe("Denver"); expect((await row(tx, f.user.id))?.updatedAt).toEqual(b.updatedAt); expect(bridge.events).toHaveLength(0);
  }));
  it.each(["pending", "verified"])("rejects stale-context submit when persisted status is %s", async status => rollback(`fresh-status-${status}`, async (tx, executor) => {
    const f = await seed(tx), c = caller(executor, f.user), saved = await save(c, f.values), submissionId = randomUUID();
    await tx.update(schema.users).set({ verificationStatus: status, verified: status === "verified", verificationSubmissionId: submissionId }).where(eq(schema.users.id, f.user.id));
    await expect(submit(c, { expectedOwnerId: f.user.id, expectedUpdatedAt: saved.updatedAt })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await userRow(tx, f.user.id))?.verificationSubmissionId).toBe(submissionId); expect(bridge.events).toHaveLength(0);
  }));
  it("rechecks the persisted seller website requirement instead of trusting stale buyer context", async () => rollback("fresh-role", async (tx, executor) => {
    const f = await seed(tx), c = caller(executor, f.user), saved = await save(c, { ...f.values, businessWebsite: "" });
    await tx.update(schema.users).set({ role: "seller" }).where(eq(schema.users.id, f.user.id));
    await expect(submit(c, { expectedOwnerId: f.user.id, expectedUpdatedAt: saved.updatedAt })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(bridge.events).toHaveLength(0);
  }));
  it.each(["save", "submit"])("denies a freshly suspended owner on %s", async operation => rollback(`suspended-${operation}`, async (tx, executor) => {
    const f = await seed(tx), c = caller(executor, f.user), saved = await save(c, f.values);
    await tx.update(schema.users).set({ active: false }).where(eq(schema.users.id, f.user.id));
    await expect(operation === "save" ? save(c, { ...f.values, expectedUpdatedAt: saved.updatedAt }) : submit(c, { expectedOwnerId: f.user.id, expectedUpdatedAt: saved.updatedAt })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await row(tx, f.user.id))?.updatedAt).toEqual(saved.updatedAt); expect(bridge.events).toHaveLength(0);
  }));
  it("keeps private metadata reads on the transaction executor rather than the max-one pool", async () => rollback("transaction-document-read", async (tx, executor) => {
    const f = await seed(tx), c = caller(executor, f.user);
    bridge.forbidGlobalDuringTransaction = true;
    const saved = await save(c, f.values);
    await expect(submit(c, { expectedOwnerId: f.user.id, expectedUpdatedAt: saved.updatedAt })).resolves.toMatchObject({ verificationStatus: "pending" });
    expect(bridge.events).toHaveLength(1);
  }));
  it.each(["foreign", "unready"])("denies %s private evidence through the real metadata service", async mode => rollback(`document-${mode}`, async (tx, executor) => {
    const f = await seed(tx), other = await seed(tx), c = caller(executor, f.user);
    const unreadyId = randomUUID();
    if (mode === "unready") await tx.insert(schema.verificationDocuments).values({ id: unreadyId, userId: f.user.id, objectPath: `${f.user.id}/incoming/${unreadyId}`, fileName: "pending.pdf", purpose: "business_verification", mimeType: "application/pdf", fileSize: 120 });
    await expect(save(c, { ...f.values, verificationDocUrl: mode === "foreign" ? other.values.verificationDocUrl : `verification-document:${unreadyId}` })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await row(tx, f.user.id)).toBeUndefined(); expect(bridge.events).toHaveLength(0);
  }));
  it.each(["buyer", "seller"] as const)("submits the exact persisted %s snapshot and queues outside the transition", async role => rollback(`submit-success-${role}`, async (tx, executor) => {
    const f = await seed(tx, role), c = caller(executor, f.user), saved = await save(c, { ...f.values, businessWebsite: role === "buyer" ? "" : "example.invalid" });
    bridge.queue = async event => {
      expect(bridge.depth).toBe(0);
      const current = await userRow(tx, f.user.id);
      expect(current).toMatchObject({ verificationStatus: "pending", verified: false, businessAddress: "456 New Way", businessState: "CO", businessWebsite: role === "buyer" ? null : "https://example.invalid" });
      expect(event).toEqual({ id: `verification-submitted:${current!.verificationSubmissionId}`, name: "verification/submitted", data: { userId: f.user.id, submissionId: current!.verificationSubmissionId } });
      return { ids: ["local-accepted-event"] };
    };
    const result = await submit(c, { expectedOwnerId: f.user.id, expectedUpdatedAt: saved.updatedAt });
    expect(result.verificationStatus).toBe("pending"); expect(await row(tx, f.user.id)).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(EIN); expect(JSON.stringify(bridge.events)).not.toContain(EIN);
  }));
  it("retains a newer draft when exact submitted version cleanup runs", async () => rollback("exact-cleanup", async (tx, executor) => {
    const f = await seed(tx), c = caller(executor, f.user), saved = await save(c, f.values), newer = new Date(saved.updatedAt.getTime() + 10);
    bridge.queue = async () => { await tx.update(schema.verificationDrafts).set({ updatedAt: newer, businessCity: "Later retained draft" }).where(eq(schema.verificationDrafts.userId, f.user.id)); return { ids: ["local-accepted-event"] }; };
    await submit(c, { expectedOwnerId: f.user.id, expectedUpdatedAt: saved.updatedAt });
    expect(await row(tx, f.user.id)).toMatchObject({ updatedAt: newer, businessCity: "Later retained draft" });
  }));
  it("compensates its own uncertain queue failure while retaining a resumable draft", async () => rollback("queue-failure", async (tx, executor) => {
    const f = await seed(tx, "buyer", "rejected"), c = caller(executor, f.user), saved = await save(c, f.values);
    bridge.queue = async () => { expect(bridge.depth).toBe(0); throw new Error("Synthetic provider response loss"); };
    await expect(submit(c, { expectedOwnerId: f.user.id, expectedUpdatedAt: saved.updatedAt })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(await userRow(tx, f.user.id)).toMatchObject({ verificationStatus: "rejected", verified: false, verificationSubmissionId: null });
    expect((await row(tx, f.user.id))?.updatedAt).toEqual(saved.updatedAt);
  }));
  it("never compensates a superseding accepted/reviewed state", async () => rollback("compensation-scope", async (tx, executor) => {
    const f = await seed(tx), c = caller(executor, f.user), saved = await save(c, f.values), laterId = randomUUID();
    bridge.queue = async () => { await tx.update(schema.users).set({ verificationStatus: "verified", verified: true, verificationSubmissionId: laterId }).where(eq(schema.users.id, f.user.id)); throw new Error("Synthetic late response loss"); };
    await expect(submit(c, { expectedOwnerId: f.user.id, expectedUpdatedAt: saved.updatedAt })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(await userRow(tx, f.user.id)).toMatchObject({ verificationStatus: "verified", verificationSubmissionId: laterId });
  }));
  it.each(["submitVerification", "resubmitVerification"] as const)("preserves direct %s caller and post-transaction queue", async method => rollback(`direct-${method}`, async (tx, executor) => {
    const f = await seed(tx, "seller", method === "resubmitVerification" ? "rejected" : "unverified"), c = caller(executor, f.user);
    bridge.queue = async () => { expect(bridge.depth).toBe(0); return { ids: ["local-accepted-event"] }; };
    const result = await c.auth[method]({ ...f.values, businessState: "CO" });
    expect(result.verificationStatus).toBe("pending"); expect(bridge.events).toHaveLength(1);
  }));
  it("lets normal draft saves retain all strict submit/upload budget", async () => rollback("separate-budget", async (tx, executor) => {
    const f = await seed(tx), c = caller(executor, f.user); bridge.limitMode = "budget";
    let version: Date | null = null;
    for (let i = 0; i < 11; i++) version = (await save(c, { ...f.values, expectedUpdatedAt: version, businessCity: `City ${i}` })).updatedAt;
    for (let i = 0; i < 10; i++) expect(await c.strictProbe()).toEqual({ admitted: true });
    await expect(c.strictProbe()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const draftLimits = bridge.limits.slice(0, 11), strictLimits = bridge.limits.slice(11);
    expect(draftLimits.every(value => value.count === 60 && value.window === "60 s" && value.identifier.includes(f.user.id) && value.identifier.includes("auth.saveVerificationDraft"))).toBe(true);
    expect(strictLimits.every(value => value.count === 10 && value.prefix !== draftLimits[0].prefix)).toBe(true);
  }));
  it.each(["deny", "outage"] as const)("fails draft saving closed during limiter %s", async mode => rollback(`limiter-${mode}`, async (tx, executor) => {
    const f = await seed(tx), c = caller(executor, f.user); bridge.limitMode = mode;
    await expect(save(c, f.values)).rejects.toMatchObject({ code: mode === "deny" ? "TOO_MANY_REQUESTS" : "SERVICE_UNAVAILABLE" });
    expect(await row(tx, f.user.id)).toBeUndefined(); expect(bridge.events).toHaveLength(0);
  }));
});
