import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { Database } from "@/server/db";

/** A private bucket can still be exposed by a broad Storage RLS policy. */
export async function assertListingPhotoStoragePolicy(database: Pick<Database, "execute">) {
  const predicate = "(bucket_id <> 'listing-photos'::text)";
  const [result] = await database.execute(sql`select exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_policy p on p.polrelid = c.oid
    join pg_roles a on a.rolname = 'anon'
    join pg_roles b on b.rolname = 'authenticated'
    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity
      and not a.rolsuper and not a.rolbypassrls and not b.rolsuper and not b.rolbypassrls
      and c.relowner not in (a.oid, b.oid)
      and not pg_has_role(a.oid, c.relowner, 'USAGE') and not pg_has_role(b.oid, c.relowner, 'USAGE')
      and p.polname = 'listing_photos_server_only' and not p.polpermissive and p.polcmd = '*'
      and p.polroles @> array[a.oid, b.oid]
      and pg_get_expr(p.polqual, p.polrelid) = ${predicate}
      and pg_get_expr(p.polwithcheck, p.polrelid) = ${predicate}
  ) as protected`);
  if (result?.protected !== true) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Private listing photo access is not configured. Your draft is saved; contact support." });
  }
}
