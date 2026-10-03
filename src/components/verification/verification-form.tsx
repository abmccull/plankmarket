"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { createClient } from "@/lib/supabase/client";
import { getBuyerContinuation } from "@/lib/auth/buyer-continuation";
import { canPurchase } from "@/lib/auth/roles";
import { getVerificationSubmissionSchema } from "@/lib/validators/auth";
import { verificationDraftBinding, isCurrentVerificationOwner, readVerificationDraftMemory, rememberVerificationDraft, type VerificationDraftBinding, type VerificationDraftFields, type VerificationDraftBasis, type VerificationDraftAttempt } from "@/lib/auth/verification-draft-memory";
import { VERIFICATION_BUCKET, MAX_VERIFICATION_BYTES, VERIFICATION_MIME_TYPES, verificationDocumentId, verificationDocumentHref } from "@/lib/verification-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState, StatePanelLoading } from "@/components/ui/state-panel";

type Outputs = inferRouterOutputs<AppRouter>;
type Draft = Outputs["auth"]["getVerificationDraft"];
type Profile = Outputs["auth"]["getProfile"];
const fields = [["businessWebsite", "Business website"], ["businessAddress", "Business address"], ["businessCity", "City"], ["businessState", "State"], ["businessZip", "ZIP code"], ["einTaxId", "EIN"]] as const;
const inputHints: Record<typeof fields[number][0], ComponentProps<typeof Input>> = {
  businessWebsite: { type: "url", inputMode: "url", autoComplete: "url", autoCapitalize: "none", spellCheck: false, maxLength: 2048, placeholder: "example.com" },
  businessAddress: { autoComplete: "street-address", maxLength: 500 },
  businessCity: { autoComplete: "address-level2", maxLength: 100 },
  businessState: { autoComplete: "address-level1", autoCapitalize: "characters", maxLength: 2, placeholder: "CO" },
  businessZip: { autoComplete: "postal-code", inputMode: "numeric", maxLength: 10 },
  einTaxId: { inputMode: "numeric", autoComplete: "off", maxLength: 11, placeholder: "12-3456789" },
};
const draftKeys = [...fields.map(([name]) => name), "verificationDocUrl"] as const;
function draftValues(input: Partial<VerificationDraftFields>): VerificationDraftFields {
  return {
    businessWebsite: input.businessWebsite ?? "", businessAddress: input.businessAddress ?? "",
    businessCity: input.businessCity ?? "", businessState: input.businessState ?? "",
    businessZip: input.businessZip ?? "", einTaxId: input.einTaxId ?? "", verificationDocUrl: input.verificationDocUrl ?? "",
  };
}
function normalized(input: Partial<VerificationDraftFields>): VerificationDraftFields {
  const result = draftValues(input);
  for (const key of draftKeys) result[key] = result[key].trim();
  result.businessState = result.businessState.toUpperCase();
  return result;
}
const sameFields = (a: VerificationDraftFields, b: VerificationDraftFields) => draftKeys.every(key => a[key] === b[key]);
const versionTime = (version: Date | null) => version?.getTime() ?? null;
const sameVersion = (a: Date | null, b: Date | null) => versionTime(a) === versionTime(b);
const advancedVersion = (next: Date | null, before: Date | null) => next !== null && Number.isFinite(next.getTime()) && (before === null || next.getTime() > before.getTime());
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "We couldn't confirm this request. Your entered details are still here.";

export function VerificationForm({ returnPath }: { returnPath?: string | null } = {}) {
  const accountId = useAuthStore(state => state.user?.id);
  const loading = useAuthStore(state => state.isLoading);
  if (!accountId || loading) return <StatePanelLoading label="Loading your verification" rows={3} />;
  const binding = verificationDraftBinding(accountId);
  return <VerificationAccount key={`${accountId}:${binding.generation}`} binding={binding} returnPath={returnPath} />;
}

