import { describe,it,expect,vi } from "vitest";
vi.mock("@/server/db",()=>({db:{}}));
vi.mock("@/lib/supabase/server",()=>({createServiceClient:vi.fn()}));
import { validateVerificationBytes, assertOwnedVerificationMetadata, assertVerificationUploadAccount, canPurgeAbandonedDocument } from "../verification-documents";
import { verificationDocumentId,verificationDocumentHref } from "@/lib/verification-documents";
describe("private verification documents",()=>{
 it("allows active unverified buyer and rejected seller upload entry",()=>{expect(()=>assertVerificationUploadAccount({role:"buyer",verificationStatus:"unverified"})).not.toThrow();expect(()=>assertVerificationUploadAccount({role:"seller",verificationStatus:"rejected"})).not.toThrow();});
 it("blocks upload after submission",()=>expect(()=>assertVerificationUploadAccount({role:"seller",verificationStatus:"pending"})).toThrow());
 it("never purges a referenced document and respects ready retention",()=>{const now=new Date("2026-09-10");expect(canPurgeAbandonedDocument({createdAt:new Date("2026-09-01"),readyAt:new Date(),referenced:true},now)).toBe(false);expect(canPurgeAbandonedDocument({createdAt:new Date("2026-09-09"),readyAt:new Date(),referenced:false},now)).toBe(false);expect(canPurgeAbandonedDocument({createdAt:new Date("2026-09-01"),readyAt:new Date(),referenced:false},now)).toBe(true);});
 it("rejects another account document even when finalized",()=>expect(()=>assertOwnedVerificationMetadata({userId:"other",readyAt:new Date(),deletedAt:null},"owner")).toThrow());
 it("rejects incomplete and deleted documents",()=>{expect(()=>assertOwnedVerificationMetadata({userId:"owner",readyAt:null,deletedAt:null},"owner")).toThrow();expect(()=>assertOwnedVerificationMetadata({userId:"owner",readyAt:new Date(),deletedAt:new Date()},"owner")).toThrow();});
 it("accepts only finalized owned metadata",()=>expect(()=>assertOwnedVerificationMetadata({userId:"owner",readyAt:new Date(),deletedAt:null},"owner")).not.toThrow());
 it("accepts a matching PDF signature",()=>expect(()=>validateVerificationBytes(new Uint8Array([37,80,68,70,45]),5,"application/pdf")).not.toThrow());
 it("rejects disguised HTML and mismatched MIME",()=>{expect(()=>validateVerificationBytes(new TextEncoder().encode("<html>"),6,"application/pdf")).toThrow();expect(()=>validateVerificationBytes(new Uint8Array([255,216,255]),3,"application/pdf")).toThrow();});
 it("rejects actual size mismatch",()=>expect(()=>validateVerificationBytes(new Uint8Array([255,216,255]),999,"image/jpeg")).toThrow());
 it("does not accept remote URLs as owned IDs",()=>expect(verificationDocumentId("https://example.com/document")).toBeNull());
 it("uses an authenticated download route, not storage URL",()=>expect(verificationDocumentHref("verification-document:11111111-1111-1111-1111-111111111111")).toBe("/api/verification-documents/11111111-1111-1111-1111-111111111111"));
});
