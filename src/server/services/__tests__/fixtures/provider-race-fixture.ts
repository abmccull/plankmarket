// Candidate target: src/server/services/__tests__/fixtures/provider-race-fixture.ts
// Preparation only. Never run without the explicit disposable-local proof opt-in.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import * as schema from "@/server/db/schema";

const TARGET = "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
const BASE = ["users", "verification_documents", "seller_activation_requests", "audit_events", "notifications"];
const GUARDS = [
  ["users", "users_seller_activation_invalidation", "invalidate_seller_activation_on_user_change"],
  ["verification_documents", "verification_documents_activation_guard", "protect_activation_document_reference"],
  ["seller_activation_requests", "seller_activation_request_guard", "protect_seller_activation_request"],
] as const;
type Sql = ReturnType<typeof postgres>;
export async function createProviderRaceFixture(mode: "baseline" | "fixed") {
  assert.equal(process.env.ROLE_PROVIDER_DB_PROOF, "1");
  const runId = randomUUID(), ns = "role_race_" + runId.replaceAll("-", ""), owner = `role-provider-race:${runId}`;
  const dir = path.resolve("tmp/journey10/dual-capability/buyer-activation/backend-remediation/provider/tests/proof", runId);
  fs.mkdirSync(dir, { recursive: true });
  const tables = [...BASE, ...(mode === "fixed" ? ["role_provider_writes"] : [])];
  const guards: readonly (readonly string[])[] = [...GUARDS, ...(mode === "fixed" ? [["role_provider_writes", "role_provider_write_guard", "guard_role_provider_write"]] : [])];
  const clients: Sql[] = [], events: unknown[] = [], created: string[] = [], functions: string[] = [];
  const sources = ["src/server/services/seller-activation.ts", "src/server/services/seller-activation-provider.ts", "src/server/routers/admin.ts", "src/server/services/__tests__/provider-role-races.test.ts", "src/server/services/__tests__/fixtures/provider-race-fixture.ts", ...fs.readdirSync("drizzle").filter(x => /^004[234].*\.sql$/.test(x)).map(x => "drizzle/" + x), ...(mode === "fixed" ? ["src/server/services/role-provider-coordinator.ts", "src/server/services/role-provider-write-session.ts", "src/server/db/schema/role-provider-writes.ts"] : [])];
  if (mode === "fixed") sources.push("src/server/services/resume-account-setup.ts");
  const sourceHashes = sources.map(file => ({ file, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") }));
  function note(kind: string, detail: unknown) {
    events.push({ at: new Date().toISOString(), kind, detail });
    fs.writeFileSync(path.join(dir, "evidence.json"), JSON.stringify({ runId, mode, target: TARGET, namespace: ns, owner, sourceHashes, events }, null, 2));
  }
  function connect(label: string, isolated = true) {
    const client = postgres(TARGET, { max: 1, prepare: false, connect_timeout: 3, onnotice() {}, connection: {
      application_name: `${ns}-${label}`, search_path: isolated ? `${ns},pg_catalog` : "pg_catalog",
      statement_timeout: 5000, lock_timeout: 4000, idle_in_transaction_session_timeout: 15000,
    } }); clients.push(client); return client;
  }
  const catalog = connect("catalog", false);
  async function admit(client: Sql) {
    const [r] = await client`select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,pg_backend_pid() pid`;
    assert.deepEqual({ name: r.name, role: r.role, address: r.address, port: r.port }, { name: "plankmarket_bootstrap_design_20260929", role: "postgres", address: "127.0.0.1", port: 55439 });
    return Number(r.pid);
  }
  let publicNames: string[] = [], before: unknown, schemaCreated = false;
  async function digestPublic() {
    const result: Record<string, unknown> = {};
    const current = await catalog`select tablename name from pg_tables where schemaname='public' order by tablename`;
    assert.deepEqual(current.map(r => String(r.name)), publicNames, "Original public table set changed");
    for (const name of publicNames) {
      assert(/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name));
      const [r] = await catalog.unsafe(`select count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by md5(to_jsonb(r)::text)),'')) digest from public."${name}" r`);
      result[name] = r;
    }
    return result;
  }
  async function cleanup() {
    try {
      for (const c of clients.filter(c => c !== catalog)) await c.end({ timeout: 2 });
      if (schemaCreated) {
        const [r] = await catalog`select pg_get_userbyid(nspowner) role,obj_description(oid,'pg_namespace') owner from pg_namespace where nspname=${ns}`;
        assert.equal(r?.role, "postgres"); assert.equal(r.owner, owner);
        const relations = await catalog`select c.relname name,c.relkind kind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=${ns} and c.relkind not in ('i','t') order by c.relname`;
        assert.deepEqual(relations.map(r => [r.name, r.kind]), created.toSorted().map(x => [x, "r"]));
        const installed = await catalog`select p.proname name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=${ns} order by p.proname`;
        assert.deepEqual(installed.map(r => r.name), functions.toSorted());
        const installedTriggers = await catalog`select t.tgname name from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=${ns} and not t.tgisinternal order by t.tgname`;
        assert.deepEqual(installedTriggers.map(r => r.name), guards.filter(g => functions.includes(g[2])).map(g => g[1]).toSorted());
        for (const [table, trigger, fn] of guards) if (functions.includes(fn)) await catalog.unsafe(`drop trigger ${trigger} on ${ns}.${table}`);
        for (const fn of functions) await catalog.unsafe(`drop function ${ns}.${fn}()`);
        for (const table of created.toReversed()) await catalog.unsafe(`drop table ${ns}.${table}`);
        await catalog.unsafe(`drop schema ${ns}`); schemaCreated = false;
        const [gone] = await catalog`select to_regnamespace(${ns}) is null absent`; assert.equal(gone.absent, true);
      }
      if (before) { const after = await digestPublic(); assert.deepEqual(after, before); note("cleanup", { schemaAbsent: true, originalPublicDigestsUnchanged: true, before, after }); }
    } catch (error) { note("cleanup-failed", { message: String(error), namespaceRetained: schemaCreated }); throw error; }
    finally { await catalog.end({ timeout: 2 }); }
  }
  try {
    await admit(catalog);
    publicNames = (await catalog`select tablename name from pg_tables where schemaname='public' order by tablename`).map(r => String(r.name));
    for (const table of tables) assert(publicNames.includes(table), `Apply canonical local migration before ${mode} proof: ${table}`);
    before = await digestPublic(); note("admission", { originalPublicDigests: before });
    await catalog.unsafe(`create schema ${ns}`); schemaCreated = true;
    await catalog.unsafe(`comment on schema ${ns} is '${owner}'`);
    for (const table of tables) { await catalog.unsafe(`create table ${ns}.${table} (like public.${table} including all)`); created.push(table); }
    for (const [table, trigger, fn] of guards) {
      const [definition] = await catalog`select pg_get_functiondef(p.oid) body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=${fn} and p.pronargs=0`;
      assert(definition, `Canonical guard missing: ${fn}`);
      const [td] = await catalog`select pg_get_triggerdef(t.oid,true) body from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=${table} and t.tgname=${trigger}`;
      assert(td, `Canonical trigger missing: ${trigger}`);
      const rebind = (s: string) => s.replace(/\bpublic\./g, `${ns}.`).replace(/\b'public'\b/g, `'${ns}'`).replace(/'public'/g, `'${ns}'`);
      const rebound = rebind(String(definition.body));
      assert(!/\bpublic\./.test(rebound));
      await catalog.unsafe(rebound); functions.push(fn);
      await catalog.unsafe(rebind(String(td.body)));
      note("canonical-guard", { table, trigger, fn, original: String(definition.body), rebound, triggerDefinition: rebind(String(td.body)) });
    }
    async function worker(label: string) {
      const sql = connect(label), pid = await admit(sql), db = drizzle(sql, { schema });
      for (const table of tables) { const [r] = await sql`select to_regclass(${table})::oid actual,to_regclass(${ns + "." + table})::oid expected`; assert.equal(r.actual, r.expected); }
      note("worker", { label, pid }); return { sql, db, pid };
    }
    const a = await worker("a"), b = await worker("b"), c = await worker("c");
    // Each instance owns an independent dedicated max=1 connection, representing
    // independent app processes. Main state pools remain independent max=1.
    let lane = 0;
    async function coordinate<T>(userId: string, work: () => Promise<T>): Promise<T> {
      const lock = connect(`coordinator-${++lane}`), pid = await admit(lock);
      try { const result = await lock.begin(async tx => {
        const [r] = await tx.unsafe<{ owned: boolean }[]>(
          "select pg_try_advisory_xact_lock(hashtextextended($1,0)) owned", ["plankmarket-role:" + userId],
        );
        note("coordinator", { userId, pid, owned: r.owned });
        if (!r.owned) throw new TRPCError({ code: "CONFLICT", message: "Fixture coordinator busy" });
        return { value: await work() };
      }); return result.value; } finally { await lock.end({ timeout: 2 }); }
    }
    const [admin] = await a.db.insert(schema.users).values({ authId: randomUUID(), email: `reviewer-${runId}@example.invalid`, name: "Fixture reviewer", role: "admin", active: true, verified: true, verificationStatus: "verified" }).returning();
    async function seed() {
      const id = randomUUID();
      const [user] = await a.db.insert(schema.users).values({ id, authId: randomUUID(), email: `owner-${id}@example.invalid`, name: "Fixture owner", role: "buyer", active: true, verified: true, verificationStatus: "verified", verificationSubmissionId: randomUUID(), verificationDataPurgeAfter: new Date(Date.now() + 86400000 * 15), businessName: "Existing Fixture Flooring", businessAddress: "123 Existing Street", businessCity: "Denver", businessState: "CO", businessZip: "80202" }).returning();
      const documentId = randomUUID();
      const [document] = await a.db.insert(schema.verificationDocuments).values({ id: documentId, userId: id, objectPath: `${id}/ready/${documentId}`, fileName: "license.pdf", purpose: "business_verification", mimeType: "application/pdf", fileSize: 100, readyAt: new Date() }).returning();
      return { user, document, requestId: randomUUID() };
    }
    return { a, b, c, admin, seed, coordinate, note, cleanup, dir,
      user: (id: string) => c.db.query.users.findFirst({ where: eq(schema.users.id, id) }),
      application: (id: string) => c.db.query.sellerActivationRequests.findFirst({ where: eq(schema.sellerActivationRequests.id, id) }),
    };
  } catch (error) { await cleanup(); throw error; }
}
export type ProviderRaceFixture = Awaited<ReturnType<typeof createProviderRaceFixture>>;
