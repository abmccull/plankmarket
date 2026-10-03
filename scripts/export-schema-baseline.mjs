import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
import postgres from "postgres";
import { prepareSchemaRestore } from "./lib/schema-restore.mjs";

const args = process.argv.slice(2);
const file = args[args.indexOf("--file") + 1];
const output = args[args.indexOf("--out") + 1];
if (!args.includes("--file") || !args.includes("--out") || !file || !output) {
  throw new Error("Usage: node scripts/export-schema-baseline.mjs --file ENV_FILE --out NEW_DIRECTORY");
}
const settings = parse(readFileSync(resolve(file)));
const connection = settings.DATABASE_MIGRATION_URL || settings.DATABASE_URL;
if (!connection) throw new Error("Database connection is missing");
const url = new URL(connection);
const databaseProject = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
  ?? (/\.pooler\.supabase\.com$/.test(url.hostname)
    ? decodeURIComponent(url.username).match(/\.([a-z0-9]+)$/)?.[1]
    : undefined);
const authProject = settings.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(settings.NEXT_PUBLIC_SUPABASE_URL).hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1]
  : undefined;
if (databaseProject && authProject && databaseProject !== authProject) {
  throw new Error("Database and Auth project references differ; resolve the target before exporting");
}
const directory = resolve(output);
mkdirSync(directory, { recursive: false });
const result = spawnSync("pg_dump", ["--schema-only", "--no-owner", "--schema=public", "--schema=auth", "--schema=extensions", `--file=${resolve(directory, "schema.sql")}`], {
  env: { ...process.env, PGHOST: url.hostname, PGPORT: url.port || "5432", PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: url.pathname.slice(1), PGSSLMODE: url.searchParams.get("sslmode") || "require", PGCONNECT_TIMEOUT: "15", PGOPTIONS: "-c default_transaction_read_only=on" },
  encoding: "utf8", timeout: 120000,
});
if (result.status !== 0) {
  // Provider diagnostics can contain connection details. Keep secret-bearing
  // output out of console/CI logs; report only the bounded operation outcome.
  throw new Error(`Schema export failed (exit ${result.status ?? "timeout"}); verify connection and PostgreSQL client compatibility`);
}
const sql = postgres(connection, { max: 1, connect_timeout: 15 });
let ledger = [];
let extensions = [];
try {
  ledger = await sql.begin("read only", async tx => {
    const [found] = await tx`select to_regclass('drizzle.__drizzle_migrations') as relation`;
    extensions = await tx`select e.extname,n.nspname as schema,e.extversion from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('pg_trgm','pgcrypto','uuid-ossp') order by e.extname`;
    return found.relation ? await tx`select id, hash, created_at from drizzle.__drizzle_migrations order by id` : [];
  });
} finally { await sql.end(); }
const schemaPath = resolve(directory, "schema.sql");
const normalized = readFileSync(schemaPath, "utf8").replace(/\r\n/g, "\n");
writeFileSync(schemaPath, normalized);
const restoreSql = prepareSchemaRestore(normalized, extensions);
writeFileSync(resolve(directory, "restore.sql"), restoreSql);
writeFileSync(resolve(directory, "provenance.json"), JSON.stringify({
  observedAt: new Date().toISOString(), host: url.hostname, database: url.pathname.slice(1),
  schemas: ["public", "auth", "extensions"], containsTableData: false,
  projectReference: databaseProject ?? null,
  hashNormalization: "UTF-8 LF",
  sha256: createHash("sha256").update(normalized).digest("hex"),
  restoreArtifact: {
    path: "restore.sql",
    sha256: createHash("sha256").update(restoreSql).digest("hex"),
    dependencies: "allowlisted captured extensions with exact versions; original schema.sql retained",
    scope: "fresh local restore; original owners/data/storage and hosted recovery not established",
  },
  extensions,
  localCompatibilityRoles: ["anon", "authenticated", "dashboard_user", "service_role", "supabase_admin", "supabase_auth_admin", "supabase_functions_admin"],
  ledger, status: "exported; restoration and security comparison still required",
}, null, 2));
console.log(`Schema-only export and ledger saved to ${directory}`);
