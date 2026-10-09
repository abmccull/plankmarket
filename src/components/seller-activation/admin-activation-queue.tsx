"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import type { SellerActivationView } from "@/server/services/seller-activation";
import type { SellerActivationReviewInput } from "@/lib/validators/seller-activation";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { MFA_REQUIRED_MESSAGE, RECENT_AUTH_REQUIRED_MESSAGE } from "@/lib/auth/auth-assurance";
import { verificationDocumentHref } from "@/lib/verification-documents";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { QueryErrorState, StatePanelLoading } from "@/components/ui/state-panel";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type View = SellerActivationView;
type Decision = SellerActivationReviewInput["decision"];
const RETURN = "/admin/verifications?tab=seller-applications";
const recoveryHref = "/mfa?next=" + encodeURIComponent(RETURN);
const message = (error: unknown) => error instanceof Error ? error.message : "This action could not be confirmed. Read the latest application before continuing.";
const errorCode = (error: unknown) => error && typeof error === "object" && "data" in error && error.data && typeof error.data === "object" && "code" in error.data ? error.data.code : undefined;
function status(view: View) {
  if (view.sellerAccessActive) return "Selling active";
  if (view.application?.status === "approved") return "Approved; finishing setup";
  if (view.application?.status === "stale" && view.application.syncState === "cancelled") return "Stale; activation safely cancelled";
  return view.application?.status === "pending" ? "Awaiting seller review" : view.application?.status === "rejected" ? "Changes requested" : "Application needs refreshing";
}

export function AdminActivationQueue() {
  const actor = useAuthStore(state => state.user);
  if (actor?.role !== "admin") return <p role="status">Checking administrator access…</p>;
  return <OwnedActivationQueue key={actor.id} actorId={actor.id} />;
}

