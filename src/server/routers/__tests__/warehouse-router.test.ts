/* eslint-disable @typescript-eslint/no-explicit-any -- fluent database doubles exercise router authorization and write guards */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

process.env.SKIP_ENV_VALIDATION = "1";
process.env.DATABASE_URL ??=
  "postgresql://postgres:postgres@localhost:5432/plankmarket_test";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-test";
process.env.STRIPE_SECRET_KEY ??= "sk_test_123";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_123";
process.env.UPLOADTHING_TOKEN ??= "uploadthing-test";
process.env.UPSTASH_REDIS_REST_URL ??= "https://example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN ??= "upstash-token";
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= "anon-test";
process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??= "pk_test_123";

vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    async limit() {
      return { success: true };
    }
  },
}));

vi.mock("@/lib/redis/client", () => ({
  getRedisClient: () => ({}),
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  },
}));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { warehouseRouter } = await import("../warehouse");
const { PgDialect } = await import("drizzle-orm/pg-core");
const callerFactory=createCallerFactory(createTRPCRouter({warehouse:warehouseRouter}));
const sellerId="11111111-1111-4111-8111-111111111111", warehouseId="22222222-2222-4222-8222-222222222222", listingId="33333333-3333-4333-8333-333333333333";
const data={label:"Dock",address:"100 Main St",city:"Houston",state:"TX",zip:"77002",contactName:"Dock lead",phone:"5555550123",pickupStart:"08:00",pickupEnd:"16:00",hasLoadingDock:true,hasForklift:false,active:true,isDefault:false};
const existing={...data,id:warehouseId,sellerId,revision:1};
function context(db:unknown,role="seller") {return {db,authUser:{id:"auth-seller"},user:{id:sellerId,role,active:true,verificationStatus:"verified",businessName:"Seller",name:"Seller",proStatus:"active",proExpiresAt:null},supabase:{},clientIp:"127.0.0.1",getAuthAssurance:async()=>({currentLevel:"aal2",nextLevel:"aal2",recentVerificationSatisfied:true})} as Parameters<typeof callerFactory>[0];}
function database(pages:unknown[][]) {
 const predicates:unknown[]=[]; const writes:unknown[]=[];
 const select=vi.fn(()=>{const rows=pages.shift()??[];const q: Record<string, (...args: any[]) => any> ={from:()=>q,where:(p:unknown)=>{predicates.push(p);return q;},orderBy:()=>q,for:async()=>rows,limit:async()=>rows,then:(resolve:(r:unknown[])=>unknown)=>Promise.resolve(rows).then(resolve)};return q;});
 const update=vi.fn(()=>{const q: Record<string, (...args: any[]) => any> ={set:(value:unknown)=>{writes.push(value);return q;},where:()=>q,returning:async()=>[existing],then:(resolve:(r:unknown[])=>unknown)=>Promise.resolve([]).then(resolve)};return q;});
 const insert=vi.fn(()=>({values:(v:unknown)=>{writes.push(v);return {returning:async()=>[existing]};}}));
 const db: any ={select,update,insert,execute:vi.fn().mockResolvedValue([])};db.transaction=async(action:(tx:unknown)=>unknown)=>action(db);
 return {db,predicates,writes,select,update,insert};
}
describe("warehouse tenant and reservation guards",()=>{
 beforeEach(()=>vi.clearAllMocks());
 it("rejects buyer writes before database access",async()=>{
  const fake=database([]);await expect(callerFactory(context(fake.db,"buyer")).warehouse.save({data})).rejects.toThrow();expect(fake.select).not.toHaveBeenCalled();
 });
 it("scopes lookup to seller and refuses another seller's warehouse update",async()=>{
  const fake=database([[],[{id:sellerId}],[]]);
  await expect(callerFactory(context(fake.db)).warehouse.save({id:warehouseId,data})).rejects.toThrow("Warehouse not found");
  expect(fake.writes).toHaveLength(0);
  const query=new PgDialect().sqlToQuery(fake.predicates[2] as never);expect(query.params).toContain(sellerId);expect(query.params).toContain(warehouseId);
 });
 it("refuses another seller's warehouse assignment",async()=>{
  const fake=database([[{id:listingId,sellerId,warehouseId:null}],[{id:sellerId}],[]]);
  await expect(callerFactory(context(fake.db)).warehouse.assignListing({listingId,warehouseId})).rejects.toThrow("Active warehouse not found");expect(fake.writes).toHaveLength(0);
 });
 it("changes default inside same transaction after seller locking",async()=>{
  const fake=database([[],[{id:sellerId}],existing?[existing]:[]]);
  await callerFactory(context(fake.db)).warehouse.save({id:warehouseId,data:{...data,isDefault:true}});
  expect(fake.writes[0]).toMatchObject({isDefault:false});expect(fake.writes[1]).toMatchObject({isDefault:true,revision:1});
 });
 it.each([{address:"200 New Rd"},{pickupEnd:"17:00"},{hasForklift:true},{active:false}])("blocks origin or capability edits during reservation",async change=>{
  const fake=database([[{id:listingId}],[{id:sellerId}],[existing],[{id:"order"}]]);
  await expect(callerFactory(context(fake.db)).warehouse.save({id:warehouseId,data:{...data,...change}})).rejects.toThrow("reserved orders");expect(fake.writes).toHaveLength(0);
 });
 it("blocks reassignment during reservation",async()=>{
  const fake=database([[{id:listingId,sellerId,warehouseId:null}],[{id:sellerId}],[existing],[{id:"order"}]]);
  await expect(callerFactory(context(fake.db)).warehouse.assignListing({listingId,warehouseId})).rejects.toThrow("reserved orders");expect(fake.writes).toHaveLength(0);
 });
 it("derives approximate coordinates from ZIP and increments origin revision",async()=>{
  const fake=database([[],[{id:sellerId}],[existing]]);
  await callerFactory(context(fake.db)).warehouse.save({id:warehouseId,data:{...data,pickupEnd:"17:00"}});
  expect(fake.writes[0]).toMatchObject({revision:2,coordinateSource:"zip_centroid",latitude:expect.any(Number),longitude:expect.any(Number)});
 });
 it("rejects inverted hours and inactive default",async()=>{
  const fake=database([]);const caller=callerFactory(context(fake.db));
  await expect(caller.warehouse.save({data:{...data,pickupStart:"17:00",pickupEnd:"08:00"}})).rejects.toThrow();
  await expect(caller.warehouse.save({data:{...data,active:false,isDefault:true}})).rejects.toThrow();expect(fake.writes).toHaveLength(0);
 });
});
