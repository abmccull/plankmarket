import { sql } from "drizzle-orm";
import type { Database } from "@/server/db";

/** Operational profile cohort; no optional analytics consent or identity export. */
export async function getRegistrationCohort(db: Database, start: Date, end: Date) {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new Error("Registration cohort requires an ordered finite window");
  }
  const rows = await db.execute<{
    profiles_created: number; receipt_confirmed: number; completion_unknown: number;
    original_buyers: number; original_sellers: number;
  }>(sql`
    WITH cohort AS (
      SELECT id, auth_id FROM public.users
      WHERE created_at >= ${start.toISOString()}::timestamptz
        AND created_at < ${end.toISOString()}::timestamptz AND role <> 'admin'
    ), first_registration AS (
      SELECT DISTINCT ON (w.user_id) w.user_id, w.expected_role
      FROM public.role_provider_writes w
      JOIN cohort c ON c.id = w.user_id AND c.auth_id = w.auth_id::text
      WHERE w.purpose = 'registration' AND w.confirmed_at IS NOT NULL
        AND w.confirmed_at < ${end.toISOString()}::timestamptz
      ORDER BY w.user_id, w.confirmed_at, w.version
    )
    SELECT count(*)::int AS profiles_created,
      count(r.user_id)::int AS receipt_confirmed,
      count(*) FILTER (WHERE r.user_id IS NULL)::int AS completion_unknown,
      count(*) FILTER (WHERE r.expected_role = 'buyer')::int AS original_buyers,
      count(*) FILTER (WHERE r.expected_role = 'seller')::int AS original_sellers
    FROM cohort c LEFT JOIN first_registration r ON r.user_id = c.id
  `);
  const row = rows[0];
  return {
    profilesCreated: Number(row.profiles_created), receiptConfirmed: Number(row.receipt_confirmed),
    completionUnknown: Number(row.completion_unknown), originalBuyers: Number(row.original_buyers),
    originalSellers: Number(row.original_sellers),
  };
}
