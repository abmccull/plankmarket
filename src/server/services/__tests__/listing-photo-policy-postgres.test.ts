// Written before the policy guard. Proves actual catalog expressions and restrictive-RLS behavior.
// @vitest-environment node
import assert from "node:assert/strict";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertListingPhotoStoragePolicy } from "@/server/services/listing-photo-policy";

const TARGET="postgresql://postgres@127.0.0.1:55439/plankmarket_bootstrap_design_20260929";
const ROLLBACK=new Error("intentional proof rollback");
let client:ReturnType<typeof postgres>;
describe.skipIf(process.env.LISTING_PHOTO_POLICY_PG!=="1")("private photo storage policy actual local catalog",()=>{
  beforeAll(async()=>{
    client=postgres(TARGET,{max:1,connect_timeout:5,idle_timeout:2});
    const [r]=await client`select current_database() as db, inet_server_addr()::text as host, to_regclass('storage.objects')::text as objects`;
    assert.equal(r.db,"plankmarket_bootstrap_design_20260929"); assert.match(r.host,/^127\.0\.0\.1/); assert.equal(r.objects,null,"Do not replace an existing storage schema");
  });
  afterAll(async()=>{ if(client){const [r]=await client`select to_regnamespace('storage')::text as schema`; assert.equal(r.schema,null); await client.end({timeout:2});} });
  it("fails closed without a Storage schema",async()=>{await expect(assertListingPhotoStoragePolicy(drizzle(client))).rejects.toThrow();});
  it("requires RLS, restrictive ALL and both client roles; other permissive policies cannot expose photos",async()=>{
    await drizzle(client).transaction(async db=>{
      const tx={unsafe:(query:string)=>db.execute(sql.raw(query))};
      await tx.unsafe("create schema storage; create table storage.objects(id integer, bucket_id text not null); grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated; insert into storage.objects values(1,'listing-photos'),(2,'other-bucket')");
      await expect(assertListingPhotoStoragePolicy(db)).rejects.toThrow();
      await tx.unsafe("alter table storage.objects enable row level security; create policy other_bucket_policy on storage.objects for all to anon,authenticated using(true) with check(true)");
      await expect(assertListingPhotoStoragePolicy(db)).rejects.toThrow();
      const policy="create policy listing_photos_server_only on storage.objects as restrictive for all to anon,authenticated using(bucket_id <> 'listing-photos'::text) with check(bucket_id <> 'listing-photos'::text)";
      await tx.unsafe(policy); await expect(assertListingPhotoStoragePolicy(db)).resolves.toBeUndefined();
      for(const role of ["anon","authenticated"]){
        await tx.unsafe(`set local role ${role}`);
        expect(await db.execute(sql`select id from storage.objects order by id`)).toEqual([{id:2}]);
        await tx.unsafe("reset role");
      }
      // A fresh transaction-local role is never committed; inherited ownership can bypass RLS.
      await tx.unsafe("create role private_photo_policy_fixture_owner nologin; grant private_photo_policy_fixture_owner to anon; alter table storage.objects owner to private_photo_policy_fixture_owner");
      await expect(assertListingPhotoStoragePolicy(db)).rejects.toThrow();
      await tx.unsafe("alter table storage.objects owner to current_user; revoke private_photo_policy_fixture_owner from anon; drop role private_photo_policy_fixture_owner");
      await tx.unsafe("drop policy listing_photos_server_only on storage.objects; create policy listing_photos_server_only on storage.objects as restrictive for select to anon,authenticated using(bucket_id <> 'listing-photos'::text)");
      await expect(assertListingPhotoStoragePolicy(db)).rejects.toThrow();
      await tx.unsafe("drop policy listing_photos_server_only on storage.objects; create policy listing_photos_server_only on storage.objects as restrictive for all to anon using(bucket_id <> 'listing-photos'::text) with check(bucket_id <> 'listing-photos'::text)");
      await expect(assertListingPhotoStoragePolicy(db)).rejects.toThrow();
      await tx.unsafe("drop policy listing_photos_server_only on storage.objects; create policy listing_photos_server_only on storage.objects for all to anon,authenticated using(bucket_id <> 'listing-photos'::text) with check(bucket_id <> 'listing-photos'::text)");
      await expect(assertListingPhotoStoragePolicy(db)).rejects.toThrow();
      await tx.unsafe("drop policy listing_photos_server_only on storage.objects"); await tx.unsafe(policy);
      await tx.unsafe("alter table storage.objects disable row level security"); await expect(assertListingPhotoStoragePolicy(db)).rejects.toThrow();
      throw ROLLBACK;
    }).catch(error=>{if(error!==ROLLBACK)throw error;});
  });
});