function OwnedActivationQueue({ actorId }: { actorId: string }) {
  const utils = trpc.useUtils();
  const actor = useAuthStore(state => state.user);
  const mounted = useRef(false), working = useRef(false), selectionGeneration = useRef(0);
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<View | null>(null);
  const selectedRef = useRef<View | null>(null);
  const [note, setNote] = useState("");
  const [confirmation, setConfirmation] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [needsAssurance, setNeedsAssurance] = useState(false);
  const [stale, setStale] = useState(false);
  const [allowReplay, setAllowReplay] = useState(false);
  const originalReview = useRef<SellerActivationReviewInput | null>(null);
  const unresolved = useRef(new Map<string, SellerActivationReviewInput | null>());
  useEffect(() => {
    const selection = selectionGeneration;
    mounted.current = true;
    return () => { mounted.current = false; selection.current++; };
  }, []);
  const current = () => mounted.current && useAuthStore.getState().isAuthenticated && useAuthStore.getState().user?.id === actorId && useAuthStore.getState().user?.role === "admin";
  const input = { status: filter, limit: 25, offset };
  const queue = useQuery({
    queryKey: [...getQueryKey(trpc.admin.getSellerActivationQueue, input, "query"), { actorId }], retry: false, staleTime: 0, gcTime: 0,
    queryFn: async ({ signal }) => {
      const result = await utils.client.admin.getSellerActivationQueue.query(input, { signal });
      if (signal.aborted || !current()) throw new Error("Administrator changed");
      return result;
    },
  });
  const review = trpc.admin.reviewSellerActivation.useMutation({ retry: false });
  const reconcile = trpc.admin.reconcileSellerActivation.useMutation({ retry: false });
  const application = selected?.application;
  const self = selected?.ownerId === actorId;
  const assuranceReady = actor?.assurance?.currentLevel === "aal2" && actor.assurance.recentVerificationSatisfied;
  const unsafeRead = queue.isError || queue.isFetching;
  const queueNeedsAssurance = errorCode(queue.error) === "FORBIDDEN" && [MFA_REQUIRED_MESSAGE, RECENT_AUTH_REQUIRED_MESSAGE].includes(message(queue.error));
  const reviewable = application?.status === "pending" && selected?.currentBusiness.active && selected.currentBusiness.verified &&
    selected.currentBusiness.role === "buyer" && application.hasEin && application.document?.ready && new Date(application.purgeAfter) > new Date();
  const canDecide = Boolean(reviewable && !self && assuranceReady && !needsAssurance && !busy && !uncertain && !stale && !unsafeRead && note.trim());
  useEffect(() => {
    if (!application || !queue.data || queue.isFetching || working.current || uncertain) return;
    const row = queue.data.items.find(item => item.application?.id === application.id);
    if (row && row.application?.revision !== application.revision) { setStale(true); setProblem("This application changed. Read the latest revision before deciding."); }
    // A missing row is not evidence of a completed or rejected decision.
  }, [application, queue.data, queue.isFetching, uncertain]);

  function choose(view: View) {
    if (!current() || busy || unsafeRead) return;
    const id = view.application?.id;
    const hasUnresolved = Boolean(id && unresolved.current.has(id));
    const original = id ? unresolved.current.get(id) ?? null : null;
    selectionGeneration.current++; selectedRef.current = view; setSelected(view); setNote(original?.note ?? ""); setConfirmation(null);
    setProblem(hasUnresolved ? "Read the latest application before another decision." : null); setUncertain(hasUnresolved); setStale(false); setNeedsAssurance(false); setAllowReplay(false); originalReview.current = original;
  }
  function capture() {
    const row = selectedRef.current;
    if (!row?.application || !current()) return null;
    return { ownerId: row.ownerId, id: row.application.id, revision: row.application.revision, generation: selectionGeneration.current };
  }
  function matches(target: NonNullable<ReturnType<typeof capture>>) {
    return current() && selectionGeneration.current === target.generation && selectedRef.current?.ownerId === target.ownerId && selectedRef.current.application?.id === target.id;
  }
  function accept(next: View, target: NonNullable<ReturnType<typeof capture>>) {
    if (!matches(target) || next.ownerId !== target.ownerId || next.application?.id !== target.id) return false;
    selectedRef.current = next; setSelected(next); return true;
  }
  function handleError(error: unknown, target: NonNullable<ReturnType<typeof capture>>) {
    if (!matches(target)) return;
    setProblem(message(error));
    if (errorCode(error) === "FORBIDDEN" && [MFA_REQUIRED_MESSAGE, RECENT_AUTH_REQUIRED_MESSAGE].includes(message(error))) setNeedsAssurance(true);
    else { unresolved.current.set(target.id, originalReview.current); setUncertain(true); setAllowReplay(false); }
  }
  async function latest() {
    const target = capture(); if (!target || working.current) return;
    working.current = true; setBusy(true);
    try {
      const next = await utils.client.admin.getSellerActivation.query({ id: target.id });
      if (!accept(next, target)) return;
      const pendingOriginal = originalReview.current && next.application?.status === "pending" && next.application.revision === originalReview.current.expectedRevision;
      if (pendingOriginal && uncertain) {
        setAllowReplay(true); setProblem("No decision receipt was found. You can check again or retry the original decision with its existing request ID.");
      } else {
        unresolved.current.delete(target.id); setUncertain(false); setStale(false); setConfirmation(null); setAllowReplay(false); originalReview.current = null;
        setProblem(next.application?.status === "pending" ? "Latest application loaded. Review it before confirming a decision." : null);
      }
      void queue.refetch();
    } catch (error) { handleError(error, target); }
    finally { working.current = false; if (matches(target)) setBusy(false); }
  }
  async function decide(replay = false) {
    const target = capture();
    if (!target || working.current || (!replay && (!canDecide || !confirmation)) || (replay && (!allowReplay || !originalReview.current || needsAssurance || !assuranceReady || stale || unsafeRead || originalReview.current.id !== target.id || originalReview.current.expectedRevision !== target.revision))) return;
    const payload = replay ? originalReview.current! : {
      id: target.id, expectedRevision: target.revision, reviewRequestId: crypto.randomUUID(), decision: confirmation!, note: note.trim(),
    };
    originalReview.current = payload; working.current = true; setBusy(true); setProblem(null);
    try {
      const next = await review.mutateAsync(payload);
      if (!accept(next, target)) return;
      if (next.application?.reviewedRevision !== payload.expectedRevision || next.application.reviewDecision !== payload.decision) {
        unresolved.current.set(target.id, payload); setUncertain(true); setProblem("The decision receipt needs checking before another action."); return;
      }
      unresolved.current.delete(target.id); setUncertain(false); setStale(false); setConfirmation(null); setAllowReplay(false); originalReview.current = null;
      void queue.refetch();
    } catch (error) { handleError(error, target); }
    finally { working.current = false; if (matches(target)) setBusy(false); }
  }
  async function activate() {
    const target = capture();
    if (!target || working.current || unsafeRead || uncertain || !application?.canReconcile || !assuranceReady || needsAssurance || self) return;
    working.current = true; setBusy(true); setProblem(null);
    try {
      const next = await reconcile.mutateAsync({ id: target.id });
      if (!accept(next, target)) return;
      unresolved.current.delete(target.id); setUncertain(false); setStale(false); void queue.refetch();
    } catch (error) { handleError(error, target); }
    finally { working.current = false; if (matches(target)) setBusy(false); }
  }

  return <section className="space-y-5" aria-label="Seller applications">
    <div><h2 className="text-xl font-semibold">Seller applications</h2><p className="text-sm text-muted-foreground">Review supplemental seller information without changing the applicant’s buying approval.</p></div>
    <div className="flex flex-wrap items-end gap-3"><div className="space-y-1"><Label htmlFor="activation-filter">Application status</Label><select id="activation-filter" className="h-11 rounded-md border bg-background px-3 text-sm" disabled={busy} value={filter} onChange={event => { setFilter(event.target.value as typeof filter); setOffset(0); }}><option value="pending">Awaiting review</option><option value="approved">Approved / activation</option><option value="all">All applications</option></select></div><Button variant="outline" disabled={busy || queue.isFetching} onClick={() => void queue.refetch()}>Refresh applications</Button></div>
    {queue.isPending ? <StatePanelLoading label="Loading seller applications" rows={3} /> : queue.isError ? <QueryErrorState title={queueNeedsAssurance ? "Verify your session" : "Seller applications unavailable"} description={queueNeedsAssurance ? "Verify your administrator session to continue." : "The queue could not be checked. Retry before deciding an application."} onRetry={() => void queue.refetch()} isRetrying={queue.isFetching} secondaryAction={queueNeedsAssurance ? { label: "Verify session", href: recoveryHref } : undefined} /> : <>
      {!queue.data?.items.length && <p className="py-6 text-sm text-muted-foreground">No applications in this view.</p>}
      <div className="divide-y rounded-md border">{queue.data?.items.map(row => row.application && <div key={row.application.id} className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0 space-y-1"><h3 className="break-words font-medium">{row.currentBusiness.businessName || "Business application"}</h3><p className="text-sm">{status(row)}</p><p className="text-xs text-muted-foreground">Revision {row.application.revision}{row.application.submittedAt ? ` · Submitted ${new Date(row.application.submittedAt).toLocaleDateString()}` : ""}</p></div><Button variant="outline" disabled={busy || unsafeRead} onClick={() => choose(row)}>Review application</Button></div>)}</div>
      <div className="flex gap-3"><Button variant="outline" disabled={offset === 0 || busy || queue.isFetching} onClick={() => setOffset(value => Math.max(0, value - 25))}>Previous</Button><Button variant="outline" disabled={!queue.data?.hasMore || offset >= 5000 || busy || queue.isFetching} onClick={() => setOffset(value => Math.min(5000, value + 25))}>Next</Button></div>
    </>}
    {selected && application && <section className="space-y-4 rounded-md border p-4 sm:p-5" aria-label="Application review">
      <div className="space-y-1"><h3 className="text-lg font-semibold">{selected.currentBusiness.businessName}</h3><p className="text-sm">{status(selected)}</p><p className="text-xs text-muted-foreground">Application revision {application.revision}</p></div>
      <dl className="space-y-3 text-sm"><div><dt className="text-muted-foreground">Current approved business</dt><dd className="break-words">{[selected.currentBusiness.businessAddress, selected.currentBusiness.businessCity, selected.currentBusiness.businessState, selected.currentBusiness.businessZip].filter(Boolean).join(", ")}</dd></div><div><dt className="text-muted-foreground">Submitted website</dt><dd className="break-all">{application.businessWebsite || "Not supplied"}</dd></div><div><dt className="text-muted-foreground">EIN evidence</dt><dd>{application.hasEin ? `EIN ending in ${application.einLast4}` : "Current EIN evidence unavailable"}</dd></div><div><dt className="text-muted-foreground">Evidence available until</dt><dd>{new Date(application.purgeAfter).toLocaleDateString()}</dd></div></dl>
      {application.document ? <a className="inline-block text-sm underline" href={verificationDocumentHref(application.document.reference)} target="_blank" rel="noreferrer">View supporting document</a> : <p className="text-sm text-destructive">Current supporting document unavailable.</p>}
      {application.reviewNote && <p className="whitespace-pre-wrap break-words text-sm">{application.reviewNote}</p>}
      {self && <p role="alert" className="text-sm">Another administrator must review this application.</p>}
      {application.status === "stale" && <p role="alert" className="text-sm">The approved business or evidence changed. This revision cannot be approved.</p>}
      {!confirmation && problem && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{problem}</p>}
      {(!assuranceReady || needsAssurance) && <p className="text-sm"><Link className="underline" href={recoveryHref}>Verify session</Link> before this sensitive action.</p>}
      {!confirmation && (uncertain || stale) && <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => void latest()}>Review latest application</Button>{allowReplay && <Button disabled={busy || !assuranceReady || needsAssurance} onClick={() => void decide(true)}>Retry original decision</Button>}</div>}
      {application.status === "pending" && <><div className="space-y-2"><Label htmlFor="activation-note">Review note</Label><Textarea id="activation-note" value={note} maxLength={2000} disabled={busy || uncertain || self || stale} onChange={event => setNote(event.target.value)} /><p className="text-xs text-muted-foreground">Explain the decision for the applicant. Do not include EIN or private document contents.</p></div><div className="flex flex-wrap gap-3"><Button disabled={!canDecide} onClick={() => setConfirmation("approved")}>Approve application</Button><Button variant="outline" disabled={!canDecide} onClick={() => setConfirmation("rejected")}>Reject application</Button></div></>}
      {application.canReconcile && <Button disabled={busy || uncertain || unsafeRead || !assuranceReady || needsAssurance || self} onClick={() => void activate()}>Check activation</Button>}
    </section>}
    <Dialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) { setConfirmation(null); if (!uncertain) originalReview.current = null; } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{confirmation === "approved" ? "Approve seller application" : "Reject seller application"}</DialogTitle><DialogDescription>{selected?.currentBusiness.businessName} · revision {application?.revision}. {confirmation === "approved" ? "Approval records the review. Selling remains unavailable until account activation is confirmed." : "This decision affects the seller application, not the existing buying approval."}</DialogDescription></DialogHeader>
        {problem && <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">{problem}</p>}
        {needsAssurance && <Link className="text-sm underline" href={recoveryHref}>Verify session</Link>}
        {(uncertain || stale) && <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => void latest()}>Review latest application</Button>{allowReplay && <Button disabled={busy || needsAssurance || !assuranceReady} onClick={() => void decide(true)}>Retry original decision</Button>}</div>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => { setConfirmation(null); if (!uncertain) originalReview.current = null; }}>Cancel</Button><Button disabled={!canDecide} onClick={() => void decide()}>{confirmation === "approved" ? "Confirm approval" : "Confirm rejection"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
