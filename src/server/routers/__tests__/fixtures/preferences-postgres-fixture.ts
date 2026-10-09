// Candidate target: src/server/routers/__tests__/fixtures/preferences-postgres-fixture.ts
// Prepared only. Actual PostgreSQL/Drizzle; no replacement query/transaction builders.
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { userPreferences } from "@/server/db/schema/user-preferences";

export const TARGET = "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
export const lockKey = (userId: string) => `plankmarket:preferences:${userId}`;
type Sql = ReturnType<typeof postgres>;
type Prefs = typeof userPreferences.$inferInsert;
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export function track<T>(promise: Promise<T>) {
  const result = { settled: false, outcome: Promise.resolve(null) as unknown as Promise<{ ok: true; value: T } | { ok: false; error: unknown }> };
  result.outcome = promise.then(value => { result.settled = true; return { ok: true as const, value }; }, error => { result.settled = true; return { ok: false as const, error }; });
  return result;
}
export async function finish<T>(operation: ReturnType<typeof track<T>>) {
  const result = await operation.outcome;
  if (!result.ok) throw result.error;
  return result.value;
}
function database(client: Sql) { return drizzle(client, { schema: { userPreferences } }); }
export type Worker = { sql: Sql; db: ReturnType<typeof database>; pid: number; name: string };