function VerificationAccount({ binding, returnPath }: { binding: VerificationDraftBinding; returnPath?: string | null }) {
  const utils = trpc.useUtils();
  const accountId = binding.ownerId;
  const scope = { ownerId: accountId, generation: binding.generation };
  const profile = useQuery({
    queryKey: [...getQueryKey(trpc.auth.getProfile, undefined, "query"), scope], retry: false, gcTime: 0, staleTime: 0, refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const result = await utils.client.auth.getProfile.query(undefined, { signal });
      if (signal.aborted || !isCurrentVerificationOwner(binding) || result.id !== accountId) throw new Error("Verification status is unavailable for this account.");
      return result;
    },
  });
  const editable = profile.data?.id === accountId && ["buyer", "seller"].includes(profile.data.role) && profile.data.active && ["unverified", "rejected"].includes(profile.data.verificationStatus);
  const draft = useQuery({
    queryKey: [...getQueryKey(trpc.auth.getVerificationDraft, undefined, "query"), scope], enabled: Boolean(editable), retry: false, gcTime: 0, staleTime: 0, refetchOnMount: "always",
    queryFn: async ({ signal }) => {
      const result = await utils.client.auth.getVerificationDraft.query(undefined, { signal });
      if (signal.aborted || !isCurrentVerificationOwner(binding) || result.ownerId !== accountId) throw new Error("The saved version could not be loaded. Your edits are unchanged.");
      return result;
    },
  });
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);
  if (!initialDraft && draft.isFetchedAfterMount && !draft.isFetching && !draft.isError && draft.data?.ownerId === accountId) setInitialDraft(draft.data);
  async function reloadDraft() {
    const [latestProfile, latestDraft] = await Promise.all([profile.refetch({ cancelRefetch: true }), draft.refetch({ cancelRefetch: true })]);
    if (!isCurrentVerificationOwner(binding) || latestProfile.error || latestProfile.data?.id !== accountId || latestDraft.error || latestDraft.data?.ownerId !== accountId) {
      throw new Error("The saved version could not be checked. Your local changes are still here.");
    }
    return latestDraft.data;
  }
  const retry = () => { void reloadDraft().catch(() => { /* Keep the owned editor visible on failure. */ }); };
  useEffect(() => {
    if (profile.data?.id === accountId && !editable && !profile.isError) rememberVerificationDraft(binding, null);
  }, [accountId, binding, editable, profile.data, profile.isError]);
  if (profile.isPending) return <StatePanelLoading label="Loading your verification" rows={3} />;
  if (!profile.data || profile.data.id !== accountId) return <QueryErrorState title="Verification status unavailable" description="We couldn't confirm your account status. Retry before making changes." onRetry={() => void profile.refetch()} isRetrying={profile.isFetching} />;
  if (!editable) {
    if (profile.isError) return <QueryErrorState title="Verification status unavailable" description="We couldn't confirm the latest review status." onRetry={() => void profile.refetch()} isRetrying={profile.isFetching} />;
    if (!profile.data.active || !["buyer", "seller"].includes(profile.data.role)) return <QueryErrorState title="Verification unavailable" description="Business verification is available to active buyer and seller accounts. Contact support if your account access needs updating." onRetry={() => void profile.refetch()} isRetrying={profile.isFetching} />;
    const verified = profile.data.verificationStatus === "verified";
    const continuation = canPurchase(profile.data.role) ? getBuyerContinuation(returnPath) : null;
    const fallback = profile.data.role === "seller" ? "/seller" : "/listings";
    return <section className="max-w-xl space-y-4"><h1 className="text-2xl font-semibold">Business verification</h1>
      <h2 className="text-lg font-medium">{verified ? "Your business is verified" : "Your verification is under review"}</h2>
      <p className="text-sm text-muted-foreground">{verified ? "You can continue with verified marketplace actions." : "Your submitted details are saved. You can browse and manage your account while we review them."}</p>
      {!verified && profile.data.verificationRequestedAt && <p className="text-sm">Submitted {new Date(profile.data.verificationRequestedAt).toLocaleDateString()}</p>}
      <div className="flex flex-wrap gap-3"><Button asChild><Link href={verified ? continuation?.href ?? fallback : continuation?.browseHref ?? fallback}>{continuation ? verified ? continuation.label : continuation.isCheckout ? "Return to selected lot" : continuation.label : profile.data.role === "seller" ? "Open seller dashboard" : "Browse listings"}</Link></Button>{!verified && <Button variant="outline" disabled={profile.isFetching} onClick={() => void profile.refetch()}>{profile.isFetching ? "Refreshing..." : "Refresh review status"}</Button>}</div>
    </section>;
  }
  if (!initialDraft && (draft.isPending || draft.isFetching)) return <StatePanelLoading label="Loading your saved verification" rows={3} />;
  if (!initialDraft) return <QueryErrorState title="Saved verification unavailable" description="We couldn't load your saved details. Retry before editing them." onRetry={retry} isRetrying={profile.isFetching || draft.isFetching} />;
  return <VerificationEditor binding={binding} profile={profile.data} initialDraft={initialDraft} observedDraft={draft.data} unavailable={profile.isError || draft.isError} reading={profile.isFetching || draft.isFetching} reloadDraft={reloadDraft} returnPath={returnPath} />;
}

