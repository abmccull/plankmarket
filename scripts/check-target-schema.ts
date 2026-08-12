import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { parse as parseDotEnv } from "dotenv";
import postgres from "postgres";

import {
  MARKETPLACE_SCHEMA_READINESS_SQL,
  MARKETPLACE_SCHEMA_VERSION,
} from "../src/lib/schema-readiness-contract";

type SchemaReadinessRow = {
  schemaReady: boolean;
  missingArtifactCount: number;
  missingArtifacts: string[];
};

const args = process.argv.slice(2);
const fileFlagIndex = args.findIndex((arg) => arg === "--file");
const requestedFile =
  fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : undefined;

const allowSkip =
  args.includes("--allow-skip") ||
  process.env.SKIP_DATABASE_SCHEMA_CHECK === "true";

if (fileFlagIndex >= 0 && !requestedFile) {
  console.error("Missing value for --file");
  process.exit(1);
}

function loadDatabaseUrl(): { databaseUrl: string; sourceLabel: string } {
  if (requestedFile) {
    const filePath = resolve(process.cwd(), requestedFile);
    if (!existsSync(filePath)) {
      throw new Error(`Env file not found: ${filePath}`);
    }
    const parsedEnv = parseDotEnv(readFileSync(filePath));
    const databaseUrl =
      parsedEnv.DATABASE_MIGRATION_URL ?? parsedEnv.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        `DATABASE_URL or DATABASE_MIGRATION_URL is missing from ${filePath}`,
      );
    }
    return { databaseUrl, sourceLabel: filePath };
  }

  const databaseUrl =
    process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL or DATABASE_MIGRATION_URL is required. Pass --file <target-env-file> or set it in the process environment.",
    );
  }
  return {
    databaseUrl,
    sourceLabel: "process environment",
  };
}

async function main(): Promise<void> {
  let client: ReturnType<typeof postgres> | null = null;

  try {
    const { databaseUrl, sourceLabel } = loadDatabaseUrl();
    client = postgres(databaseUrl, {
      max: 1,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 5,
    });

    const result = await client.begin(async (tx) => {
      await tx.unsafe("set transaction read only");
      const [row] = await tx.unsafe<SchemaReadinessRow[]>(
        MARKETPLACE_SCHEMA_READINESS_SQL,
      );
      return row;
    });

    if (!result?.schemaReady) {
      console.error(
        `Target database is not ready for marketplace schema ${MARKETPLACE_SCHEMA_VERSION} (${sourceLabel}).`,
      );
      console.error(
        `Missing ${result?.missingArtifactCount ?? 0} required schema artifacts.`,
      );

      if (allowSkip) {
        console.warn("");
        console.warn("⚠️  SCHEMA CHECK BYPASSED VIA --allow-skip FLAG");
        console.warn("");
        console.warn(
          "The target database does not have the required schema, but deployment",
        );
        console.warn(
          "is proceeding because SKIP_DATABASE_SCHEMA_CHECK=true or --allow-skip was set.",
        );
        console.warn("");
        console.warn("ACTION REQUIRED BEFORE APPLICATION START:");
        console.warn(
          "1. Review drizzle/BASELINE_STRATEGY.md for safe migration procedures",
        );
        console.warn(
          "2. Apply reviewed forward migrations manually to the target database",
        );
        console.warn(
          "3. Verify schema readiness before promoting to production traffic",
        );
        console.warn("");
        console.warn(
          "The application WILL FAIL at runtime until migrations are applied.",
        );
        console.warn("");
        process.exitCode = 0;
      } else {
        for (const artifact of result?.missingArtifacts ?? []) {
          console.error(`- ${artifact}`);
        }
        console.error("");
        console.error(
          "Deployment stopped before build. Do not auto-run db:migrate while the historical baseline is unresolved.",
        );
        console.error(
          "Apply the reviewed forward migrations manually using drizzle/BASELINE_STRATEGY.md.",
        );
        console.error("");
        console.error(
          "To bypass this check (NOT RECOMMENDED for production with live traffic):",
        );
        console.error(
          "  - Set SKIP_DATABASE_SCHEMA_CHECK=true in the environment, or",
        );
        console.error("  - Pass --allow-skip to this script");
        console.error("");
        process.exitCode = 1;
      }
    } else {
      console.log(
        `Target database schema ${MARKETPLACE_SCHEMA_VERSION} passed its read-only readiness contract (${sourceLabel}).`,
      );
    }
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Target database schema check failed.",
    );
    process.exitCode = 1;
  } finally {
    if (client) {
      await client.end({ timeout: 5 });
    }
  }
}

void main();
