/** @vitest-environment node */
// Candidate target: src/server/services/__tests__/private-photo-lifecycle.pg.test.ts
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, beforeAll, beforeEach, describe, it, vi } from "vitest";
import * as schema from "@/server/db/schema";
import type { Database } from "@/server/db";

const bridge = vi.hoisted(() => ({ database: null as unknown, storage: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ env: { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://synthetic.invalid" } }));
vi.mock("@/server/db", () => ({ db: new Proxy({}, { get(_target, key) {
  assert(bridge.database, "Unadmitted database access");
  const value = Reflect.get(bridge.database as object, key);
  return typeof value === "function" ? value.bind(bridge.database) : value;
} }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => { throw new Error("Hosted auth forbidden"); }, createServiceClient: () => { throw new Error("Hosted storage forbidden"); } }));
vi.mock("@/server/services/listing-photo-storage", () => ({ privateListingPhotoStorage: async () => bridge.storage }));
import { authorizeListingPhotoRead } from "@/server/services/listing-photo-read";
import { deletePrivateListingPhoto, purgeAbandonedListingPhotos, purgeDeletedListingPhotoResidue } from "@/server/services/listing-photo-cleanup";

let a: ReturnType<typeof postgres>, b: ReturnType<typeof postgres>, database: Database, databaseB: Database;
type Actor = { id: string; assuranceLevel: "aal1" | "aal2" | null };
type Photo = { owner: string; draft: string; upload: string; media: string; incoming: string; frozen: string };
const owned = new Set<string>();
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1cAAAAASUVORK5CYII=", "base64");
const objects = new Map<string, Uint8Array>();
const removals: string[][] = [];
let onRemove: null | ((paths: string[]) => Promise<void>) = null;
let removeFailure: null | ((paths: string[]) => boolean) = null;
let removeAcceptedThenUnknown: null | ((paths: string[]) => boolean) = null;
const proof = { cases: [] as Array<{ name: string; passed: boolean; error?: string }>, connections: [] as number[], originalsPreserved: false, unexpectedRows: [] as string[], sourceBefore: [] as unknown[], sourceAfter: [] as unknown[], boundary: "Actual committed PostgreSQL and independent sessions; provider simulated; exact disposable database must be dropped by root" };
const sourceFiles = ["src/server/services/listing-photo-read.ts","src/server/services/listing-photo-cleanup.ts","src/server/services/listing-photo-storage.ts","src/server/security/listing-visibility.ts","drizzle/0047_private_listing_photos.sql"];
const sourceHashes = () => sourceFiles.map(file => ({ file, sha256: fs.existsSync(file) ? createHash("sha256").update(fs.readFileSync(file)).digest("hex") : null }));
let original: Record<string, string[]> = {};
const allowedAddedTables = new Set(["users","listing_form_drafts","listing_photo_uploads","media","listings","orders","conversations","disputes","dispute_evidence"]);
async function fingerprints() {
  const tables = await a`select c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') order by c.relname`;
  const result: Record<string, string[]> = {};
  for (const { name } of tables) result[String(name)] = (await a`select md5(to_jsonb(t)::text) hash from public.${a(String(name))} t order by hash`).map(row => String(row.hash));
  return result;
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }
const actor = (id: string, assuranceLevel: Actor["assuranceLevel"] = "aal1"): Actor => ({ id, assuranceLevel });
const read = (f: Photo, person: Actor | null) => authorizeListingPhotoRead(database, f.media, person);
async function user(role: "seller"|"buyer"|"admin" = "seller", status="pending", state="CO") {
  const id=randomUUID(); owned.add(id);
  await a`insert into public.users(id,auth_id,email,name,role,active,verified,verification_status,business_state)
   values(${id}::uuid,${randomUUID()},${`photo-proof-${id}@example.invalid`},'Synthetic photo actor',${role}::user_role,true,${status==="verified"},${status},${state})`;
  return id;
}
async function photo(options: { ready?: boolean; ageDays?: number } = {}): Promise<Photo> {
  const owner=await user(),draft=randomUUID(),upload=randomUUID(),media=randomUUID();
  const f={owner,draft,upload,media,incoming:`${owner}/incoming/${draft}/1/${upload}`,frozen:`${owner}/frozen/${draft}/1/${upload}`};
  await a.begin(async tx => {
    await (tx as unknown as typeof a)`insert into public.listing_form_drafts(id,seller_id,generation,snapshot,last_save_operation_id,last_save_fingerprint)
     values(${draft}::uuid,${owner}::uuid,1,'{"schemaVersion":2,"currentStep":1,"formData":{},"uploadedMediaIds":[],"defaultsApplied":false}',${randomUUID()}::uuid,repeat('a',64))`;
    await (tx as unknown as typeof a)`insert into public.listing_photo_uploads(id,owner_id,draft_id,draft_generation,file_name,file_size,mime_type,incoming_path,frozen_path,created_at,expires_at)
     values(${upload}::uuid,${owner}::uuid,${draft}::uuid,1,'flooring.png',${PNG.length},'image/png',${f.incoming},${f.frozen},now()-${options.ageDays??0}*interval '1 day',now()-${options.ageDays??0}*interval '1 day'+interval '2 hours')`;
    if(options.ready!==false) {
      await (tx as unknown as typeof a)`insert into public.media(id,uploader_id,url,file_name,file_size,mime_type,storage_provider,listing_photo_upload_id)
       values(${media}::uuid,${owner}::uuid,${`/api/listing-photos/${media}`},'flooring.png',${PNG.length},'image/png','supabase_listing',${upload}::uuid)`;
      await (tx as unknown as typeof a)`update public.listing_photo_uploads set ready_media_id=${media}::uuid,ready_at=clock_timestamp(),content_sha256=${createHash('sha256').update(PNG).digest('hex')},completed_revision=2 where id=${upload}::uuid`;
      await (tx as unknown as typeof a)`update public.listing_form_drafts set snapshot=jsonb_set(snapshot,'{uploadedMediaIds}',jsonb_build_array(${media}::text)),revision=2,last_save_operation_id=${upload}::uuid where id=${draft}::uuid`;
    }
  });
  objects.set(f.incoming,PNG); if(options.ready!==false) objects.set(f.frozen,PNG);
  return f;
}
async function deselect(f:Photo) { await a`update public.listing_form_drafts set snapshot=jsonb_set(snapshot,'{uploadedMediaIds}','[]'),revision=revision+1 where id=${f.draft}::uuid`; }
async function listing(owner:string) {
  const id=randomUUID();
  await a`insert into public.listings(id,seller_id,title,material_type,total_sq_ft,ask_price_per_sq_ft,condition,status,last_confirmed_at,confirmation_due_at)
   values(${id}::uuid,${owner}::uuid,'Synthetic private photo lot','hardwood',1,0,'new_overstock','active',now(),now()+interval '1 day')`;
  return id;
}
async function publish(f:Photo, detach=false) {
  const id=await listing(f.owner);
  await a.begin(async tx=>{
    await (tx as unknown as typeof a)`update public.media set listing_id=${id}::uuid where id=${f.media}::uuid`;
    await (tx as unknown as typeof a)`update public.listing_form_drafts set state='published',published_listing_id=${id}::uuid,published_revision=revision,publication_fingerprint=repeat('b',64),revision=revision+1 where id=${f.draft}::uuid`;
  });
  if(detach) await a`update public.media set listing_id=null where id=${f.media}::uuid`;
  return id;
}
async function order(f:Photo, listingId:string, buyer:string) {
  const id=randomUUID();
  await a`insert into public.orders(id,order_number,buyer_id,seller_id,listing_id,quantity_sq_ft,price_per_sq_ft,subtotal,buyer_fee,seller_fee,total_price,seller_payout,original_seller_payout)
   values(${id}::uuid,${`PH-${id.slice(0,16)}`},${buyer}::uuid,${f.owner}::uuid,${listingId}::uuid,1,0,0,0,0,0,0,0)`;
  return id;
}
async function state(f:Photo) { const [r]=await b`select to_jsonb(u) value from public.listing_photo_uploads u where id=${f.upload}::uuid`; assert(r); return r.value as Record<string,unknown>; }
async function rejectSql(action:()=>PromiseLike<unknown>) { await assert.rejects(async()=>await action(), error=>Boolean(error && typeof error==='object' && 'code' in error && error.code==='23514')); }
const callsFor=(f:Photo)=>removals.filter(paths=>paths.includes(f.incoming));
async function remove(f:Photo) { return deletePrivateListingPhoto({database,uploadId:f.upload,ownerId:f.owner}); }
function testCase(name:string, body:()=>Promise<void>, timeout=20000) { it(name,async()=>{ try { await body(); proof.cases.push({name,passed:true}); } catch(error) { proof.cases.push({name,passed:false,error:error instanceof Error ? error.name : 'unknown'}); throw error; } },timeout); }

describe.skipIf(process.env.PRIVATE_PHOTO_LIFECYCLE_PROOF!=="1")("private photo access and durable cleanup, actual PostgreSQL",()=>{
 beforeAll(async()=>{
  assert.equal(process.env.PRIVATE_PHOTO_OTHER_FIXTURES_CLEANED,"1");
  const target=new URL(process.env.DATABASE_URL!);
  assert.deepEqual({host:target.hostname,port:target.port,user:target.username,password:target.password,search:target.search},{host:'127.0.0.1',port:'55439',user:'postgres',password:'',search:''});
  assert.match(target.pathname,/^\/pm_photo_lifecycle_[0-9a-f]{32}$/);
  const options={max:1,prepare:false,connect_timeout:3,connection:{statement_timeout:5000,lock_timeout:1500,application_name:'private-photo-lifecycle-proof'}};
  a=postgres(target.toString(),options); b=postgres(target.toString(),options);
  for(const connection of[a,b]) {
   const [r]=await connection`select current_database() name,current_user role,host(inet_server_addr()) address,inet_server_port() port,pg_backend_pid() pid,current_setting('session_replication_role') replication,current_setting('row_security') rls`;
   assert.equal(r.name,target.pathname.slice(1)); assert.equal(r.role,'postgres'); assert.equal(r.address,'127.0.0.1'); assert.equal(r.port,55439); assert.equal(r.replication,'origin'); assert.equal(r.rls,'on'); proof.connections.push(r.pid);
  }
  assert.notEqual(proof.connections[0],proof.connections[1]);
  const guards=await a`select tgname,tgenabled from pg_trigger where tgname in ('listing_photo_uploads_guard','media_listing_photo_guard','listing_photo_ready_consistency','media_listing_photo_consistency','listing_drafts_private_photo_guard','dispute_evidence_private_photo_guard')`;
  assert.equal(guards.length,6); assert(guards.every(row=>row.tgenabled==='O'));
  const checks=await a`select conname,convalidated from pg_constraint where conrelid in ('public.listing_photo_uploads'::regclass,'public.media'::regclass,'public.listing_form_drafts'::regclass)`;
  const legacyNotValidated=new Set(["media_one_parent_max_check","media_uploader_required_check","media_buyer_request_owner_lineage_fk","media_listing_owner_lineage_fk"]);
  assert(checks.length>0 && checks.every(row=>row.convalidated || legacyNotValidated.has(row.conname)));
  const [empty]=await a`select (select count(*)::int from public.listing_photo_uploads) uploads,(select count(*)::int from public.media where storage_provider='supabase_listing') media`;
  assert.equal(empty.uploads,0,'No overlapping private-photo fixtures');assert.equal(empty.media,0,'No overlapping private-photo media');
  original=await fingerprints(); proof.sourceBefore=sourceHashes();
  database=drizzle(a,{schema}); databaseB=drizzle(b,{schema}); bridge.database=database;
  bridge.storage={remove:async(paths:string[])=>{
   assert.equal(paths.length,2); for(const key of paths) assert(owned.has(key.split('/')[0]),'Non-fixture provider path denied');
   removals.push([...paths]); await onRemove?.(paths);
   if(removeFailure?.(paths)) return {data:null,error:new Error('Synthetic provider failure')};
   for(const key of paths) objects.delete(key);
   if(removeAcceptedThenUnknown?.(paths)) throw new Error('Synthetic accepted removal response lost');
   return {data:paths.map(name=>({name})),error:null};
  }};
  vi.stubGlobal('fetch',()=>{throw new Error('Network provider requests forbidden');});
 },30000);
 beforeEach(()=>{onRemove=null;removeFailure=null;removeAcceptedThenUnknown=null;});
 afterAll(async()=>{
  try {
   if(typeof a !== "undefined" && Object.keys(original).length){const after=await fingerprints(); for(const [table,hashes] of Object.entries(original)) {
    const remaining=[...(after[table]??[])]; for(const hash of hashes){const index=remaining.indexOf(hash); assert(index>=0,`Original row changed in ${table}`); remaining.splice(index,1);}
    if(remaining.length && !allowedAddedTables.has(table)) proof.unexpectedRows.push(table);
   } assert.deepEqual(proof.unexpectedRows,[]); proof.originalsPreserved=true;}
   proof.sourceAfter=sourceHashes(); assert.deepEqual(proof.sourceAfter,proof.sourceBefore);
  } finally {
   const output=process.env.PRIVATE_PHOTO_LIFECYCLE_PROOF_PATH; if(output){const resolved=path.resolve(output);assert(resolved.startsWith(path.resolve('tmp/journey10/private-listing-photos/read-cleanup-tests/proof')+path.sep));fs.mkdirSync(path.dirname(resolved),{recursive:true});fs.writeFileSync(resolved,JSON.stringify(proof,null,2));}
   if(a)await a.end({timeout:2});if(b)await b.end({timeout:2});bridge.database=null;bridge.storage=null;vi.unstubAllGlobals();
  }
 },30000);

 testCase('pending owner reads only its ready draft; anonymous and stranger do not',async()=>{
  const f=await photo(), stranger=await user(); const before=await state(f), calls=removals.length;
  assert.deepEqual(await read(f,actor(f.owner)),{mediaId:f.media,ownerId:f.owner,fileName:'flooring.png',mimeType:'image/png',fileSize:PNG.length,frozenPath:f.frozen});
  assert.equal(await read(f,null),null);assert.equal(await read(f,actor(stranger)),null);assert.deepEqual(await state(f),before);assert.equal(removals.length,calls);
 });
 testCase('missing malformed incomplete and UploadThing IDs are ordinary unavailable results',async()=>{
  const f=await photo({ready:false});
  for(const id of['not-a-uuid',randomUUID(),f.media])assert.equal(await authorizeListingPhotoRead(database,id,actor(f.owner)),null);
  const id=randomUUID();await a`insert into public.media(id,uploader_id,url,key) values(${id}::uuid,${f.owner}::uuid,'https://example.invalid/public.jpg',${`fixture-${id}`})`;
  assert.equal(await authorizeListingPhotoRead(database,id,actor(f.owner)),null);
 });
 testCase('fresh database identity denies deactivated owners and nonexistent actor IDs',async()=>{
  const f=await photo();const stale=actor(f.owner);await a`update public.users set active=false where id=${f.owner}::uuid`;
  assert.equal(await read(f,stale),null);assert.equal(await read(f,actor(randomUUID())),null);
 });
 testCase('admin private bypass requires AAL2 and cannot borrow territory override',async()=>{
  const f=await photo(), admin=await user('admin','verified');
  assert.equal(await read(f,actor(admin,'aal1')),null);assert.equal(await read(f,actor(admin,null)),null);assert.ok(await read(f,actor(admin,'aal2')));
  const id=await publish(f);await a`update public.listings set territory_mode='allowed_states',allowed_destination_states='["CO"]' where id=${id}::uuid`;
  assert.equal(await read(f,actor(admin,'aal1')),null);
 });
 testCase('public access uses actual current attachment freshness and trusted territory',async()=>{
  const f=await photo(),id=await publish(f), buyer=await user('buyer','verified','CO'),seller=await user('seller','verified','CO'),stranger=await user('buyer','verified','TX'),unverified=await user('buyer','pending','CO');
  assert.ok(await read(f,null));await a`update public.listings set territory_mode='allowed_states',allowed_destination_states='["CO"]' where id=${id}::uuid`;
  assert.ok(await read(f,actor(buyer)));assert.ok(await read(f,actor(seller)));assert.equal(await read(f,null),null);assert.equal(await read(f,actor(stranger)),null);assert.equal(await read(f,actor(unverified)),null);
  await a`update public.users set verification_status='pending',verified=false where id=${buyer}::uuid`;assert.equal(await read(f,actor(buyer)),null);
  await a`update public.listings set confirmation_due_at=now()-interval '1 second' where id=${id}::uuid`;assert.equal(await read(f,actor(seller)),null);
  await a`update public.listings set confirmation_due_at=now()+interval '1 day',last_confirmed_at=null where id=${id}::uuid`;assert.equal(await read(f,actor(seller)),null);
 });
 testCase('detached original published photos are participant-only even while original listing is public',async()=>{
  const f=await photo(),id=await publish(f,true), buyer=await user('seller','verified'),chatBuyer=await user('buyer','verified'),unrelated=await user('buyer','verified');
  await order(f,id,buyer);await a`insert into public.conversations(listing_id,buyer_id,seller_id) values(${id}::uuid,${chatBuyer}::uuid,${f.owner}::uuid)`;
  const other=await listing(f.owner);await order(f,other,unrelated);
  assert.equal(await read(f,null),null);assert.equal(await read(f,actor(unrelated)),null);assert.ok(await read(f,actor(buyer)));assert.ok(await read(f,actor(chatBuyer)));
  await a`update public.listings set status='archived',confirmation_due_at=now()-interval '1 day' where id=${id}::uuid`;
  assert.ok(await read(f,actor(buyer)));assert.ok(await read(f,actor(chatBuyer)));
 });
 testCase('editing selection, attached and detached published history are retained before storage',async()=>{
  for(const mode of['editing','attached','historical']){const f=await photo();if(mode!=='editing')await publish(f,mode==='historical');const before=await state(f);assert.equal(await remove(f),'retained');assert.deepEqual(await state(f),before);assert.equal(callsFor(f).length,0);}
 });
 testCase('uppercase UUID selections retain owned photos and cannot adopt another draft photo',async()=>{
  const f=await photo();await a`update public.listing_form_drafts set snapshot=jsonb_set(snapshot,'{uploadedMediaIds}',jsonb_build_array(${f.media.toUpperCase()}::text)),revision=revision+1 where id=${f.draft}::uuid`;
  assert.equal(await remove(f),'retained');assert.equal(callsFor(f).length,0);const other=await photo();
  await rejectSql(()=>b`update public.listing_form_drafts set snapshot=jsonb_set(snapshot,'{uploadedMediaIds}',jsonb_build_array(${f.media.toUpperCase()}::text)),revision=revision+1 where id=${other.draft}::uuid`);
 });
 testCase('uppercase original published selection remains historical participant evidence',async()=>{
  const f=await photo();await a`update public.listing_form_drafts set snapshot=jsonb_set(snapshot,'{uploadedMediaIds}',jsonb_build_array(${f.media.toUpperCase()}::text)),revision=revision+1 where id=${f.draft}::uuid`;
  const id=await publish(f,true),buyer=await user('buyer','verified');await order(f,id,buyer);assert.ok(await read(f,actor(buyer)));assert.equal(await read(f,null),null);assert.equal(await remove(f),'retained');
 });
 testCase('dispute evidence retains deselected private photo independently of publication',async()=>{
  const f=await photo();await deselect(f);const buyer=await user('buyer'),id=await listing(f.owner),orderId=await order(f,id,buyer),dispute=randomUUID();
  await a`insert into public.disputes(id,order_id,initiator_id,reason,description) values(${dispute}::uuid,${orderId}::uuid,${buyer}::uuid,'Synthetic','Synthetic retention proof')`;
  await a`insert into public.dispute_evidence(dispute_id,media_id,uploader_id,evidence_type) values(${dispute}::uuid,${f.media}::uuid,${f.owner}::uuid,'photo')`;
  assert.equal(await remove(f),'retained');assert.equal((await state(f)).deletion_requested_at,null);assert.equal(callsFor(f).length,0);
 });
 testCase('dispute evidence is private to its actual order parties even on a public listing',async()=>{
  const f=await photo(),id=await publish(f),buyer=await user('buyer'),chatOnly=await user('buyer','verified'),stranger=await user('buyer','verified');
  await a`insert into public.conversations(listing_id,buyer_id,seller_id) values(${id}::uuid,${chatOnly}::uuid,${f.owner}::uuid)`;
  const orderId=await order(f,id,buyer),dispute=randomUUID();
  await a`insert into public.disputes(id,order_id,initiator_id,reason,description) values(${dispute}::uuid,${orderId}::uuid,${buyer}::uuid,'Synthetic','Synthetic private evidence')`;
  await a`insert into public.dispute_evidence(dispute_id,media_id,uploader_id,evidence_type) values(${dispute}::uuid,${f.media}::uuid,${f.owner}::uuid,'photo')`;
  assert.equal(await read(f,null),null);assert.equal(await read(f,actor(stranger)),null);assert.equal(await read(f,actor(chatOnly)),null);assert.ok(await read(f,actor(buyer)));assert.ok(await read(f,actor(f.owner)));
  const draft=await photo();await deselect(draft);await a`insert into public.dispute_evidence(dispute_id,media_id,uploader_id,evidence_type) values(${dispute}::uuid,${draft.media}::uuid,${draft.owner}::uuid,'photo')`;
  assert.ok(await read(draft,actor(buyer)));assert.equal(await read(draft,actor(stranger)),null);
 });
 testCase('foreign owner narrowing cannot delete another owned photo',async()=>{
  const f=await photo();await deselect(f);const other=await user();assert.equal(await deletePrivateListingPhoto({database,uploadId:f.upload,ownerId:other}),'not_found');assert.equal(callsFor(f).length,0);assert.equal((await state(f)).deletion_requested_at,null);
 });
 testCase('durable intent is visible with SQL locks released before remove and prevents reselection',async()=>{
  const f=await photo();await deselect(f);const entered=deferred(),release=deferred();onRemove=async paths=>{if(paths.includes(f.incoming)){entered.resolve();await release.promise;}};
  const pending=remove(f).then(value=>({value}),error=>({error}));await Promise.race([entered.promise,pending.then(()=>{throw new Error('Ended before provider boundary');})]);
  try{const row=await state(f);assert.ok(row.deletion_requested_at);assert.equal(row.deleted_at,null);await b.begin(async tx=>{await (tx as unknown as typeof b)`select id from public.media where id=${f.media}::uuid for update nowait`;await (tx as unknown as typeof b)`select id from public.listing_photo_uploads where id=${f.upload}::uuid for update nowait`;});
   const [claim]=await b`select deletion_claim_token,deletion_claimed_at::text from public.media where id=${f.media}::uuid`;assert.equal(claim.deletion_claim_token,f.upload);assert.ok(claim.deletion_claimed_at);
   await rejectSql(()=>b`update public.listing_form_drafts set snapshot=jsonb_set(snapshot,'{uploadedMediaIds}',jsonb_build_array(${f.media}::text)),revision=revision+1 where id=${f.draft}::uuid`);assert.equal(await read(f,actor(f.owner)),null);
  }finally{release.resolve();}
  const outcome=await pending;assert(!('error'in outcome));assert.equal(outcome.value,'deleted');assert.ok((await state(f)).deleted_at);assert.deepEqual(callsFor(f).at(-1)!.sort(),[f.incoming,f.frozen].sort());
  const [retained]=await b`select count(*)::int count from public.media where id=${f.media}::uuid`;assert.equal(retained.count,1);
 });
 testCase('accepted deletion with lost response keeps intent and retries idempotently',async()=>{
  const f=await photo();await deselect(f);removeAcceptedThenUnknown=paths=>paths.includes(f.incoming);await assert.rejects(()=>remove(f));const unknown=await state(f);assert.ok(unknown.deletion_requested_at);assert.equal(unknown.deleted_at,null);assert.equal(await read(f,actor(f.owner)),null);assert(!objects.has(f.frozen));
  removeAcceptedThenUnknown=null;assert.equal(await remove(f),'deleted');const done=await state(f);assert.ok(done.deleted_at);for(const key of['id','owner_id','draft_id','ready_media_id','content_sha256','completed_revision','deletion_requested_at'])assert.deepEqual(done[key],unknown[key]);
 });
 testCase('provider rejection retains pending intent and both objects for retry',async()=>{
  const f=await photo();await deselect(f);removeFailure=paths=>paths.includes(f.incoming);await assert.rejects(()=>remove(f));assert.ok((await state(f)).deletion_requested_at);assert.equal((await state(f)).deleted_at,null);assert(objects.has(f.incoming)&&objects.has(f.frozen));removeFailure=null;assert.equal(await remove(f),'deleted');
 });
 testCase('SQL tombstone failure after accepted remove preserves committed intent for retry',async()=>{
  const f=await photo();await deselect(f);const name=`photo_fault_${randomUUID().replaceAll('-','')}`;assert.match(name,/^photo_fault_[0-9a-f]{32}$/);
  // Fault injection adds its own trigger; canonical guards remain enabled and unchanged.
  await a.unsafe(`create function public.${name}() returns trigger language plpgsql as $$ begin if new.id='${f.upload}'::uuid and new.deleted_at is not null and old.deleted_at is null then raise exception 'Synthetic tombstone fault' using errcode='23514'; end if; return new; end $$`);
  await a.unsafe(`create trigger ${name} before update on public.listing_photo_uploads for each row execute function public.${name}()`);
  try{await assert.rejects(()=>remove(f));const row=await state(f);assert.ok(row.deletion_requested_at);assert.equal(row.deleted_at,null);assert(!objects.has(f.incoming)&&!objects.has(f.frozen));assert.equal(await read(f,actor(f.owner)),null);}
  finally{await a.unsafe(`drop trigger ${name} on public.listing_photo_uploads`);await a.unsafe(`drop function public.${name}()`);}
  assert.equal(await remove(f),'deleted');assert.ok((await state(f)).deleted_at);
 });
 testCase('residue retries both paths and one of two workers owns the same due attempt',async()=>{
  const f=await photo();await deselect(f);await remove(f);objects.set(f.incoming,PNG);objects.set(f.frozen,PNG);const count=callsFor(f).length;
  await Promise.all([purgeDeletedListingPhotoResidue(database,{budgetMs:5000}),purgeDeletedListingPhotoResidue(databaseB,{budgetMs:5000})]);
  assert.equal(callsFor(f).length-count,1);assert(!objects.has(f.incoming)&&!objects.has(f.frozen));const [r]=await b`select residue_last_attempt_at::text attempt,residue_last_success_at::text success from public.listing_photo_uploads where id=${f.upload}::uuid`;assert(r.attempt);assert.equal(r.success,r.attempt);
  await purgeDeletedListingPhotoResidue(database,{budgetMs:5000});assert.equal(callsFor(f).length-count,1);
 });
 testCase('a stale residue response cannot certify a newer exact database timestamp claim',async()=>{
  const f=await photo();await deselect(f);await remove(f);let newer:string|undefined;
  onRemove=async paths=>{if(paths.includes(f.incoming)){const[r]=await b`update public.listing_photo_uploads set residue_last_attempt_at=clock_timestamp() where id=${f.upload}::uuid returning residue_last_attempt_at::text attempt`;newer=r.attempt;}};
  const result=await purgeDeletedListingPhotoResidue(database,{budgetMs:5000});assert(result.stale>=1);const[r]=await b`select residue_last_attempt_at::text attempt,residue_last_success_at::text success from public.listing_photo_uploads where id=${f.upload}::uuid`;assert.equal(r.attempt,newer);assert.equal(r.success,null);
 });
 testCase('a row-lock-stalled claim cannot begin provider work after cleanup budget expires',async()=>{
  const f=await photo();await deselect(f);await remove(f);const count=callsFor(f).length,locked=deferred(),release=deferred();
  const holding=b.begin(async tx=>{await (tx as unknown as typeof b)`select id from public.listing_photo_uploads where id=${f.upload}::uuid for update`;locked.resolve();await release.promise;});await locked.promise;
  try{const result=await purgeDeletedListingPhotoResidue(database,{budgetMs:50});assert.equal(result.budgetExhausted,true);assert.equal(callsFor(f).length,count);}
  finally{release.resolve();await holding;}
  // The single-connection queue is drained after releasing the real row lock.
  await a`select 1`;await new Promise(resolve=>setTimeout(resolve,10));assert.equal(callsFor(f).length,count);
 });
 testCase('abandoned cleanup continues after a provider failure and retries an already-admitted fresh intent',async()=>{
  const failing=await photo({ready:false,ageDays:8}),passing=await photo({ready:false,ageDays:8}),fresh=await photo();await deselect(fresh);
  removeFailure=paths=>paths.includes(fresh.incoming);await assert.rejects(()=>remove(fresh));assert.equal((await state(fresh)).deleted_at,null);
  removeFailure=paths=>paths.includes(failing.incoming);const result=await purgeAbandonedListingPhotos(database,{budgetMs:5000});assert(result.failed>=1);assert.ok((await state(passing)).deleted_at);assert.ok((await state(fresh)).deleted_at);assert.equal((await state(failing)).deleted_at,null);assert.ok((await state(failing)).deletion_requested_at);
  removeFailure=null;assert.equal(await remove(failing),'deleted');
 });
 testCase('seven-day abandonment skips fresh pending and selected ready, handles only old unretained intents',async()=>{
  const old=await photo({ready:false,ageDays:8}),fresh=await photo({ready:false}),selected=await photo();const result=await purgeAbandonedListingPhotos(database,{budgetMs:5000});assert(result.confirmed>=1);assert.ok((await state(old)).deleted_at);assert.equal((await state(fresh)).deletion_requested_at,null);assert.equal((await state(selected)).deletion_requested_at,null);assert.equal(callsFor(fresh).length,0);assert.equal(callsFor(selected).length,0);
 });
});
