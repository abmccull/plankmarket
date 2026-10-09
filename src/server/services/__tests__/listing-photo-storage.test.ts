// Preimplementation isolation contract: provider boundaries cannot be exercised against live storage.
// Failure modes: public/missing/misconfigured bucket, oversized/truncated reads, MIME mismatch,
// stalled bucket/transfer/read bodies, expired deadlines, uncertain removal and ordinary valid uploads.
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ policy:vi.fn(), create: vi.fn(), bucket: vi.fn(), signed: vi.fn(), copy: vi.fn(), download: vi.fn(), remove: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: f.create }));
vi.mock("@/server/db", () => ({db:{}}));
vi.mock("@/server/services/listing-photo-policy",()=>({assertListingPhotoStoragePolicy:f.policy}));
import { privateListingPhotoStorage, validateListingPhotoBytes } from "@/server/services/listing-photo-storage";

const MAX = 4 * 1024 * 1024;
const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
const goodBucket = { id:"listing-photos", public:false, file_size_limit:MAX, allowed_mime_types:["image/png","image/jpeg","image/webp"] };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z")); vi.clearAllMocks();
  f.policy.mockResolvedValue(undefined);
  f.bucket.mockResolvedValue({ data:goodBucket,error:null });
  f.signed.mockResolvedValue({data:{token:"synthetic"},error:null});
  f.copy.mockResolvedValue({data:{path:"ready"},error:null});
  f.download.mockResolvedValue({data:new Blob([png]),error:null});
  f.remove.mockResolvedValue({data:[],error:null});
  f.from.mockReturnValue({createSignedUploadUrl:f.signed,copy:f.copy,download:f.download,remove:f.remove});
  f.create.mockResolvedValue({storage:{getBucket:f.bucket,from:f.from}});
});
afterEach(() => vi.useRealTimers());
describe("private listing storage pre-code failure contract", () => {
  it("rejects missing client-denial policy before touching provider storage",async()=>{
    f.policy.mockRejectedValue(new Error("Storage policy missing"));
    await expect(privateListingPhotoStorage()).rejects.toThrow("Storage policy missing");
    expect(f.create).not.toHaveBeenCalled();
  });
  it("uses only the dedicated private bucket and disallows replacement on prepare", async () => {
    const s=await privateListingPhotoStorage();
    await s.createSignedUploadUrl("owned/incoming/id",{upsert:false});
    expect(f.bucket).toHaveBeenCalledWith("listing-photos"); expect(f.from).toHaveBeenCalledWith("listing-photos");
    expect(f.signed).toHaveBeenCalledWith("owned/incoming/id",{upsert:false});
  });
  it.each([
    {data:{...goodBucket,public:true},error:null}, {data:null,error:new Error("missing")},
    {data:{...goodBucket,file_size_limit:MAX+1},error:null}, {data:{...goodBucket,file_size_limit:null},error:null},
    {data:{...goodBucket,allowed_mime_types:null},error:null},
    {data:{...goodBucket,allowed_mime_types:[...goodBucket.allowed_mime_types,"image/svg+xml"]},error:null},
    {data:{...goodBucket,allowed_mime_types:["image/jpeg"]},error:null},
  ])("fails closed for bucket configuration %#", async result => {
    f.bucket.mockResolvedValue(result); await expect(privateListingPhotoStorage()).rejects.toThrow(); expect(f.from).not.toHaveBeenCalled();
  });
  it("uses one absolute deadline for the entire facade", async () => {
    const s=await privateListingPhotoStorage(); await vi.advanceTimersByTimeAsync(7900);
    f.copy.mockImplementation(()=>new Promise(()=>{}));
    const pending=expect(s.copy("incoming","ready")).rejects.toThrow(/time|respond/i);
    await vi.advanceTimersByTimeAsync(100); await pending;
    await expect(s.download("ready")).rejects.toThrow(); expect(f.download).not.toHaveBeenCalled();
  });
  it("bounds initialization itself", async () => {
    f.bucket.mockImplementation(()=>new Promise(()=>{})); const pending=expect(privateListingPhotoStorage()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(8000); await pending; expect(f.from).not.toHaveBeenCalled();
  });
  it("does not start provider work after an expired caller deadline", async () => {
    await expect(privateListingPhotoStorage({deadlineAt:Date.now()-1})).rejects.toThrow(); expect(f.create).not.toHaveBeenCalled();
  });
  it("rejects nonfinite deadlines", async () => {
    await expect(privateListingPhotoStorage({deadlineAt:NaN})).rejects.toThrow(); expect(f.create).not.toHaveBeenCalled();
  });
  it("bounds response body loading, not just provider headers", async () => {
    f.download.mockResolvedValue({data:{size:16,type:"image/png",arrayBuffer:()=>new Promise(()=>{})},error:null});
    const s=await privateListingPhotoStorage(); const pending=expect(s.download("ready")).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(8000); await pending;
  });
  it("rejects declared and actual oversized response bodies", async () => {
    const s=await privateListingPhotoStorage(); const body=vi.fn();
    f.download.mockResolvedValue({data:{size:MAX+1,arrayBuffer:body},error:null});
    await expect(s.download("ready")).rejects.toThrow(); expect(body).not.toHaveBeenCalled();
    body.mockResolvedValue(new ArrayBuffer(MAX+1));
    f.download.mockResolvedValue({data:{size:1,arrayBuffer:body},error:null});
    await expect(s.download("ready")).rejects.toThrow();
  });
  it("reports removal timeout as an unknown outcome for durable retry", async () => {
    f.remove.mockImplementation(()=>new Promise(()=>{})); const s=await privateListingPhotoStorage(); const pending=s.remove(["incoming","ready"]);
    await vi.advanceTimersByTimeAsync(8000); const result=await pending; expect(result.error).toBeTruthy(); expect(result.data).toBeNull();
  });
  it("returns the exact bounded downloaded bytes", async () => {
    const s=await privateListingPhotoStorage(); const result=await s.download("ready");
    expect(new Uint8Array(await result.data!.arrayBuffer())).toEqual(png);
  });
  it("checks actual size and signature against the expected permitted MIME", () => {
    expect(()=>validateListingPhotoBytes(png,png.length,"image/png")).not.toThrow();
    for(const [bytes,size,type] of [[png,1,"image/png"],[png,png.length,"image/jpeg"],[new Uint8Array(),0,"image/png"],[new TextEncoder().encode("<svg/>"),6,"image/svg+xml"],[new TextEncoder().encode("%PDF-1.7"),8,"application/pdf"]] as const) {
      expect(()=>validateListingPhotoBytes(bytes,size,type)).toThrow();
    }
  });
});