export async function createPreferencesFixture() {
  assert.equal(process.env.PREFERENCES_CONTEXT_DB_PROOF, "1", "Explicit disposable-DB opt-in required");
  const runId = randomUUID();
  const schemaName = "pref_ctx_" + runId.replaceAll("-", "");
  assert(/^pref_ctx_[a-f0-9]{32}$/.test(schemaName));
  const marker = `preferences-context-proof:${runId}`;
  const evidenceDir = path.resolve("tmp/journey10/dual-capability/preferences-db/proof", runId);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const events: Array<{ kind: string; detail: unknown }> = [];
  const sourceFiles = ["src/server/routers/preferences.ts", "src/lib/validators/preferences.ts", "src/lib/preferences-completion.ts", "src/server/db/schema/user-preferences.ts", "src/server/db/custom-types.ts"];
  const evidence = { runId, target: TARGET, schemaName, marker,
    source: sourceFiles.map(file => ({ path: file, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") })), events };
  function note(kind: string, detail: unknown) { events.push({ kind, detail }); fs.writeFileSync(path.join(evidenceDir, "database-proof.json"), JSON.stringify(evidence, null, 2)); }
  const clients: Sql[] = [];
  let schemaCreated = false;
  function connect(name: string, isolated: boolean) {
    const client = postgres(TARGET, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {},
      connection: { application_name: `preferences-proof-${runId.slice(0, 8)}-${name}`, search_path: isolated ? `${schemaName},pg_catalog` : "pg_catalog",
        statement_timeout: 8000, lock_timeout: 6000, idle_in_transaction_session_timeout: 12000 } });
    clients.push(client); return client;
  }
  const admin = connect("catalog", false);
  async function admit(client: Sql) {
    const [identity] = await client`select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,pg_backend_pid() pid`;
    assert.deepEqual({ name: identity.name, role: identity.role, address: identity.address, port: identity.port }, { name: "plankmarket_bootstrap_design_20260929", role: "postgres", address: "127.0.0.1", port: 55439 });
    return identity;
  }
  async function publicDigest() {
    const [snapshot] = await admin`select count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(p)::text),'' order by md5(to_jsonb(p)::text)),'')) digest from public.user_preferences p`;
    return { count: Number(snapshot.count), digest: String(snapshot.digest) };
  }
  let original: Awaited<ReturnType<typeof publicDigest>> | undefined;
  async function cleanup() {
    for (const client of clients.filter(client => client !== admin)) await client.end({ timeout: 2 });
    try {
      if (schemaCreated) {
        const [owned] = await admin`select n.nspname name,pg_get_userbyid(n.nspowner) owner,obj_description(n.oid,'pg_namespace') marker from pg_namespace n where n.nspname=${schemaName}`;
        assert.equal(owned?.name, schemaName); assert.equal(owned.owner, "postgres"); assert.equal(owned.marker, marker);
        const tables = await admin`select c.relname name,c.relkind kind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=${schemaName} and c.relkind not in ('i','t') order by c.relname`;
        assert.deepEqual(tables.map(row => ({ ...row })), [{ name: "user_preferences", kind: "r" }], "Unexpected owned-schema object; retain rather than delete");
        const [triggers] = await admin`select count(*)::int count from pg_trigger where tgrelid=to_regclass(${schemaName + ".user_preferences"}) and not tgisinternal`;
        assert.equal(triggers.count, 0, "Unexpected fixture trigger; retain rather than delete");
        await admin.unsafe(`drop table ${schemaName}.user_preferences`);
        await admin.unsafe(`drop schema ${schemaName}`);
        const [gone] = await admin`select to_regnamespace(${schemaName}) is null absent`;
        assert.equal(gone.absent, true);
        const after = await publicDigest(); assert.deepEqual(after, original, "Original public preferences changed");
        note("cleanup", { schemaAbsent: true, originalPublicPreferencesUnchanged: true, publicDigest: after });
        schemaCreated = false;
      }
    } catch (error) { note("cleanup-failure", { message: error instanceof Error ? error.message : String(error) }); throw error; }
    finally { await admin.end({ timeout: 2 }); }
  }
  try {
    const identity = await admit(admin); original = await publicDigest();
    note("admission", { identity, originalPublicPreferences: original });
    const [absent] = await admin`select to_regnamespace(${schemaName}) is null absent`; assert.equal(absent.absent, true);
    await admin.unsafe(`create schema ${schemaName}`); schemaCreated = true;
    await admin.unsafe(`comment on schema ${schemaName} is '${marker}'`);
    await admin.unsafe(`create table ${schemaName}.user_preferences (like public.user_preferences including all)`);
    const columns = await admin`select n.nspname schema,a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull required,pg_get_expr(d.adbin,d.adrelid) default_value from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relname='user_preferences' and n.nspname in ('public',${schemaName}) and a.attnum>0 and not a.attisdropped order by a.attnum`;
    const shape = (name: string) => columns.filter(row => row.schema === name).map(({ schema: _schema, ...row }) => { void _schema; return row; });
    assert.deepEqual(shape(schemaName), shape("public"));
    const [unique] = await admin`select count(*)::int count from pg_index i where i.indrelid=to_regclass(${schemaName + ".user_preferences"}) and i.indisunique`;
    assert.equal(unique.count, 2, "Clone must retain primary and unique user-id indexes");
    note("schema-parity", { columns: shape(schemaName), uniqueIndexes: unique.count, foreignKeysAndTriggersCopied: false });
    async function worker(name: string): Promise<Worker> {
      const sql = connect(name, true); const identity = await admit(sql);
      // Initializes the same PostgreSQL JSON serializer behavior as the application.
      const db = database(sql);
      const [scope] = await sql`select current_setting('search_path') path,to_regclass('user_preferences')::oid resolved,to_regclass(${schemaName + '.user_preferences'})::oid expected`;
      assert.equal(scope.path, `${schemaName},pg_catalog`); assert.equal(scope.resolved, scope.expected);
      note("worker", { name, pid: identity.pid, searchPath: scope.path, relationOid: scope.resolved });
      return { sql, db, pid: Number(identity.pid), name };
    }
    const workers = await Promise.all([worker("worker-a"), worker("worker-b"), worker("lock-holder")]);
    const [a, b, holder] = workers;
    async function seed(userId: string, fields: Omit<Prefs, "userId">) {
      const [row] = await a.db.insert(userPreferences).values({ ...fields, userId }).returning();
      assert.equal(row.userId, userId); return row;
    }
    async function read(userId: string) { return a.db.query.userPreferences.findFirst({ where: eq(userPreferences.userId, userId) }); }
    async function hold(userId: string) {
      assert(/^[a-f0-9-]{36}$/.test(userId));
      const entered = deferred(), release = deferred();
      const pending = holder.sql.begin(async tx => {
        await tx.unsafe("select pg_advisory_xact_lock(hashtextextended($1,0))", [lockKey(userId)]);
        entered.resolve(); await release.promise;
      });
      const completion = pending.catch(error => { entered.reject(error); throw error; });
      // Attach an error observer immediately; callers still receive the failure on release.
      void completion.catch(() => {});
      await entered.promise;
      return { release: async () => { release.resolve(); await completion; } };
    }
    async function blockedBeforeRead(target: Worker, operation: { settled: boolean }, userId: string) {
      const deadline = Date.now() + 2500;
      while (Date.now() < deadline) {
        assert.equal(operation.settled, false, "Router finished while canonical owner lock was held");
        const [state] = await admin`select ${holder.pid} = any(pg_blocking_pids(${target.pid})) held_by_fixture,exists(select 1 from pg_locks where pid=${target.pid} and locktype='advisory' and not granted and objsubid=1 and database=(select oid from pg_database where datname=current_database()) and ((classid::bigint << 32) | objid::bigint)=hashtextextended(${lockKey(userId)},0)) advisory_wait,(select count(*)::int from pg_locks where pid=${target.pid} and relation=to_regclass(${schemaName + '.user_preferences'})) table_locks`;
        if (state.held_by_fixture && state.advisory_wait) {
          assert.equal(state.table_locks, 0, "Preference table was accessed before acquiring owner advisory lock");
          note("blocked-before-read", { worker: target.name, pid: target.pid, holderPid: holder.pid, ...state }); return;
        }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.fail("No PostgreSQL advisory wait on the exact owner key was observed");
    }
    async function noAdvisoryLocks(target: Worker) {
      const [row] = await admin`select count(*)::int count from pg_locks where pid=${target.pid} and locktype='advisory'`;
      assert.equal(row.count, 0); note("locks-released", { worker: target.name, count: row.count });
    }
    async function count(userId: string) { const [row] = await a.sql`select count(*)::int count from user_preferences where user_id=${userId}`; return Number(row.count); }
    async function addWriteFailure() { await admin.unsafe(`alter table ${schemaName}.user_preferences add constraint fixture_price_ceiling check (price_max_per_sq_ft is null or price_max_per_sq_ft <= 8)`); }
    async function removeWriteFailure() { await admin.unsafe(`alter table ${schemaName}.user_preferences drop constraint fixture_price_ceiling`); }
    return { runId, schemaName, evidenceDir, a, b, holder, seed, read, count, hold, blockedBeforeRead, noAdvisoryLocks, note, cleanup, addWriteFailure, removeWriteFailure };
  } catch (error) { await cleanup(); throw error; }
}
export type PreferencesFixture = Awaited<ReturnType<typeof createPreferencesFixture>>;
