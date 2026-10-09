import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
import postgres from "postgres";

const args = process.argv.slice(2);
const file = args[args.indexOf("--file") + 1];
if (!args.includes("--file") || !file) throw new Error("Pass --file with an isolated local database configuration");
if (!args.includes("--disposable-cluster")) throw new Error("Pass --disposable-cluster to acknowledge creation of cluster-wide inert compatibility roles");
const settings = parse(readFileSync(resolve(file)));
const connection = settings.DATABASE_MIGRATION_URL || settings.DATABASE_URL;
if (!connection) throw new Error("Missing database connection");
const url = new URL(connection);
if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.startsWith("/plankmarket_bootstrap_")) {
  throw new Error("Bootstrap requires a loopback database named plankmarket_bootstrap_*; remote databases are forbidden");
}
const directory = resolve(args.includes("--baseline") ? args[args.indexOf("--baseline") + 1] : "drizzle/baseline-20260908");
const manifest = JSON.parse(readFileSync(resolve(directory, "provenance.json"), "utf8"));
const source = readFileSync(resolve(directory, "schema.sql"), "utf8").replace(/\r\n/g, "\n");
if (createHash("sha256").update(source).digest("hex") !== manifest.sha256) throw new Error("Baseline hash mismatch");
const db = postgres(connection, { max: 1 });
try {
  await db.begin(async tx => {
    const [objects] = await tx`select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'`;
    const [schemas] = await tx`select count(*)::int as count from pg_namespace where nspname in ('auth','extensions')`;
    if (objects.count || schemas.count) throw new Error("Bootstrap requires an empty database; existing objects are never overwritten");
    // These are inert compatibility roles in the isolated local database,
    // not hosted Supabase service credentials or a claim of Auth availability.
    for (const role of manifest.localCompatibilityRoles) {
      if (!/^[a-z_]+$/.test(role)) throw new Error("Invalid baseline role");
      const [found] = await tx`select 1 from pg_roles where rolname=${role}`;
      if (!found) await tx.unsafe(`CREATE ROLE "${role}" NOLOGIN`);
    }
    // Only the default, verified-empty namespace is removed. The original
    // schema dump remains immutable; extension prerequisites are explicit.
    await tx.unsafe("DROP SCHEMA public");
    const extensions = manifest.extensions.map(e => {
      if (!/^[a-z_-]+$/.test(e.extname) || !/^[a-z_]+$/.test(e.schema)) throw new Error("Invalid extension prerequisite");
      return `CREATE EXTENSION IF NOT EXISTS "${e.extname}" WITH SCHEMA "${e.schema}";`;
    }).join("\n");
    await tx.unsafe(source.replace("CREATE SCHEMA public;", `CREATE SCHEMA public;\n${extensions}`));
  });
  console.log("Verified historical baseline restored into the empty local database. Apply only reviewed forward migrations newer than that export, then run db:check:target for the current release contract. Hosted Auth and provider acceptance remain separate; bootstrap does not auto-apply forward migrations.");
} finally { await db.end(); }
