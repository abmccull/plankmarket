import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { createClient } from "@supabase/supabase-js";

const args=process.argv.slice(2);
const value=flag=>{const i=args.indexOf(flag);return i<0?null:args[i+1];};
const file=value("--file"),project=value("--project");
if(!file||!project||!/^[a-z0-9]{20}$/.test(project)) throw new Error("Pass --file ENV_FILE --project EXACT_PROJECT_REF. This command is read-only unless --apply is supplied.");
const environment=parse(readFileSync(file));
const url=new URL(environment.NEXT_PUBLIC_SUPABASE_URL);
if(url.protocol!=="https:"||url.hostname!==`${project}.supabase.co`||url.username||url.password||url.port||url.pathname!=="/") throw new Error("The explicit project does not match the Storage target.");
if(!environment.SUPABASE_SERVICE_ROLE_KEY) throw new Error("A service credential is required; it is never printed.");
const boundedFetch=(input,init={})=>fetch(input,{...init,signal:AbortSignal.any([...(init.signal?[init.signal]:[]),AbortSignal.timeout(8000)])});
const client=createClient(url.toString(),environment.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}});
const bucket="listing-photos";
const expected={public:false,fileSizeLimit:4194304,allowedMimeTypes:["image/jpeg","image/png","image/webp"]};
const matches=data=>data&&!data.public&&Number(data.file_size_limit)===expected.fileSizeLimit&&JSON.stringify([...(data.allowed_mime_types??[])].sort())===JSON.stringify([...expected.allowedMimeTypes].sort());
const current=await client.storage.getBucket(bucket);
if(current.data?.public) throw new Error("The existing photo bucket is public. Stop and investigate exposure before changing or adopting it.");
if(current.error && !(String(current.error.statusCode)==="404" || String(current.error.statusCode)==="400" && current.error.message==="Bucket not found")) throw new Error("The target bucket could not be inspected. No write was attempted.");
console.log(JSON.stringify({project,bucket,exists:Boolean(current.data),bucketContractMatches:Boolean(matches(current.data)),mode:args.includes("--apply")?"apply":"read-only"}));
if(args.includes("--apply")) {
  // An uncertain outcome must be reconciled by rerunning read-only, never by blind creation retry.
  const saved=current.data?await client.storage.updateBucket(bucket,expected):await client.storage.createBucket(bucket,expected);
  if(saved.error) throw new Error("Bucket provisioning was not confirmed. Inspect the exact target read-only before retrying.");
  const readback=await client.storage.getBucket(bucket);
  if(readback.error||!matches(readback.data)) throw new Error("Bucket readback does not prove the expected private constraints.");
  console.log("Bucket settings verified. This does not verify Storage RLS, signed uploads, application authorization or cleanup.");
}
console.log("The separate listing_photos_server_only restrictive policy and runtime catalog guard are required before private photo preparation can be enabled.");
