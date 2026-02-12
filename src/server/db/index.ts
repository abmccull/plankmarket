import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { env } from "@/env";

const queryClient = postgres(env.DATABASE_URL, {
  max: env.NODE_ENV === "production" ? 10 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
});
export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
