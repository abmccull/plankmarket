import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/env";

const queryClient = postgres(env.DATABASE_URL, {
  max: 1, // Limit connections for serverless environments (Vercel)
  prepare: false, // Required for Supabase transaction pooler (PgBouncer)
});
export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
