import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/env";
import {
  DATABASE_CONNECT_TIMEOUT_SECONDS,
  DATABASE_STATEMENT_TIMEOUT_MS,
  resolveDatabasePoolMax,
} from "./connection-config";

const queryClient = postgres(env.DATABASE_URL, {
  max: resolveDatabasePoolMax(env.DATABASE_POOL_MAX, env.NODE_ENV),
  connect_timeout: DATABASE_CONNECT_TIMEOUT_SECONDS,
  connection: {
    application_name: "plankmarket-app",
    statement_timeout: DATABASE_STATEMENT_TIMEOUT_MS,
  },
  prepare: false, // Required for Supabase transaction pooler (PgBouncer)
});
export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
