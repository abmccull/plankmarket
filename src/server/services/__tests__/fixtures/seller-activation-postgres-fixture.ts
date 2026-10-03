// Candidate target: src/server/services/__tests__/fixtures/seller-activation-postgres-fixture.ts
// Actual PostgreSQL + actual Drizzle. LIKE retains checks/indexes, not FK/trigger/RLS.
import assert from "node:assert/strict";
import { TRPCError } from "@trpc/server";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, asc, eq, inArray } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db";

const TARGET = "postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
const TABLES = ["users", "role_provider_writes", "verification_documents", "seller_activation_requests", "audit_events", "notifications", "orders"] as const;
type Sql = ReturnType<typeof postgres>;
type SeedOptions = { user?: Partial<typeof schema.users.$inferInsert>; document?: Partial<typeof schema.verificationDocuments.$inferInsert> };
const DAY = 86_400_000;
function database(client: Sql): Database { return drizzle(client, { schema }); }

export async function createSellerActivationFixture() {
  assert.equal(process.env.SELLER_ACTIVATION_DB_PROOF, "1", "Explicit isolated disposable-DB proof opt-in required");
  // Never read DATABASE_URL, .env or provider credentials; this target is deliberately fixed.
  const configured = new URL(TARGET);
  assert.deepEqual({ hostname: configured.hostname, port: configured.port, pathname: configured.pathname, username: configured.username, password: configured.password },
    { hostname: "127.0.0.1", port: "55439", pathname: "/plankmarket_bootstrap_design_20260929", username: "postgres", password: "" });
  const runId = randomUUID(), schemaName = "seller_act_" + runId.replaceAll("-", ""), marker = `seller-activation-service-proof:${runId}`;
  assert(/^seller_act_[a-f0-9]{32}$/.test(schemaName));
  const evidenceDir = path.resolve("tmp/journey10/dual-capability/buyer-activation/service-proof", runId);
  fs.mkdirSync(evidenceDir, { recursive: true });
  const sourcePaths = [
    "src/server/services/seller-activation.ts", "src/server/db/schema/seller-activation-requests.ts",
    "src/server/services/role-provider-write-session.ts", "src/server/services/role-provider-coordinator.ts",
    "src/server/services/seller-activation-provider.ts", "src/server/db/schema/role-provider-writes.ts", "src/server/db/schema/index.ts",
    "src/server/db/schema/users.ts", "src/server/db/schema/verification-documents.ts", "src/server/db/schema/audit-events.ts",
    "src/server/db/schema/notifications.ts", "src/server/db/schema/orders.ts", "src/server/services/audit-ledger.ts",
    "src/server/services/__tests__/seller-activation-postgres.test.ts",
    "src/server/services/__tests__/fixtures/seller-activation-postgres-fixture.ts",
    "src/server/services/__tests__/fixtures/seller-activation-role-provider.ts",
    ...fs.readdirSync("drizzle").filter(name => /^004[234].*\.sql$/.test(name)).map(name => `drizzle/${name}`),
  ];
  const events: Array<{ kind: string; detail: unknown }> = [];
  const evidence = { runId, target: TARGET, schemaName, marker, fixtureBoundary: "real SQL; canonical checks/indexes; no cloned FK/trigger/RLS; no live provider",
    source: sourcePaths.map(file => ({ path: file, sha256: createHash("sha256").update(fs.readFileSync(file)).digest("hex") })), events };
  function note(kind: string, detail: unknown) {
    events.push({ kind, detail });
    fs.writeFileSync(path.join(evidenceDir, "database-proof.json"), JSON.stringify(evidence, null, 2));
  }
  const clients: Sql[] = [];
  const closedClients = new Set<Sql>();
  let schemaCreated = false;
  let createdTables: string[] = [];
  function connect(name: string, isolated: boolean, advisory = false) {
    const sql = postgres(TARGET, { max: 1, prepare: false, connect_timeout: 3, onnotice: () => {},
      connection: { application_name: `seller-activation-proof-${runId.slice(0, 8)}-${name}`,
        search_path: isolated ? `${schemaName},pg_catalog` : "pg_catalog",
        statement_timeout: 8000, lock_timeout: 6000, idle_in_transaction_session_timeout: advisory ? 90000 : 12000 } });
    clients.push(sql); return sql;
  }
  const catalog = connect("catalog", false);
  async function admit(sql: Sql) {
    const [identity] = await sql`select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,pg_backend_pid() pid`;
    assert.deepEqual({ name: identity.name, role: identity.role, address: identity.address, port: identity.port },
      { name: "plankmarket_bootstrap_design_20260929", role: "postgres", address: "127.0.0.1", port: 55439 });
    return identity;
  }
  async function digest(namespace: string, tables: readonly string[] = TABLES) {
    assert(namespace === "public" || namespace === schemaName);
    const result: Record<string, { count: number; digest: string }> = {};
    for (const table of tables) {
      assert((TABLES as readonly string[]).includes(table));
      const [row] = await catalog.unsafe(`select count(*)::int count,md5(coalesce(string_agg(md5(to_jsonb(p)::text),'' order by md5(to_jsonb(p)::text)),'')) digest from ${namespace}.${table} p`);
      result[table] = { count: Number(row.count), digest: String(row.digest) };
    }
    return result;
  }
  let originalPublic: Awaited<ReturnType<typeof digest>> | undefined;
  async function cleanup() {
    try {
      for (const client of clients.filter(client => client !== catalog && !closedClients.has(client))) await client.end({ timeout: 2 });
      if (schemaCreated) {
        const [owned] = await catalog`select n.nspname name,pg_get_userbyid(n.nspowner) owner,obj_description(n.oid,'pg_namespace') marker from pg_namespace n where n.nspname=${schemaName}`;
        assert.equal(owned?.name, schemaName); assert.equal(owned.owner, "postgres"); assert.equal(owned.marker, marker);
        const objects = await catalog`select c.relname name,c.relkind kind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=${schemaName} and c.relkind not in ('i','t') order by c.relname`;
        assert.deepEqual(objects.map(row => ({ name: String(row.name), kind: String(row.kind) })), createdTables.toSorted().map(name => ({ name, kind: "r" })), "Unexpected schema object; retain rather than drop");
        const [triggers] = await catalog`select count(*)::int count from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=${schemaName} and not t.tgisinternal`;
        assert.equal(triggers.count, 0, "Unexpected fixture trigger; retain rather than drop");
        for (const table of createdTables.toReversed()) await catalog.unsafe(`drop table ${schemaName}.${table}`);
        createdTables = [];
        await catalog.unsafe(`drop schema ${schemaName}`);
        const [gone] = await catalog`select to_regnamespace(${schemaName}) is null absent`;
        assert.equal(gone.absent, true); schemaCreated = false;
      }
      if (originalPublic) {
        const after = await digest("public");
        assert.deepEqual(after, originalPublic, "Original public tables changed during isolated service proof");
        note("cleanup", { schemaAbsent: !schemaCreated, originalPublicUnchanged: true, publicDigest: after });
      }
    } catch (error) {
      note("cleanup-failure", { message: error instanceof Error ? error.message : String(error), schemaRetained: schemaCreated });
      throw error;
    } finally { await catalog.end({ timeout: 2 }); }
  }
  try {
    const identity = await admit(catalog);
    for (const table of TABLES) {
      const [available] = await catalog`select to_regclass(${"public." + table}) is not null present`;
      assert.equal(available.present, true, `Canonical migrated table missing: ${table}. Do not synthesize its schema.`);
    }
    originalPublic = await digest("public");
    note("admission", { identity, originalPublic });
    const [absent] = await catalog`select to_regnamespace(${schemaName}) is null absent`; assert.equal(absent.absent, true);
    await catalog.unsafe(`create schema ${schemaName}`); schemaCreated = true;
    await catalog.unsafe(`comment on schema ${schemaName} is '${marker}'`);
    for (const table of TABLES) {
      await catalog.unsafe(`create table ${schemaName}.${table} (like public.${table} including all)`); createdTables.push(table);
      const columns = await catalog`select n.nspname schema,a.attname name,format_type(a.atttypid,a.atttypmod) type,a.attnotnull required,pg_get_expr(d.adbin,d.adrelid) default_value from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relname=${table} and n.nspname in ('public',${schemaName}) and a.attnum>0 and not a.attisdropped order by a.attnum`;
      const shape = (name: string) => columns.filter(row => row.schema === name).map(({ schema: _schema, ...row }) => { void _schema; return row; });
      assert.deepEqual(shape(schemaName), shape("public"));
      const checkDefinitions = await catalog`select n.nspname schema,pg_get_constraintdef(c.oid) definition from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where t.relname=${table} and n.nspname in ('public',${schemaName}) and c.contype='c' order by definition`;
      // LIKE validates copied checks on the empty fixture. NOT VALID on a source
      // constraint only skips its historical scan; both enforce every new row.
      const checks = (name: string) => checkDefinitions.filter(row => row.schema === name).map(row => String(row.definition).replace(/ NOT VALID$/, ""));
      assert.deepEqual(checks(schemaName), checks("public"));
      const indexes = await catalog`select n.nspname schema,count(*)::int count,count(*) filter(where i.indisunique)::int unique_count from pg_index i join pg_class t on t.oid=i.indrelid join pg_namespace n on n.oid=t.relnamespace where t.relname=${table} and n.nspname in ('public',${schemaName}) group by n.nspname`;
      const indexShape = (name: string) => indexes.filter(row => row.schema === name).map(row => ({ count: row.count, uniqueCount: row.unique_count }));
      assert.deepEqual(indexShape(schemaName), indexShape("public"));
      note("schema-parity", { table, columns: shape(schemaName), checks: checks(schemaName), rawCheckDefinitions: checkDefinitions, indexes: indexShape(schemaName), foreignKeysTriggersRlsCopied: false });
    }
    async function worker(name: string) {
      const sql = connect(name, true), identity = await admit(sql);
      // Do this before raw JSON queries; match the application's postgres-js JSON serializers.
      const db = database(sql);
      for (const table of TABLES) {
        const [resolved] = await sql`select current_setting('search_path') path,to_regclass(${table})::oid resolved,to_regclass(${schemaName + "." + table})::oid expected`;
        assert.equal(resolved.path, `${schemaName},pg_catalog`); assert.equal(resolved.resolved, resolved.expected);
      }
      note("worker", { name, pid: identity.pid, searchPath: `${schemaName},pg_catalog` });
      return { sql, db, pid: Number(identity.pid) };
    }
    const [a, b] = await Promise.all([worker("a"), worker("b")]);
    let lane = 0;
    async function coordinate<T>(userId: string, work: () => Promise<T>): Promise<T> {
      const lock = connect(`coordinator-${++lane}`, true, true);
      try {
        const identity = await admit(lock);
        const result = await lock.begin(async tx => {
          const [row] = await tx.unsafe<{ owned: boolean }[]>(
            "select pg_try_advisory_xact_lock(hashtextextended($1,0)) owned", ["plankmarket-role:" + userId],
          );
          note("coordinator", { userId, pid: identity.pid, owned: row.owned });
          if (!row.owned) throw new TRPCError({ code: "CONFLICT", message: "Fixture coordinator busy" });
          return { value: await work() };
        });
        return result.value;
      } finally { await lock.end({ timeout: 2 }); closedClients.add(lock); }
    }
    async function roleWrites(userId: string) {
      return a.db.select().from(schema.roleProviderWrites).where(eq(schema.roleProviderWrites.userId, userId)).orderBy(asc(schema.roleProviderWrites.version));
    }
    const [admin] = await a.db.insert(schema.users).values({ authId: randomUUID(), email: `activation-reviewer-${runId}@example.invalid`, name: "Fixture reviewer", role: "admin", active: true, verified: true, verificationStatus: "verified" }).returning();
    async function seed(options: SeedOptions = {}) {
      const id = randomUUID();
      const [user] = await a.db.insert(schema.users).values({ id, authId: randomUUID(), email: `activation-${id}@example.invalid`, name: "Fixture owner", role: "buyer", active: true,
        verified: true, verificationStatus: "verified", verificationSubmissionId: randomUUID(), verificationRequestedAt: new Date(Date.now() - 2 * DAY),
        verificationNotes: "Historical buyer approval", verificationDataPurgeAfter: new Date(Date.now() + 15 * DAY),
        businessName: "Fixture Existing Flooring LLC", businessAddress: "123 Existing Business Street", businessCity: "Denver", businessState: "CO", businessZip: "80202",
        stripeAccountId: `acct_fixture_${id}`, stripeOnboardingComplete: false, stripeCustomerId: `cus_fixture_${id}`,
        stripeSubscriptionId: `sub_fixture_${id}`, proStatus: "free", createdAt: new Date(Date.now() - 50 * DAY),
        ...options.user }).returning();
      const documentId = randomUUID();
      const [document] = await a.db.insert(schema.verificationDocuments).values({ id: documentId, userId: user.id,
        objectPath: `${user.id}/ready/${documentId}`, fileName: "fixture-business-license.pdf", purpose: "business_verification", mimeType: "application/pdf", fileSize: 2048,
        createdAt: new Date(Date.now() - DAY), readyAt: new Date(Date.now() - 60_000), ...options.document }).returning();
      const [counterparty] = await a.db.insert(schema.users).values({ authId: randomUUID(), email: `counterparty-${id}@example.invalid`, name: "Fixture seller", role: "seller", active: true, verified: true, verificationStatus: "verified" }).returning();
      const [order] = await a.db.insert(schema.orders).values({ orderNumber: `SA-${id.replaceAll("-", "").slice(0, 16)}`, buyerId: user.id, sellerId: counterparty.id, listingId: randomUUID(),
        quantitySqFt: 100, pricePerSqFt: 2, subtotal: 200, buyerFee: 10, sellerFee: 10, totalPrice: 210, originalSellerPayout: 184, sellerPayout: 184,
        stripeProcessingFee: 6, sellerStripeFee: 6, platformStripeFee: 0, paymentStatus: "succeeded", status: "confirmed", stripePaymentIntentId: `pi_fixture_${id}` }).returning();
      return { user, document, orderId: order.id, requestId: randomUUID() };
    }
    async function user(id: string) { return a.db.query.users.findFirst({ where: eq(schema.users.id, id) }); }
    async function request(userId: string, requestId: string) { return a.db.query.sellerActivationRequests.findFirst({ where: and(eq(schema.sellerActivationRequests.userId, userId), eq(schema.sellerActivationRequests.requestId, requestId)) }); }
    async function order(id: string) { return a.db.query.orders.findFirst({ where: eq(schema.orders.id, id) }); }
    async function requestCount(userId: string) { const [row] = await a.sql`select count(*)::int count from seller_activation_requests where user_id=${userId}`; return Number(row.count); }
    async function bindDocumentToActivation(documentId: string, userId: string, applicationId: string) {
      const [document] = await a.db.update(schema.verificationDocuments).set({ objectPath: `${userId}/ready/${applicationId}/${documentId}` })
        .where(and(eq(schema.verificationDocuments.id, documentId), eq(schema.verificationDocuments.userId, userId))).returning();
      assert(document, "Fixture document owner binding failed"); return document;
    }
    async function artifacts(userId: string) {
      const requests = await a.db.select({ id: schema.sellerActivationRequests.id }).from(schema.sellerActivationRequests).where(eq(schema.sellerActivationRequests.userId, userId));
      const ids = requests.map(row => row.id);
      const audits = ids.length ? await a.db.select().from(schema.auditEvents).where(inArray(schema.auditEvents.entityId, ids)).orderBy(asc(schema.auditEvents.createdAt), asc(schema.auditEvents.id)) : [];
      const notifications = await a.db.select().from(schema.notifications).where(eq(schema.notifications.userId, userId)).orderBy(asc(schema.notifications.createdAt), asc(schema.notifications.id));
      return { audits, notifications };
    }
    async function rejectNotificationsFor(userId: string) {
      assert(/^[a-f0-9-]{36}$/.test(userId));
      // NOT VALID leaves old durable receipts intact but rejects new receipts for this owner.
      await catalog.unsafe(`alter table ${schemaName}.notifications add constraint fixture_reject_activation_receipt check(user_id <> '${userId}'::uuid) not valid`);
    }
    async function allowNotifications() { await catalog.unsafe(`alter table ${schemaName}.notifications drop constraint fixture_reject_activation_receipt`); }
    return { runId, schemaName, evidenceDir, a, b, coordinate, roleWrites, admin, seed, user, request, order, requestCount, bindDocumentToActivation, artifacts, stateDigest: () => digest(schemaName), note, cleanup, rejectNotificationsFor, allowNotifications };
  } catch (error) { await cleanup(); throw error; }
}
export type SellerActivationFixture = Awaited<ReturnType<typeof createSellerActivationFixture>>;
