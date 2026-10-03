"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { z } from "zod";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { trpc } from "@/lib/trpc/client";
import { createClient } from "@/lib/supabase/client";
import { RESALE_ATTESTATION, TEXAS_RESALE_STATEMENT } from "@/lib/resale-exemption";
import { resaleSubmissionSchema } from "@/lib/validators/resale";
import { VERIFICATION_BUCKET, MAX_VERIFICATION_BYTES, VERIFICATION_MIME_TYPES, verificationDocumentHref } from "@/lib/verification-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type ResaleSetupProps = { initialState?: string; onSubmitted?: () => void };
export function ResaleSetup(props: ResaleSetupProps) {
  const accountId = useAuthStore((state) => state.user?.id);
  const profile = trpc.auth.getProfile.useQuery();
  if (!accountId) return <p role="status">Loading resale purchasing…</p>;
  if (!profile.data || profile.data.id !== accountId) return <div role="status"><p>Checking your resale account details…</p><Button disabled={profile.isFetching} onClick={() => void profile.refetch()}>Retry account details</Button></div>;
  return <ResaleAccount key={accountId + ":" + (props.initialState ?? "").toUpperCase()} {...props} accountId={accountId} initialProfile={profile.data} />;
}
function ResaleAccount({ initialState = "", onSubmitted, accountId, initialProfile }: ResaleSetupProps & { accountId: string; initialProfile: inferRouterOutputs<AppRouter>["auth"]["getProfile"] }) {
  const [buyerDefaults] = useState(initialProfile);
  const [fieldsDraft, setFieldsDraft] = useState<Record<string, string>>({});
  const [attested, setAttested] = useState(false);
  const active = useRef(true);
  const working = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const current = () => active.current && useAuthStore.getState().user?.id === accountId;
  const profile = trpc.auth.getProfile.useQuery();
  const query = trpc.resale.list.useQuery();
  const utils = trpc.useUtils();
  const [certificatesChecked, setCertificatesChecked] = useState(false);
  const refetchCertificates = query.refetch;
  const loadCertificates = useCallback(async () => {
    const result = await refetchCertificates();
    if (result.error || !result.data) throw new Error("Certificate status is unavailable");
    if (active.current && useAuthStore.getState().user?.id === accountId) setCertificatesChecked(true);
    return result;
  }, [accountId, refetchCertificates]);
  useEffect(() => {
    let mounted = true;
    void utils.resale.list.cancel().then(() => {
      if (!mounted || useAuthStore.getState().user?.id !== accountId) return;
      return loadCertificates();
    }).catch(() => { /* The query renders a retry state. */ });
    return () => { mounted = false; };
  }, [accountId, loadCertificates, utils]);

  const submit = trpc.resale.submit.useMutation();
  const prepare = trpc.verificationDocument.prepare.useMutation();
  const complete = trpc.verificationDocument.complete.useMutation();
  const [state, setState] = useState(initialState.toUpperCase());
  const [format, setFormat] = useState<"upload" | "texas_electronic">("upload");
  const [document, setDocument] = useState<{ id: string; reference: string; fileName: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [submitted, setSubmitted] = useState(false);
  const [retryPayload, setRetryPayload] = useState<z.infer<typeof resaleSubmissionSchema> | null>(null);
  const rule = query.data?.rules.find(r => r.state === state);
  const busy = uploading || submit.isPending;
  async function upload(file: File) {
    if (!current() || working.current || query.isError || profile.isError || profile.data?.id !== accountId) return;
    if (!(VERIFICATION_MIME_TYPES as readonly string[]).includes(file.type) || !file.size || file.size > MAX_VERIFICATION_BYTES) { setProblem("Choose a PDF, JPEG or PNG up to 10 MB."); return; }
    working.current = true; setUploading(true); setProblem(null);
    try {
      const intent = await prepare.mutateAsync({ purpose: "resale_certificate", fileName: file.name, fileSize: file.size, mimeType: file.type as typeof VERIFICATION_MIME_TYPES[number] });
      if (!current()) return;
      const { error } = await createClient().storage.from(VERIFICATION_BUCKET).uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });
      if (error) throw new Error("Upload failed. Try the file again.");
      if (!current()) return;
      const result = await complete.mutateAsync({ id: intent.id });
      if (current()) setDocument({ id: intent.id, ...result });
    } catch (e) { if (current()) setProblem(e instanceof Error ? e.message : "Could not upload certificate"); } finally { working.current = false; if (current()) setUploading(false); }
  }
  async function send(payload: z.infer<typeof resaleSubmissionSchema>) {
    if (!current() || working.current || query.isError || profile.isError || profile.data?.id !== accountId) return;
    working.current = true; setProblem(null); setRetryPayload(payload);
    try {
      await submit.mutateAsync(payload);
      if (!current()) return;
      setRetryPayload(null); setSubmitted(true); setRequestId(crypto.randomUUID()); setDocument(null);
      await Promise.all([utils.resale.list.invalidate(), utils.resale.eligibility.invalidate()]).catch(() => { if (current()) setProblem("Your certificate was submitted, but the list could not refresh. Check its status before adding another."); });
      if (!current()) return;
      toast.success("Certificate submitted for review"); onSubmitted?.();
    } catch (e) {
      if (current()) setProblem(e instanceof Error ? e.message : "Could not confirm submission. Retry to check the same submission.");
      // Keep the exact payload for response-loss recovery; never silently create a duplicate.
    } finally { working.current = false; }
  }
  if (query.isLoading || profile.isLoading || (!certificatesChecked && !query.isError)) return <p role="status">Loading resale purchasing…</p>;
  if (query.error || profile.error || !profile.data || profile.data.id !== accountId || !query.data || !certificatesChecked) return <div role="alert"><p>{submitted ? "Your certificate was submitted. We couldn’t refresh its status; retry the status check before adding another certificate." : "We couldn’t check your certificates. Your entered details are kept on this page. Retry before submitting."}</p><Button disabled={query.isFetching || profile.isFetching} onClick={() => void Promise.all([loadCertificates(), profile.refetch()]).catch(() => { /* Required reads still show the error. */ })}>Retry certificate status</Button></div>;
  const buyer = buyerDefaults;
  const fields = [
    ["legalName", "Legal business name", buyer.businessName ?? ""], ["address", "Business street address", buyer.businessAddress ?? ""],
    ["city", "City", buyer.businessCity ?? ""], ["businessState", "Business state (two letters)", buyer.businessState ?? ""], ["zip", "ZIP code", buyer.businessZip ?? ""],
    ["phone", "Business phone", buyer.phone ?? ""], ["permitState", "Permit state (two letters)", buyer.businessState ?? ""], ["permitNumber", "Sales-tax permit number", ""],
    ["businessDescription", "Type of business", ""], ["itemsDescription", "Goods purchased for resale", "Flooring inventory"],
    ["signerName", "Your full name / electronic signature", buyer.name ?? ""], ["signerTitle", "Your title", ""],
  ] as const;
  return <div className="space-y-6">
    <p className="text-sm text-muted-foreground">Set up once for eligible repeat purchases. A permit alone is not a resale certificate. You can continue purchasing with applicable tax while a certificate is reviewed.</p>
    {query.data.certificates.length > 0 && <ul className="divide-y rounded-md border">{query.data.certificates.map(c => {
      const currentRule = query.data.rules.find(r => r.state === c.state);
      const status = c.status === "approved" && c.expiresAt && new Date(c.expiresAt) <= new Date() ? "Expired — add a replacement" : c.status === "approved" && (!currentRule || currentRule.revision !== c.ruleRevision) ? "Needs renewed review" : c.status;
      return <li key={c.id} className="space-y-1 p-3 text-sm"><p className="font-medium">{c.state} · <span className="capitalize">{status}</span></p><p>{c.data.legalName} · Submitted {new Date(c.createdAt).toLocaleDateString()}</p>{c.expiresAt && <p>Valid until {new Date(c.expiresAt).toLocaleDateString()}</p>}{c.reviewNote && <p>{c.reviewNote}</p>}{c.documentId && <a className="underline" href={verificationDocumentHref(`verification-document:${c.documentId}`)} target="_blank" rel="noreferrer">View certificate</a>}{!c.documentId && <details><summary className="cursor-pointer">View signed declaration</summary><p className="mt-2">{c.data.texasStatement}</p><p>{c.data.attestation}</p><p>Signed by {c.data.signerName}, {c.data.signerTitle}, {c.data.signedAt}</p></details>}</li>;
    })}</ul>}
    {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
    {submitted ? <div role="status" className="space-y-3"><p>Your certificate is saved for review. Applicable tax remains until approval.</p><Button variant="outline" onClick={() => { setSubmitted(false); setAttested(false); setFieldsDraft({}); }}>Add another certificate</Button></div> : query.data.rules.length === 0 ? <p className="text-sm">Resale setup is being prepared. No paperwork is needed to browse or build an order.</p> : <form className="space-y-4" onSubmit={e => {
      e.preventDefault(); if (retryPayload) { void send(retryPayload); return; }
      const data = Object.fromEntries(new FormData(e.currentTarget));
      const parsed = resaleSubmissionSchema.safeParse({ ...data, requestId, state, ruleRevision: rule?.revision, format, documentId: format === "upload" ? document?.id ?? null : null, attested: data.attested === "on" });
      if (!parsed.success) { setProblem(parsed.error.issues[0]?.message ?? "Check the form"); return; }
      void send(parsed.data);
    }}>
      <fieldset disabled={busy || !!retryPayload} className="space-y-4">
        <div><Label htmlFor="resale-state">State where purchases will be delivered</Label><select id="resale-state" required value={state} onChange={e => { setState(e.target.value); setFormat("upload"); setAttested(false); }} className="h-11 w-full rounded-md border bg-background px-3"><option value="">Choose a state</option>{query.data.rules.map(r => <option key={r.state} value={r.state}>{r.state}</option>)}</select></div>
        {rule && <><p className="text-sm">Certificate recipient: {rule.recipientName}, {rule.recipientAddress}</p>
          <div><Label htmlFor="resale-format">Certificate method</Label><select id="resale-format" value={format} onChange={e => { setFormat(e.target.value as typeof format); setAttested(false); }} className="h-11 w-full rounded-md border bg-background px-3"><option value="upload">Upload a signed certificate</option>{rule.electronicTexas && <option value="texas_electronic">Complete a Texas resale certificate here</option>}</select></div>
          {format === "upload" && <div><Label htmlFor="resale-file">Completed resale certificate</Label><Input id="resale-file" type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => { if (e.target.files?.[0]) void upload(e.target.files[0]); e.target.value = ""; }} /><p className="text-xs text-muted-foreground">PDF, JPEG or PNG, up to 10 MB. Upload the completed certificate, not just your permit.</p>{document && <p role="status">Ready: {document.fileName}</p>}</div>}
          <div className="grid gap-4 sm:grid-cols-2">{fields.map(([name, label, value]) => <div key={name}><Label htmlFor={`resale-${name}`}>{label}</Label><Input id={`resale-${name}`} name={name} required value={fieldsDraft[name] ?? value} onChange={event => setFieldsDraft(current => ({ ...current, [name]: event.target.value }))} maxLength={name.endsWith("Description") ? 1000 : 500} /></div>)}</div>
          {format === "texas_electronic" && <p className="text-sm">{TEXAS_RESALE_STATEMENT}</p>}
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="attested" required checked={attested} onChange={event => setAttested(event.target.checked)} className="mt-1 size-5 shrink-0" /><span>{RESALE_ATTESTATION} By entering my name and submitting, I agree to sign this declaration electronically.</span></label>
        </>}
      </fieldset>
      {uploading && <p role="status">Uploading and securing your certificate…</p>}
      <Button type="submit" disabled={!rule || busy}>{submit.isPending ? "Saving…" : retryPayload ? "Retry saved submission" : "Submit certificate"}</Button>
      {retryPayload && !busy && <Button type="button" variant="outline" className="ml-2" onClick={() => { setRetryPayload(null); setRequestId(crypto.randomUUID()); }}>Edit and submit a new version</Button>}
    </form>}
  </div>;
}