function VerificationEditor({ binding, profile, initialDraft, observedDraft, unavailable, reading, reloadDraft, returnPath }: {
  binding: VerificationDraftBinding; profile: Profile; initialDraft: Draft; observedDraft?: Draft; unavailable: boolean; reading: boolean; reloadDraft: () => Promise<Draft>; returnPath?: string | null;
}) {
  const utils = trpc.useUtils();
  const accountId = binding.ownerId;
  const [restored] = useState(() => readVerificationDraftMemory(binding, initialDraft.ownerId));
  const initialBasis = restored?.basis ?? { fields: normalized(initialDraft), updatedAt: initialDraft.updatedAt };
  const basis = useRef<VerificationDraftBasis>(initialBasis);
  const [acknowledged, setAcknowledged] = useState(initialBasis);
  const observed = useRef(initialDraft);
  const lastObserved = useRef<Draft | undefined>(initialDraft);
  function retainObserved(next: Draft | undefined) {
    // A pending receipt cannot consume a newer read, and an older read cannot
    // replace knowledge of a newer version already received by this editor.
    if (next?.ownerId === accountId && !advancedVersion(observed.current.updatedAt, next.updatedAt)) observed.current = next;
  }
  if (observedDraft !== lastObserved.current) {
    lastObserved.current = observedDraft;
    retainObserved(observedDraft);
  }
  const attempt = useRef<VerificationDraftAttempt | null>(restored?.attempt ?? null);
  const [fenced, setFenced] = useState(Boolean(restored));
  const fence = useRef(Boolean(restored));
  const [checked, setChecked] = useState<Draft | null>(null);
  const checkedObservation = useRef<Draft | null>(null);
  const [problem, setProblem] = useState<string | null>(restored ? "Your local changes are kept in this tab. Check the saved draft before continuing." : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false), [uploading, setUploading] = useState(false), [checking, setChecking] = useState(false), [submitting, setSubmitting] = useState(false), [draining, setDraining] = useState(false), [submitted, setSubmitted] = useState(false);
  const mounted = useRef(false), uploadActive = useRef(false), checkActive = useRef(false), submitActive = useRef(false), submitFlow = useRef(false), done = useRef(false);
  const pending = useRef<Promise<boolean> | null>(null), flushing = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null), lastEdit = useRef(0), forceSave = useRef(restored?.forceSave ?? false);
  const latest = useRef({ profile, unavailable, reading }); latest.current = { profile, unavailable, reading };
  const { register, reset, setValue, watch, getValues, setError, clearErrors, setFocus, formState: { errors } } = useForm<VerificationDraftFields>({ defaultValues: restored?.fields ?? draftValues(initialDraft) });
  const values = watch(), signature = JSON.stringify(normalized(values));
  const dirty = !sameFields(normalized(values), acknowledged.fields);
  const save = trpc.auth.saveVerificationDraft.useMutation({ retry: false });
  const submit = trpc.auth.submitVerificationDraft.useMutation({ retry: false });
  const prepare = trpc.verificationDocument.prepare.useMutation({ retry: false });
  const complete = trpc.verificationDocument.complete.useMutation({ retry: false });
  const continuation = canPurchase(profile.role) ? getBuyerContinuation(returnPath) : null;
  const current = () => mounted.current && isCurrentVerificationOwner(binding);
  const editableNow = () => {
    const actor = useAuthStore.getState().user;
    return current() && !done.current && latest.current.profile.active && ["unverified", "rejected"].includes(latest.current.profile.verificationStatus) &&
      ["buyer", "seller"].includes(actor?.role ?? "") && ["unverified", "rejected"].includes(actor?.verificationStatus ?? "");
  };
  const ready = () => editableNow() && !latest.current.unavailable && !latest.current.reading && !fence.current && !checkActive.current && !uploadActive.current && !submitActive.current;
  function clearTimer() { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; }
  function remember(fieldsNow = draftValues(getValues())) {
    if (!current()) return;
    const changed = !sameFields(normalized(fieldsNow), basis.current.fields);
    rememberVerificationDraft(binding, !done.current && (changed || attempt.current || fence.current || forceSave.current) ? { fields: fieldsNow, basis: basis.current, attempt: attempt.current, forceSave: forceSave.current } : null);
  }
  function acknowledge(fieldsNow: VerificationDraftFields, updatedAt: Date | null) {
    basis.current = { fields: fieldsNow, updatedAt }; setAcknowledged(basis.current);
  }
  function block(error: unknown) {
    fence.current = true; setFenced(true); setChecked(null); clearTimer(); setNotice(null); setProblem(errorMessage(error)); remember();
  }
  const scheduleRef = useRef<() => void>(() => {});
  function schedule() {
    clearTimer();
    if (!ready() || pending.current || flushing.current || submitFlow.current || (!forceSave.current && sameFields(normalized(getValues()), basis.current.fields))) return;
    const wait = Math.max(0, lastEdit.current + 800 - Date.now());
    timer.current = setTimeout(() => { timer.current = null; if (ready()) void saveOnce(); }, wait);
  }
  scheduleRef.current = schedule;
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimer(); };
  }, []);
  useLayoutEffect(() => { remember(); });
  useEffect(() => {
    scheduleRef.current();
    return () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  }, [signature, unavailable, reading, fenced, uploading, checking, submitted]);
  function reconcileObserved() {
    if (!current()) return false;
    const next = observed.current;
    if (advancedVersion(basis.current.updatedAt, next.updatedAt)) return true;
    if (sameVersion(next.updatedAt, basis.current.updatedAt) && sameFields(normalized(next), basis.current.fields)) return true;
    block(new Error("The saved draft changed. Your local details are still here; check the saved draft before continuing."));
    return false;
  }
  useLayoutEffect(() => {
    if (!current() || reading || unavailable || pending.current || checkActive.current || fence.current || submitFlow.current) return;
    reconcileObserved();
    // Reconsider retained reads when a busy operation settles. Layout timing
    // removes stale success feedback before painting a known divergent draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [observedDraft, reading, unavailable, saving, checking, draining, fenced, acknowledged]);

  function saveOnce(): Promise<boolean> {
    if (pending.current) return pending.current;
    if (!ready()) return Promise.resolve(false);
    const snapshot = normalized(getValues());
    if (!forceSave.current && sameFields(snapshot, basis.current.fields) && basis.current.updatedAt !== null) return Promise.resolve(true);
    clearTimer();
    const capturedVersion = basis.current.updatedAt;
    const job = Promise.resolve().then(async () => {
      if (!ready()) return false;
      attempt.current = { kind: "save", fields: snapshot, updatedAt: capturedVersion };
      setSaving(true); setNotice(null); setProblem(null); remember();
      try {
        const receipt = await save.mutateAsync({ ...snapshot, currentStep: 3, expectedOwnerId: accountId, expectedUpdatedAt: capturedVersion });
        if (!current()) return false;
        if (receipt.ownerId !== accountId || !advancedVersion(receipt.updatedAt, capturedVersion)) throw new Error("The save receipt could not be verified. Check the saved draft before continuing.");
        acknowledge(snapshot, receipt.updatedAt); attempt.current = null; forceSave.current = false;
        if (!reconcileObserved()) return false;
        setNotice(sameFields(normalized(getValues()), snapshot) ? "Draft saved." : "Your earlier changes are saved. Newer changes are waiting to save.");
        remember(); return true;
      } catch (error) { if (current()) block(error); return false; }
      finally { if (current()) setSaving(false); }
    });
    pending.current = job;
    void job.finally(() => { if (pending.current === job) pending.current = null; if (current()) scheduleRef.current(); });
    return job;
  }

  function validateCurrent() {
    const result = getVerificationSubmissionSchema(useAuthStore.getState().user?.role ?? profile.role).safeParse(normalized(getValues()));
    clearErrors();
    if (result.success) return true;
    let first: keyof VerificationDraftFields | null = null;
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof VerificationDraftFields;
      if (!draftKeys.includes(key)) continue;
      first ??= key; setError(key, { type: "validate", message: issue.message });
    }
    if (first === "verificationDocUrl") window.document.getElementById("verification-file")?.focus();
    else if (first) setFocus(first);
    return false;
  }

  function flush(final: boolean): Promise<boolean> {
    if (flushing.current) return flushing.current;
    clearTimer();
    const job = Promise.resolve().then(async () => {
      while (ready()) {
        if (pending.current) { if (!await pending.current || !ready()) return false; }
        if (final && !validateCurrent()) return false;
        if (!forceSave.current && basis.current.updatedAt !== null && sameFields(normalized(getValues()), basis.current.fields)) return true;
        if (!await saveOnce() || !ready()) return false;
        if (final && !validateCurrent()) return false;
      }
      return false;
    });
    flushing.current = job;
    void job.finally(() => { if (flushing.current === job) flushing.current = null; if (current() && !submitFlow.current) scheduleRef.current(); });
    return job;
  }
  async function saveManually() {
    if (!ready() || submitFlow.current) return;
    await flush(false);
  }
  async function submitForReview() {
    if (!ready() || submitFlow.current || !validateCurrent()) return;
    submitFlow.current = true; setDraining(true); setProblem(null); clearTimer();
    try {
      if (!await flush(true) || !ready() || !validateCurrent()) return;
      const captured = basis.current;
      if (!captured.updatedAt || !sameFields(normalized(getValues()), captured.fields)) return;
      attempt.current = { kind: "submit", fields: captured.fields, updatedAt: captured.updatedAt };
      submitActive.current = true; setSubmitting(true); remember();
      await submit.mutateAsync({ expectedOwnerId: accountId, expectedUpdatedAt: captured.updatedAt });
      if (!current()) return;
      done.current = true; attempt.current = null; rememberVerificationDraft(binding, null); setSubmitted(true); setNotice(null);
      await Promise.all([utils.auth.getProfile.invalidate(), utils.auth.getSession.invalidate()]);
    } catch (error) { if (current() && !done.current) block(error); }
    finally {
      submitActive.current = false; submitFlow.current = false;
      if (current()) { setSubmitting(false); setDraining(false); scheduleRef.current(); }
    }
  }

  async function checkSaved() {
    if (!current() || checkActive.current || pending.current || uploadActive.current || submitActive.current) return;
    checkActive.current = true; setChecking(true); setProblem(null); clearTimer();
    try {
      const next = await reloadDraft();
      if (!current() || next.ownerId !== accountId) return;
      retainObserved(next);
      const incoming = normalized(next), sent = attempt.current;
      const confirmedAttempt = sent?.kind === "save" && next.currentStep === 3 && sameFields(incoming, sent.fields) && advancedVersion(next.updatedAt, sent.updatedAt);
      const unchanged = !sent && sameVersion(next.updatedAt, basis.current.updatedAt) && sameFields(incoming, basis.current.fields);
      if (confirmedAttempt || unchanged) {
        // Only an advanced receipt for the exact attempted save satisfies the
        // deliberate CAS obligation; an unchanged baseline cannot satisfy it.
        if (confirmedAttempt) forceSave.current = false;
        acknowledge(incoming, next.updatedAt); attempt.current = null; fence.current = false; setFenced(false); setChecked(null); setProblem(null);
        if (!reconcileObserved()) return;
        setNotice(forceSave.current ? "Your choice is kept. Saving this version next." : sameFields(normalized(getValues()), incoming) ? next.updatedAt ? "Draft saved." : "Your details are ready to edit." : "Your local changes are kept and will save next.");
        remember();
      } else {
        checkedObservation.current = observed.current;
        fence.current = true; setFenced(true); setChecked(next); setNotice(null);
        setProblem("Review the saved draft before continuing. Your local details have not been replaced."); remember();
      }
    } catch (error) { if (current()) { setProblem(errorMessage(error)); remember(); } }
    finally { checkActive.current = false; if (current()) { setChecking(false); scheduleRef.current(); } }
  }
  function chooseSaved(keepLocal: boolean) {
    if (!current() || !checked || checked.ownerId !== accountId || checkActive.current || pending.current) return;
    const missingDraft = checked.updatedAt === null;
    if (missingDraft && observed.current !== checkedObservation.current) {
      block(new Error("The saved draft changed after you checked it. Check the saved draft again before continuing."));
      return;
    }
    const incoming = normalized(checked);
    // Only an explicit checked-absence choice can discard evidence of the
    // deleted row. Already processed cached reads must not replay it on render.
    if (missingDraft) observed.current = checked;
    const delayedAttemptCouldCommit = attempt.current !== null && !advancedVersion(checked.updatedAt, attempt.current.updatedAt);
    acknowledge(incoming, checked.updatedAt);
    if (!keepLocal) { reset(draftValues(checked)); clearErrors(); }
    attempt.current = null; fence.current = false; setFenced(false); setChecked(null); setProblem(null);
    // A baseline read does not cancel an old request. A deliberate CAS write
    // fences that request even if the user has reverted to the baseline values.
    forceSave.current = missingDraft || keepLocal || delayedAttemptCouldCommit;
    lastEdit.current = Date.now();
    setNotice(forceSave.current ? "Your choice is kept. Saving this version next." : "Loaded the saved draft.");
    remember(); scheduleRef.current();
  }

  async function upload(file: File) {
    if (!ready() || submitFlow.current) return;
    if (!(VERIFICATION_MIME_TYPES as readonly string[]).includes(file.type) || !file.size || file.size > MAX_VERIFICATION_BYTES) { setProblem("Choose a PDF, JPEG or PNG up to 10 MB."); return; }
    uploadActive.current = true; setUploading(true); setProblem(null); clearTimer();
    try {
      const intent = await prepare.mutateAsync({ fileName: file.name, fileSize: file.size, mimeType: file.type as typeof VERIFICATION_MIME_TYPES[number] });
      if (!current()) return;
      const result = await createClient().storage.from(VERIFICATION_BUCKET).uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });
      if (result.error) throw new Error("Upload failed. Your entered details are unchanged; choose the file again.");
      if (!current()) return;
      const completed = await complete.mutateAsync({ id: intent.id });
      if (!current()) return;
      if (verificationDocumentId(completed.reference) !== intent.id) throw new Error("The completed document could not be confirmed. Choose the file again.");
      setValue("verificationDocUrl", completed.reference, { shouldDirty: true }); clearErrors("verificationDocUrl");
      lastEdit.current = Date.now(); setNotice(null); remember();
    } catch (error) { if (current()) setProblem(`Document upload: ${errorMessage(error)}`); }
    finally { uploadActive.current = false; if (current()) { setUploading(false); scheduleRef.current(); } }
  }
  function edited(name: keyof VerificationDraftFields, value: string) {
    lastEdit.current = Date.now(); clearTimer(); setNotice(null); clearErrors(name);
    remember({ ...draftValues(getValues()), [name]: value });
    queueMicrotask(() => { if (current()) scheduleRef.current(); });
  }

  const documentReference = values.verificationDocUrl ?? "";
  const blocked = unavailable || reading || fenced || checking || uploading || submitting;
  const comparison = checked ? normalized(checked) : null;
  function comparisonValue(name: keyof VerificationDraftFields, value: string) {
    if (!value) return "Not supplied";
    if (name === "einTaxId") {
      const last4 = value.replace(/\D/g, "").slice(-4);
      return last4 ? `EIN ending in ${last4}` : "Entered (incomplete)";
    }
    return value;
  }
  function comparisonDocument(reference: string, label: string) {
    return verificationDocumentId(reference) ? <a className="underline" href={verificationDocumentHref(reference)} target="_blank" rel="noreferrer">{label}</a> : reference ? "Document needs checking" : "No document";
  }
  if (submitted) return <section className="max-w-xl space-y-4"><h1 className="text-2xl font-semibold">Business verification</h1><p role="status">Your verification was submitted for review.</p><p className="text-sm text-muted-foreground">Refresh to check its current status. You do not need to submit it again.</p><div className="flex flex-wrap gap-3"><Button variant="outline" disabled={reading} onClick={() => void checkSaved()}>Refresh review status</Button><Button asChild variant="outline"><Link href={continuation?.browseHref ?? (profile.role === "seller" ? "/seller" : "/listings")}>{continuation ? continuation.isCheckout ? "Return to selected lot" : continuation.label : profile.role === "seller" ? "Open seller dashboard" : "Browse listings"}</Link></Button></div></section>;
  return <section className="max-w-xl space-y-4"><h1 className="text-2xl font-semibold">Business verification</h1>
    <p className="text-sm text-muted-foreground">Your draft saves as you type. Your supporting document is private to you and authorized reviewers.</p>
    {continuation && <p className="text-sm text-muted-foreground">Your return link is kept on this page; it does not reserve inventory. <Link className="font-medium text-primary underline underline-offset-4" href={continuation.browseHref}>{continuation.isCheckout ? "View selected lot" : continuation.label}</Link></p>}
    {profile.verificationStatus === "rejected" && <div role="status" className="space-y-2 rounded-md border p-3"><h2 className="font-medium">A detail needs updating</h2><p className="whitespace-pre-wrap break-words text-sm">{profile.verificationNotes || "Review your business details and supporting document, then submit the corrected information."}</p></div>}
    {unavailable && <div role="alert" className="space-y-2 text-sm"><p>We could not refresh your verification. Your local details are kept below. Try again before saving or submitting.</p><Button variant="outline" disabled={checking || reading || saving || submitting} onClick={() => void checkSaved()}>Try again</Button></div>}
    {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
    {fenced && <div className="space-y-3 rounded-md border p-3 text-sm"><p>Check the saved draft before another save or submission.</p><Button type="button" variant="outline" disabled={checking || reading || saving || submitting} onClick={() => void checkSaved()}>Check saved draft</Button>
      {checked && comparison && <div className="space-y-3">
        <p>Your current entries stay below until you choose. These details differ from the saved draft:</p>
        <dl className="space-y-3">
          {fields.filter(([name]) => normalized(values)[name] !== comparison[name]).map(([name, label]) => <div key={name} className="min-w-0 space-y-1"><dt className="font-medium">{label}</dt><dd className="min-w-0 break-words"><span className="text-muted-foreground">Current: </span>{comparisonValue(name, normalized(values)[name])}</dd><dd className="min-w-0 break-words"><span className="text-muted-foreground">Saved: </span>{comparisonValue(name, comparison[name])}</dd>{name === "einTaxId" && <dd className="text-xs text-muted-foreground">The entered EIN differs from the saved value. Only the last four digits are shown.</dd>}</div>)}
          <div className="space-y-1"><dt className="font-medium">Supporting document</dt><dd><span className="text-muted-foreground">Current: </span>{comparisonDocument(documentReference, "View current document")}</dd><dd><span className="text-muted-foreground">Saved: </span>{comparisonDocument(checked.verificationDocUrl, "View saved document")}</dd></div>
        </dl>
        {sameFields(normalized(values), comparison) && <p>The fields match, but the earlier request still needs a confirmed version before continuing.</p>}
        <div className="flex flex-wrap gap-3"><Button type="button" disabled={checking || reading} onClick={() => chooseSaved(false)}>Use saved draft</Button><Button type="button" variant="outline" disabled={checking || reading} onClick={() => chooseSaved(true)}>Keep my changes</Button></div>
      </div>}
    </div>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {saving && <p role="status" className="text-sm text-muted-foreground">Saving your draft...</p>}
    <form className="space-y-4" noValidate onSubmit={event => { event.preventDefault(); void submitForReview(); }}>
      <fieldset disabled={submitting} className="space-y-4">
        {fields.map(([name, label]) => {
          const registered = register(name);
          return <div key={name} className="space-y-2"><Label htmlFor={name}>{label}{name === "businessWebsite" && profile.role === "buyer" ? " (optional)" : ""}</Label><Input id={name} {...inputHints[name]} {...registered} onChange={event => { void registered.onChange(event); edited(name, event.target.value); }} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `${name}-error` : undefined} />{errors[name] && <p id={`${name}-error`} role="alert" className="text-sm text-destructive">{errors[name]?.message}</p>}</div>;
        })}
        <div className="space-y-2"><Label htmlFor="verification-file">Business license or supporting document</Label><Input id="verification-file" type="file" accept="application/pdf,image/jpeg,image/png" disabled={blocked || draining} aria-describedby={errors.verificationDocUrl ? "verification-file-hint verification-file-error" : "verification-file-hint"} aria-invalid={Boolean(errors.verificationDocUrl)} onChange={event => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = ""; }} /><p id="verification-file-hint" className="text-sm text-muted-foreground">PDF, JPEG or PNG; maximum 10 MB.</p>{verificationDocumentId(documentReference) && <a href={verificationDocumentHref(documentReference)} target="_blank" rel="noreferrer" className="inline-block underline">View uploaded document</a>}{errors.verificationDocUrl && <p id="verification-file-error" role="alert" className="text-sm text-destructive">Upload a supporting document.</p>}</div>
        {dirty && <p className="text-sm text-muted-foreground">{fenced || unavailable ? "Your unsaved changes are kept on this page." : "Changes are waiting to save."}</p>}
        <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={blocked || draining || (!dirty && !forceSave.current)} onClick={() => void saveManually()}>Save draft</Button><Button type="submit" disabled={blocked || draining || !verificationDocumentId(documentReference)}>{submitting ? "Submitting..." : "Submit for review"}</Button></div>
      </fieldset>{uploading && <p role="status">Uploading and checking your document...</p>}
    </form>
  </section>;
}
