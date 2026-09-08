/** @vitest-environment node */
import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({actor:{id:"owner",role:"buyer",active:true},document:{id:"11111111-1111-1111-1111-111111111111",userId:"owner",readyAt:new Date(),deletedAt:null,mimeType:"application/pdf",fileName:"license.pdf"},aal:"aal1",read:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:"auth"}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:state.aal},error:null})}}})}));
vi.mock("@/server/db",()=>({db:{query:{users:{findFirst:async()=>state.actor},verificationDocuments:{findFirst:async()=>state.document}}}}));
vi.mock("@/server/services/verification-documents",()=>({readPrivateVerificationDocument:state.read}));
import {GET} from "./route";
const request=()=>GET(new Request("https://app.example/api/verification-documents/11111111-1111-1111-1111-111111111111"),{params:Promise.resolve({id:state.document.id})});
describe("private verification downloads",()=>{
 beforeEach(()=>{state.actor={id:"owner",role:"buyer",active:true};state.aal="aal1";state.read.mockReset();state.read.mockResolvedValue({data:new Blob(["%PDF-1.7"],{type:"application/pdf"})});});
 it("denies another owner before storage access",async()=>{state.actor.id="other";expect((await request()).status).toBe(404);expect(state.read).not.toHaveBeenCalled();});
 it("requires reviewer AAL2",async()=>{state.actor={id:"reviewer",role:"admin",active:true};expect((await request()).status).toBe(403);expect(state.read).not.toHaveBeenCalled();});
 it("lets AAL2 reviewer download with private attachment headers",async()=>{state.actor={id:"reviewer",role:"admin",active:true};state.aal="aal2";const response=await request();expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("content-disposition")).toContain("attachment");});
 it("lets the owner download before business verification",async()=>expect((await request()).status).toBe(200));
});
