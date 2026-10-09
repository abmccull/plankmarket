"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import type { SellerActivationView } from "@/server/services/seller-activation";
import type { SellerActivationDraftInput } from "@/lib/validators/seller-activation";
import { submitVerificationSchema } from "@/lib/validators/auth";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createClient } from "@/lib/supabase/client";
import { buyerVerificationHref, getBuyerContinuation } from "@/lib/auth/buyer-continuation";
import { MAX_VERIFICATION_BYTES, VERIFICATION_BUCKET, VERIFICATION_MIME_TYPES, verificationDocumentHref, verificationDocumentId } from "@/lib/verification-documents";
import { refreshActivationAccount } from "@/lib/auth/activation-session-refresh";
import { activationDraftBinding, isCurrentActivationOwner, readActivationDraft, rememberActivationDraft, type ActivationDraft, type ActivationDraftBinding } from "@/lib/auth/activation-draft-memory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState, StatePanelLoading } from "@/components/ui/state-panel";

type View = SellerActivationView;
type Application = NonNullable<View["application"]>;
type Evidence = NonNullable<View["reusableEvidence"]["document"]>;
type Uncertain = "save" | "submit" | null;
const message = (error: unknown) => error instanceof Error ? error.message : "We could not confirm this request. Check the saved application before continuing.";
const code = (error: unknown) => error && typeof error === "object" && "data" in error && error.data && typeof error.data === "object" && "code" in error.data ? error.data.code : undefined;
const definiteFailure = (error: unknown) => ["BAD_REQUEST", "FORBIDDEN", "UNAUTHORIZED", "PRECONDITION_FAILED", "TOO_MANY_REQUESTS"].includes(String(code(error)));

export function SellerActivationForm() {
  const user = useAuthStore(state => state.user);
  const loading = useAuthStore(state => state.isLoading);
  const params = useSearchParams();
  if (loading) return <StatePanelLoading label="Loading selling setup" rows={3} />;
  if (!user) return <section className="max-w-2xl space-y-4"><h1 className="text-2xl font-semibold">Sign in to start selling</h1><Link className="underline" href="/login?redirect=%2Fsettings%2Fselling">Sign in again</Link></section>;
  const binding = activationDraftBinding(user.id);
  return <OwnedApplication key={`${user.id}:${binding.generation}`} ownerId={user.id} binding={binding} returnPath={params.get("redirect")} />;
}

function OwnedApplication({ ownerId, binding, returnPath }: { ownerId: string; binding: ActivationDraftBinding; returnPath: string | null }) {
  const utils = trpc.useUtils();
  const cache = useQueryClient();
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const current = () => mounted.current && isCurrentActivationOwner(binding);
  const key = [...getQueryKey(trpc.sellerActivation.get, undefined, "query"), { ownerId, generation: binding.generation }];
  const query = useQuery({ queryKey: key, retry: false, staleTime: 0, gcTime: 0, refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const next = await utils.client.sellerActivation.get.query(undefined, { signal });
      if (signal.aborted || !current() || next.ownerId !== ownerId) throw new Error("Account changed");
      return next;
    },
  });
  const [accepted, setAccepted] = useState<View | null>(null);
  if (!query.isFetching && !query.isError && query.isFetchedAfterMount && query.data?.ownerId === ownerId && accepted !== query.data) setAccepted(query.data);
  async function refresh() {
    const result = await query.refetch({ cancelRefetch: true });
    if (result.error || !result.data || result.data.ownerId !== ownerId || !current()) throw new Error("Your saved application could not be checked. Try again.");
    return result.data;
  }
  function accept(next: View) {
    if (!current() || next.ownerId !== ownerId) throw new Error("Account changed");
    cache.setQueryData(key, next); setAccepted(next);
  }
  if (!accepted && (!query.isFetchedAfterMount || query.isPending || query.isFetching)) return <StatePanelLoading label="Loading selling setup" rows={3} />;
  if (!accepted) return <QueryErrorState title="Selling setup unavailable" description="We could not load your saved application. Retry before editing it." onRetry={() => void query.refetch()} isRetrying={query.isFetching} />;
  return <ApplicationEditor ownerId={ownerId} binding={binding} view={accepted} unavailable={query.isError} reading={query.isFetching} refresh={refresh} accept={accept} returnPath={returnPath} />;
}

