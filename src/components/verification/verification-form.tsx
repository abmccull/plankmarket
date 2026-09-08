"use client";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { trpc } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import { submitVerificationSchema, type SubmitVerificationInput } from "@/lib/validators/auth";
import { VERIFICATION_BUCKET, MAX_VERIFICATION_BYTES, VERIFICATION_MIME_TYPES, verificationDocumentId, verificationDocumentHref } from "@/lib/verification-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
const fields = [["businessWebsite","Business website"],["businessAddress","Business address"],["businessCity","City"],["businessState","State"],["businessZip","ZIP code"],["einTaxId","EIN (XX-XXXXXXX)"]] as const;
export function VerificationForm() {
  const profile=trpc.auth.getProfile.useQuery();
  const draft=trpc.auth.getVerificationDraft.useQuery();
  const utils=trpc.useUtils();
  const [version,setVersion]=useState<Date|null>(null);
  const [initialized,setInitialized]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [problem,setProblem]=useState<string|null>(null);
  const {register,handleSubmit,reset,setValue,watch,getValues,formState:{errors,isDirty}}=useForm<SubmitVerificationInput>({resolver:zodResolver(submitVerificationSchema)});
  useEffect(()=>{if (draft.data && !initialized) {reset(draft.data);setVersion(draft.data.updatedAt);setInitialized(true);}},[draft.data,initialized,reset]);
  const save=trpc.auth.saveVerificationDraft.useMutation();
  const submit=trpc.auth.submitVerificationDraft.useMutation();
  const prepare=trpc.verificationDocument.prepare.useMutation();
  const complete=trpc.verificationDocument.complete.useMutation();
  const document=watch("verificationDocUrl") ?? "";
  const busy=uploading||save.isPending||submit.isPending;
  async function persist() {
    const snapshot=getValues();
    const saved=await save.mutateAsync({...snapshot,currentStep:3,expectedUpdatedAt:version});
    setVersion(saved.updatedAt);reset(snapshot);return saved;
  }
  async function upload(file:File) {
    if (!(VERIFICATION_MIME_TYPES as readonly string[]).includes(file.type)||file.size>MAX_VERIFICATION_BYTES||!file.size) {setProblem("Choose a PDF, JPEG or PNG up to 10 MB.");return;}
    setUploading(true);setProblem(null);
    try {
      const intent=await prepare.mutateAsync({fileName:file.name,fileSize:file.size,mimeType:file.type as typeof VERIFICATION_MIME_TYPES[number]});
      const {error}=await createClient().storage.from(VERIFICATION_BUCKET).uploadToSignedUrl(intent.path,intent.token,file,{contentType:file.type});
      if(error) throw new Error("Upload failed. Your saved details are unchanged; try again.");
      const result=await complete.mutateAsync({id:intent.id});
      setValue("verificationDocUrl",result.reference,{shouldDirty:true,shouldValidate:true});
    } catch(error) {setProblem(error instanceof Error?error.message:"Upload failed");} finally {setUploading(false);}
  }
  if(profile.isLoading||draft.isLoading) return <p role="status">Loading your saved verification…</p>;
  if(profile.isError||draft.isError||!profile.data||!draft.data) return <section role="alert"><p>We could not load your saved verification. Your document and details are unchanged.</p><Button onClick={()=>void Promise.all([profile.refetch(),draft.refetch()])}>Retry</Button></section>;
  if(profile.data.verificationStatus==="pending"||profile.data.verificationStatus==="verified") return <section><h1 className="text-2xl font-semibold">Business verification</h1><p>{profile.data.verificationStatus==="verified"?"Your business is verified.":"Your documents are under review."}</p></section>;
  return <section className="max-w-xl space-y-4"><h1 className="text-2xl font-semibold">Business verification</h1><p>Save your details securely and return later. Upload one supporting document; only you and authorized reviewers can access it.</p>
    {problem&&<div role="alert" className="text-destructive"><p>{problem}</p>{save.error?.data?.code==="CONFLICT"&&<Button variant="outline" onClick={()=>void draft.refetch().then(result=>{if(result.data){reset(result.data);setVersion(result.data.updatedAt);setProblem(null);setInitialized(true);}})}>Reload saved version (discard these edits)</Button>}</div>}
    <form className="space-y-4" onSubmit={handleSubmit(async()=>{try {await persist();await submit.mutateAsync();await Promise.all([utils.auth.getProfile.invalidate(),utils.auth.getSession.invalidate()]);toast.success("Verification submitted for review");}catch(e){setProblem(e instanceof Error?e.message:"Could not submit");}})}>
      <fieldset disabled={busy} className="space-y-4">
      {fields.map(([name,label])=><div key={name}><Label htmlFor={name}>{label}{name==="businessWebsite"&&profile.data.role==="buyer"?" (optional)":""}</Label><Input id={name} {...register(name)} aria-invalid={!!errors[name]}/>{errors[name]&&<p role="alert" className="text-destructive">{errors[name]?.message}</p>}</div>)}
      <div><Label htmlFor="verification-file">Business license or supporting document</Label><Input id="verification-file" type="file" accept="application/pdf,image/jpeg,image/png" onChange={e=>{const file=e.target.files?.[0];if(file) void upload(file);e.target.value="";}}/><p className="text-sm">PDF, JPEG or PNG; maximum 10 MB.</p>{verificationDocumentId(document)&&<a href={verificationDocumentHref(document)} target="_blank" rel="noreferrer" className="underline">View uploaded document</a>}{errors.verificationDocUrl&&<p role="alert">Upload a supporting document.</p>}</div>
      <div className="flex gap-3"><Button type="button" variant="outline" disabled={!initialized||!isDirty} onClick={()=>void persist().then(()=>toast.success("Draft saved")).catch(e=>setProblem(e.message))}>Save draft</Button><Button type="submit" disabled={!initialized||!verificationDocumentId(document)}>Submit for review</Button></div>
      </fieldset>{uploading&&<p role="status">Uploading and checking your document…</p>}
    </form></section>;
}