function ApplicationEditor({ ownerId, binding, view, unavailable, reading, refresh, accept, returnPath }: {
  ownerId: string; binding: ActivationDraftBinding; view: View; unavailable: boolean; reading: boolean; refresh: () => Promise<View>; accept: (next: View) => void; returnPath: string | null;
}) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const user = useAuthStore(state => state.user);
  const save = trpc.sellerActivation.saveDraft.useMutation({ retry: false });
  const submit = trpc.sellerActivation.submit.useMutation({ retry: false });
  const reconcile = trpc.sellerActivation.reconcile.useMutation({ retry: false });
  const prepare = trpc.verificationDocument.prepare.useMutation({ retry: false });
  const complete = trpc.verificationDocument.complete.useMutation({ retry: false });
  const mounted = useRef(false), working = useRef(false);
  const [restored] = useState(() => readActivationDraft(binding, view));
  const basis = useRef<Application | null>(restored ? restored.basis : view.application);
  const observed = useRef<ActivationDraft["observed"]>(restored ? restored.observed : view.application);
  const requestId = useRef(restored?.requestId ?? view.application?.requestId ?? "");
  const [website, setWebsite] = useState(restored?.website ?? (view.application ? view.application.businessWebsite ?? "" : view.currentBusiness.businessWebsite ?? ""));
  const [ein, setEin] = useState(restored?.ein ?? "");
  const [document, setDocument] = useState<Evidence | null>(view.application?.document ?? view.reusableEvidence.document);
  const [dirty, setDirty] = useState(restored?.dirty ?? false);
  const [replacing, setReplacing] = useState(restored?.replacing ?? false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(restored?.uncertain ? "Your unsaved changes are kept. Check the saved application before continuing." : null);
  const [notice, setNotice] = useState<string | null>(restored ? "Your unsaved changes were restored in this tab." : null);
  const [uncertain, setUncertain] = useState<Uncertain>(restored?.uncertain ?? null);
  const [checked, setChecked] = useState<View | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ website?: string; ein?: string }>({});
  const latest = useRef(view); latest.current = view;
  const current = () => mounted.current && isCurrentActivationOwner(binding);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const pendingWrite = useRef<Uncertain>(null);
  const snapshot = useRef<ActivationDraft>({ basis: basis.current, observed: observed.current, requestId: requestId.current, website, ein, dirty, replacing, uncertain });
  // Publish committed input before a native history traversal can unmount it.
  // Acknowledgements also clear memory synchronously, before another navigation.
  useLayoutEffect(() => {
    snapshot.current = { basis: basis.current, observed: observed.current, requestId: requestId.current, website, ein, dirty, replacing, uncertain: pendingWrite.current ?? uncertain };
    rememberActivationDraft(binding, dirty || replacing || snapshot.current.uncertain ? snapshot.current : null);
  });
  function markPending(kind: Exclude<Uncertain, null>) {
    pendingWrite.current = kind;
    snapshot.current = { ...snapshot.current, basis: basis.current, observed: observed.current, requestId: requestId.current, uncertain: kind };
    rememberActivationDraft(binding, snapshot.current);
  }

  function hydrate(next: View) {
    latest.current = next;
    basis.current = next.application; requestId.current = next.application?.requestId ?? requestId.current;
    observed.current = next.application; pendingWrite.current = null;
    setWebsite(next.application ? next.application.businessWebsite ?? "" : next.currentBusiness.businessWebsite ?? ""); setEin("");
    setDocument(next.application?.document ?? next.reusableEvidence.document);
    setDirty(false); setReplacing(false); setUncertain(null); setChecked(null);
    setFieldErrors({});
    snapshot.current = { basis: next.application, observed: next.application, requestId: requestId.current, website: next.application ? next.application.businessWebsite ?? "" : next.currentBusiness.businessWebsite ?? "", ein: "", dirty: false, replacing: false, uncertain: null };
    rememberActivationDraft(binding, null);
  }
  // The initial owner-keyed form stays mounted on read failure. Background reads
  // may refresh clean fields, but can never reset dirty input or an unknown save.
  const seen = useRef(view);
  useEffect(() => {
    if (seen.current === view || !current()) return;
    seen.current = view;
    if (working.current || uncertain || replacing) return;
    if (!dirty) hydrate(view);
    else if (view.application?.revision !== basis.current?.revision || view.application?.id !== basis.current?.id) {
      setUncertain("save"); setProblem("Your saved application changed. Your unsaved changes are kept; check the latest version before saving.");
    }
    // Changes to local form state must not re-adopt the same server snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (!dirty && !busy && !uncertain) return;
    const leave = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.target === "_blank") return;
      if (new URL(anchor.href).origin !== window.location.origin) return;
      if (!window.confirm(busy || uncertain ? "This request may still finish. Leave and check its saved status when you return?" : "Your unsaved changes will stay in this tab. Leave selling setup?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.document.addEventListener("click", leave, true);
    return () => { window.document.removeEventListener("click", leave, true); };
  }, [dirty, busy, uncertain]);

  const application = view.application;
  const active = view.sellerAccessActive && user?.id === ownerId && user.role === "seller" && user.verified && user.verificationStatus === "verified";
  const editable = view.currentBusiness.active && view.currentBusiness.role === "buyer" && (replacing || !application || application.canEdit);
  const hasEin = Boolean(ein.trim()) || (!replacing && Boolean(application?.hasEin)) || view.reusableEvidence.hasEin;
  const last4 = (!replacing && application?.einLast4) || view.reusableEvidence.einLast4;
  const continuation = getBuyerContinuation(returnPath);
  const blocked = Boolean(busy || unavailable || reading || uncertain);

  async function run(label: string, task: () => Promise<void>) {
    if (!current() || working.current) return;
    working.current = true; setBusy(label); setProblem(null); setNotice(null);
    try { await task(); }
    catch (error) { if (current()) setProblem(message(error)); }
    finally { working.current = false; if (current()) { pendingWrite.current = null; setBusy(null); } }
  }
  async function persist(overrides?: { documentId: string }) {
    if (!current()) throw new Error("Account changed");
    requestId.current ||= crypto.randomUUID();
    const input: SellerActivationDraftInput = {
      requestId: requestId.current, expectedRevision: replacing ? null : basis.current?.revision ?? null,
      businessWebsite: website, documentId: overrides?.documentId ?? document?.id ?? null,
      ...(ein ? { einTaxId: ein } : {}),
    };
    try {
      markPending("save");
      const next = await save.mutateAsync(input);
      if (!current() || next.ownerId !== ownerId || next.application?.requestId !== input.requestId) throw new Error("Account changed");
      const observed = latest.current.application;
      if (observed && observed.id === next.application.id && observed.revision > next.application.revision) throw new Error("A newer saved application is available. Check it before continuing.");
      accept(next); hydrate(next); return next;
    } catch (error) {
      if (current() && !definiteFailure(error)) { setUncertain("save"); setChecked(null); }
      throw error;
    }
  }
  function saveDraft() {
    if (!editable || blocked) return;
    void run("Saving…", async () => { await persist(); if (current()) setNotice("Draft saved. You can return to this page later."); });
  }
  function submitApplication() {
    if (!editable || blocked || !view.currentBusiness.verified) return;
    const websiteCheck = submitVerificationSchema.shape.businessWebsite.safeParse(website);
    const einCheck = ein ? submitVerificationSchema.shape.einTaxId.safeParse(ein) : null;
    const errors = { website: websiteCheck.success ? undefined : websiteCheck.error.issues[0]?.message,
      ein: !einCheck || einCheck.success ? undefined : einCheck.error.issues[0]?.message };
    setFieldErrors(errors);
    if (errors.website || errors.ein) { window.document.getElementById(errors.website ? "selling-website" : "selling-ein")?.focus(); return; }
    void run("Submitting…", async () => {
      const next = dirty || !basis.current || replacing ? await persist() : latest.current;
      if (!current()) return;
      const captured = next.application;
      if (!captured?.canSubmit) throw new Error("Complete the website, EIN and supporting document before submitting.");
      try {
        markPending("submit");
        const submitted = await submit.mutateAsync({ requestId: captured.requestId, expectedRevision: captured.revision });
        if (!current() || submitted.ownerId !== ownerId || submitted.application?.requestId !== captured.requestId) return;
        accept(submitted); hydrate(submitted); setNotice("Your seller application was submitted for review.");
      } catch (error) {
        if (current() && !definiteFailure(error)) setUncertain("submit");
        throw error;
      }
    });
  }
  function upload(file: File) {
    if (!editable || blocked) return;
    if (!(VERIFICATION_MIME_TYPES as readonly string[]).includes(file.type) || file.size <= 0 || file.size > MAX_VERIFICATION_BYTES) {
      setProblem("Choose a PDF, JPEG or PNG up to 10 MB."); return;
    }
    void run("Uploading and checking your document…", async () => {
      const saved = await persist();
      const captured = saved.application;
      if (!captured?.canEdit || !current()) return;
      const stillOwned = () => {
        const observed = latest.current.application;
        return current() && basis.current?.id === captured.id && basis.current.revision === captured.revision && basis.current.canEdit &&
          observed?.id === captured.id && observed.revision === captured.revision && observed.canEdit;
      };
      markPending("save");
      const intent = await prepare.mutateAsync({ purpose: "seller_activation", fileName: file.name, fileSize: file.size, mimeType: file.type as typeof VERIFICATION_MIME_TYPES[number] });
      if (!stillOwned()) return;
      const uploaded = await createClient().storage.from(VERIFICATION_BUCKET).uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });
      if (uploaded.error) throw new Error("Document upload failed. Your saved details are unchanged; choose the file again.");
      if (!stillOwned()) return;
      const completed = await complete.mutateAsync({ id: intent.id });
      if (!stillOwned()) return;
      const id = verificationDocumentId(completed.reference);
      if (!id || id !== intent.id) throw new Error("The document could not be confirmed. Choose it again.");
      // Do not use pre-upload closed-over EIN/website after its acknowledged save.
      try {
        const next = await save.mutateAsync({ requestId: captured.requestId, expectedRevision: captured.revision, documentId: id });
        if (!stillOwned() || next.ownerId !== ownerId || next.application?.id !== captured.id) return;
        accept(next); hydrate(next); setNotice("Document uploaded and saved privately.");
      } catch (error) { if (current() && !definiteFailure(error)) setUncertain("save"); throw error; }
    });
  }
  function checkSaved() {
    void run("Checking saved application…", async () => {
      const next = await refresh(); if (!current()) return;
      if (uncertain === "submit" || (next.application && !next.application.canEdit)) {
        if (uncertain === "submit" && next.application?.status === "draft") {
          setChecked(next); setUncertain("save"); setProblem("No submitted receipt was found. Review the saved application before another attempt.");
        } else { accept(next); hydrate(next); }
      } else { setChecked(next); setProblem("Review the saved details before continuing. A masked EIN does not confirm which entered value was saved."); }
    });
  }
  async function accountRefresh() {
    if (!current()) return;
    setRefreshFailed(false);
    try {
      await refreshActivationAccount({ ownerId, current, readSession: () => utils.auth.getSession.fetch(undefined, { staleTime: 0 }) });
      if (current()) { await utils.auth.getProfile.invalidate(); router.refresh(); }
    } catch (error) { if (current()) setRefreshFailed(true); throw error; }
  }
  const attemptedActiveReceipt = useRef<string | null>(null);
  useEffect(() => {
    if (!view.sellerAccessActive || active || working.current || unavailable || reading) return;
    const identity = `${ownerId}:${application?.id ?? "existing"}:${application?.revision ?? 0}`;
    if (attemptedActiveReceipt.current === identity) return;
    attemptedActiveReceipt.current = identity;
    void run("Refreshing your account…", accountRefresh);
    // One owned active receipt triggers at most one automatic profile refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.sellerAccessActive, active, ownerId, application?.id, application?.revision, unavailable, reading]);
  function checkActivation() {
    if (!application?.canReconcile || blocked) return;
    const id = application.id;
    void run("Checking activation…", async () => {
      const next = await reconcile.mutateAsync({ id });
      if (!current() || next.ownerId !== ownerId || next.application?.id !== id) return;
      accept(next); hydrate(next);
      if (next.sellerAccessActive) await accountRefresh();
    });
  }
  function replacement() {
    if (blocked || view.nextAction !== "replace_application") return;
    observed.current = view.application;
    requestId.current = crypto.randomUUID(); basis.current = null; setReplacing(true); setWebsite(view.currentBusiness.businessWebsite ?? ""); setEin("");
    setDocument(view.reusableEvidence.document); setDirty(false); setUncertain(null); setChecked(null); setProblem(null);
  }

  const identity = view.currentBusiness;
  const address = [identity.businessAddress, [identity.businessCity, identity.businessState, identity.businessZip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const title = active ? "Selling is active" : view.sellerAccessActive ? "Selling approved; refreshing your account" : editable ? "Start selling"
    : application?.status === "pending" ? "Your seller application is under review"
      : application?.status === "approved" ? "Approved; finishing setup"
        : application?.status === "rejected" ? "A seller detail needs updating" : "Seller application needs refreshing";
  return <section className="max-w-2xl space-y-6">
    <header className="space-y-2"><h1 className="text-2xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">Sell inventory with this account. Your buying access and purchase history stay with you.</p></header>
    {unavailable && <div role="alert" className="space-y-2 text-sm"><p>Your unsaved changes are kept on this page. Retry before saving or submitting.</p><Button variant="outline" disabled={Boolean(busy || reading)} onClick={() => void run("Refreshing…", async () => { await refresh(); })}>Try again</Button></div>}
    {problem && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{problem}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {busy && <p role="status" className="text-sm">{busy}</p>}
    {!active && <div className="space-y-2 border-b pb-5"><h2 className="font-medium">{identity.verified ? "Verified business" : "Your business"}</h2><p>{identity.businessName}</p><p className="break-words text-sm text-muted-foreground">{address}</p><Link href="/buyer/settings" className="text-sm underline">Correct business details</Link><p className="text-xs text-muted-foreground">Changing the business identity may require business verification again.</p></div>}
    {uncertain && <div className="space-y-3 rounded-md border p-4 text-sm">
      <p>{uncertain === "submit" ? "Your submission needs checking. You do not need to submit it again yet." : "Check the saved application before making another change."}</p>
      <Button variant="outline" disabled={Boolean(busy || reading)} onClick={checkSaved}>{uncertain === "submit" ? "Check submission" : "Check saved application"}</Button>
      {checked && <div className="space-y-2"><p>Saved website: <span className="break-all">{checked.application?.businessWebsite || "Not supplied"}</span></p><p>{checked.application?.hasEin ? `Saved EIN ending in ${checked.application.einLast4}` : "No current saved EIN"}</p><div className="flex flex-wrap gap-3"><Button disabled={Boolean(busy)} onClick={() => { accept(checked); hydrate(checked); setProblem(null); }}>Use saved application</Button><Button variant="outline" disabled={Boolean(busy) || Boolean(checked.application && !checked.application.canEdit)} onClick={() => { basis.current = checked.application; observed.current = checked.application; requestId.current = checked.application?.requestId ?? requestId.current; accept(checked); setEin(""); setDocument(checked.application?.document ?? checked.reusableEvidence.document); setReplacing(false); setUncertain(null); setChecked(null); setDirty(true); setProblem("Your website edits are kept. Review the saved evidence and re-enter any missing EIN before saving."); }}>Keep my changes</Button></div></div>}
    </div>}
    {editable && <form noValidate className="space-y-5" onSubmit={event => { event.preventDefault(); submitApplication(); }}>
      <fieldset disabled={blocked} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="selling-website">Business website</Label><Input id="selling-website" type="url" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} maxLength={2048} placeholder="example.com" value={website} aria-invalid={Boolean(fieldErrors.website)} aria-describedby={fieldErrors.website ? "selling-website-error" : undefined} onChange={event => { setWebsite(event.target.value); setDirty(true); }} />{fieldErrors.website && <p id="selling-website-error" role="alert" className="text-sm text-destructive">{fieldErrors.website}</p>}</div>
        {!hasEin || ein ? <div className="space-y-2"><Label htmlFor="selling-ein">EIN</Label><Input id="selling-ein" type="text" inputMode="numeric" autoComplete="off" maxLength={11} placeholder="12-3456789" value={ein} aria-invalid={Boolean(fieldErrors.ein)} aria-describedby={fieldErrors.ein ? "selling-ein-error" : undefined} onChange={event => { setEin(event.target.value); setDirty(true); }} />{fieldErrors.ein && <p id="selling-ein-error" role="alert" className="text-sm text-destructive">{fieldErrors.ein}</p>}<p className="text-xs text-muted-foreground">Stored privately for this application. It will not appear on your public profile.</p></div> : <p className="text-sm">EIN ending in {last4}</p>}
        <div className="space-y-2"><Label htmlFor="selling-document">Business license or supporting document</Label>{document && <p><a className="break-words text-sm underline" href={verificationDocumentHref(document.reference)} target="_blank" rel="noreferrer">View supporting document</a></p>}<Input id="selling-document" type="file" accept="application/pdf,image/jpeg,image/png" aria-describedby="selling-document-hint" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) upload(file); }} /><p id="selling-document-hint" className="text-xs text-muted-foreground">{document ? "Your retained document can be reused. Choose a file only to replace it. " : ""}PDF, JPEG or PNG; maximum 10 MB.</p>{document && <p className="text-xs text-muted-foreground">Evidence available until {new Date(document.expiresAt).toLocaleDateString()}.</p>}</div>
        {dirty && <p className="text-sm text-muted-foreground">Unsaved changes stay in this tab. Save your draft before reloading or closing it.</p>}
        <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={blocked || (!dirty && Boolean(basis.current) && !replacing)} onClick={saveDraft}>Save draft</Button>{identity.verified ? <Button type="submit" disabled={blocked || !website.trim() || !hasEin || !document}>Submit for review</Button> : <Button asChild><Link href={buyerVerificationHref(continuation?.href)}>Verify your business</Link></Button>}</div>
      </fieldset>
    </form>}
    {!editable && application && <div className="space-y-3 text-sm">
      {application.submittedAt && <p>Submitted {new Date(application.submittedAt).toLocaleDateString()}</p>}
      {application.reviewNote && <p className="whitespace-pre-wrap break-words">{application.reviewNote}</p>}
      {application.status === "pending" && <p>Your supplemental seller information is saved for review. You can continue buying while we review it.</p>}
      {application.status === "approved" && !active && <p>Approval is recorded. Selling becomes available after your current account access is confirmed.</p>}
      {application.status === "stale" && <p>The saved business details or evidence need refreshing. Your existing business approval has not been reset by this application.</p>}
      {view.nextAction === "replace_application" && <Button disabled={blocked} onClick={replacement}>Start a new application</Button>}
      {application.canReconcile && <Button disabled={blocked} onClick={checkActivation}>Check activation</Button>}
      {application.status === "pending" && <Button variant="outline" disabled={blocked} onClick={() => void run("Refreshing…", async () => { await refresh(); })}>Refresh status</Button>}
    </div>}
    {view.nextAction === "contact_support" && !active && <p className="text-sm">Your current account needs attention before selling can continue. <Link className="underline" href="/contact">Contact support</Link>.</p>}
    {view.sellerAccessActive && !active && <Button disabled={Boolean(busy || reading)} onClick={() => void run("Refreshing your account…", accountRefresh)}>{refreshFailed ? "Retry account refresh" : "Refresh account status"}</Button>}
    {active && <Button asChild><Link href="/seller/listings/new">Create your first listing</Link></Button>}
    <nav aria-label="Continue buying" className="flex flex-wrap gap-x-5 gap-y-3 border-t pt-4 text-sm"><Link className="underline" href="/buyer">Continue buying</Link>{continuation && <Link className="underline" href={continuation.href}>{continuation.label}</Link>}</nav>
  </section>;
}
