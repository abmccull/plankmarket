"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { resaleReviewSchema, resaleRuleSchema } from "@/lib/validators/resale";
import { verificationDocumentHref } from "@/lib/verification-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";
type RouterOutputs = inferRouterOutputs<AppRouter>;
type Rule = RouterOutputs["resale"]["rules"][number];
type Certificate = RouterOutputs["resale"]["queue"]["items"][number]["certificate"];
function RuleEditor({ rule, onSaved }: { rule?: Rule; onSaved: () => void }) {
  const mutation = trpc.resale.saveRule.useMutation();
  const [problem, setProblem] = useState<string | null>(null);
  return <details className="rounded-md border p-4"><summary className="cursor-pointer font-medium">{rule ? `${rule.state} · ${rule.enabled ? "Enabled" : "Disabled"} · revision ${rule.revision}` : "Configure a destination state"}</summary>
    <form className="mt-4 space-y-4" onSubmit={async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const parsed = resaleRuleSchema.safeParse({ ...f, expectedRevision: rule?.revision ?? 0, enabled: f.enabled === "on", freightExempt: f.freightExempt === "on", electronicTexas: f.electronicTexas === "on" }); if (!parsed.success) { setProblem(parsed.error.issues[0].message); return; } try { await mutation.mutateAsync(parsed.data); setProblem(null); onSaved(); } catch (e) { setProblem(e instanceof Error ? e.message : "Could not save"); } }}>
      <p className="text-sm text-muted-foreground">Use a reviewed state policy covering marketplace liability, accepted certificate forms, recipient identity and retention. Changing this rule requires existing certificates to be reviewed again.</p>
      <fieldset disabled={mutation.isPending} className="space-y-3">
        {([["state", "Destination state (two letters)", rule?.state], ["policyReference", "Reviewed policy reference", rule?.policyReference], ["recipientName", "Certificate recipient legal name", rule?.recipientName], ["recipientAddress", "Recipient full business address", rule?.recipientAddress]] as const).map(([name, label, value]) => <div key={name}><Label htmlFor={`${rule?.state ?? "new"}-${name}`}>{label}</Label><Input id={`${rule?.state ?? "new"}-${name}`} name={name} required defaultValue={value ?? ""} readOnly={name === "state" && !!rule} /></div>)}
        <label className="flex gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={rule?.enabled} />Enable this reviewed state policy</label>
        <label className="flex gap-2 text-sm"><input name="freightExempt" type="checkbox" defaultChecked={rule?.freightExempt} />Policy exempts associated freight on eligible resale purchases</label>
        <label className="flex gap-2 text-sm"><input name="electronicTexas" type="checkbox" defaultChecked={rule?.electronicTexas} />Accept the electronic Texas certificate template (Texas only)</label>
        <Button type="submit">{mutation.isPending ? "Saving…" : "Save state policy"}</Button>
      </fieldset>{problem && <p role="alert" className="text-destructive">{problem}</p>}
    </form></details>;
}
function CertificateReview({ certificate: c, identityChanged, onSaved }: { certificate: Certificate; identityChanged: boolean; onSaved: () => void }) {
  const review = trpc.resale.review.useMutation();
  const [problem, setProblem] = useState<string | null>(null);
  const stamp = (date: Date | null) => date ? new Date(date).toISOString().slice(0, 10) : "";
  return <article className="space-y-3 border-b py-5">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="font-semibold">{c.data.legalName} · {c.state}</h2><span className="text-sm capitalize">{c.status}</span></div>
    <p className="text-sm">Submitted {new Date(c.createdAt).toLocaleDateString()} · {c.format === "upload" ? "Uploaded certificate" : "Electronic Texas certificate"}</p>
    {identityChanged && <p className="text-sm text-destructive">Business details changed. Request a replacement certificate.</p>}
    {c.expiresAt && <p className="text-sm">Expires {new Date(c.expiresAt).toLocaleDateString()}</p>}
    {c.documentId && <a className="inline-block min-h-11 py-2 text-sm underline" href={verificationDocumentHref(`verification-document:${c.documentId}`)} target="_blank" rel="noreferrer">Download private certificate</a>}
    <details><summary className="cursor-pointer text-sm">Signed details</summary><dl className="mt-3 space-y-2 text-sm">{Object.entries(c.data).map(([key, value]) => <div key={key}><dt className="font-medium">{key.replace(/([A-Z])/g, " $1")}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl></details>
    <p className="text-sm text-muted-foreground">Check the signed form, buyer identity and permit, destination coverage, recipient, eligible goods and validity dates against the state policy. Approval applies only to this state.</p>
    <form className="space-y-3" onSubmit={async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); const parsed = resaleReviewSchema.safeParse({ id: c.id, expectedUpdatedAt: c.updatedAt, status: f.status, note: f.note, validFrom: f.validFrom ? new Date(`${f.validFrom}T00:00:00.000Z`) : null, expiresAt: f.expiresAt ? new Date(`${f.expiresAt}T00:00:00.000Z`) : null }); if (!parsed.success) { setProblem(parsed.error.issues[0].message); return; } try { await review.mutateAsync(parsed.data); setProblem(null); onSaved(); } catch (e) { setProblem(e instanceof Error ? e.message : "Review failed"); } }}>
      <fieldset disabled={review.isPending} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor={`${c.id}-status`}>Decision</Label><select id={`${c.id}-status`} name="status" defaultValue="approved" className="h-11 w-full rounded-md border bg-background px-2"><option value="approved">Approve</option><option value="rejected">Request correction</option><option value="revoked">Revoke</option></select></div><div><Label htmlFor={`${c.id}-from`}>Valid from</Label><Input id={`${c.id}-from`} name="validFrom" type="date" defaultValue={stamp(c.validFrom ?? c.createdAt)} /></div><div><Label htmlFor={`${c.id}-expires`}>Not valid on/after (optional)</Label><Input id={`${c.id}-expires`} name="expiresAt" type="date" defaultValue={stamp(c.expiresAt)} /></div></div>
        <div><Label htmlFor={`${c.id}-note`}>Review result / instructions to buyer</Label><Input id={`${c.id}-note`} name="note" required maxLength={2000} defaultValue={c.reviewNote ?? ""} /></div><Button type="submit">{review.isPending ? "Saving…" : "Save review"}</Button>
      </fieldset>{problem && <p role="alert" className="text-destructive">{problem}</p>}
    </form>
  </article>;
}
export default function ResaleAdminPage() {
  const [view, setView] = useState<"exceptions" | "all">("exceptions");
  const [page, setPage] = useState(0);
  const queue = trpc.resale.queue.useQuery({ view, page });
  const rules = trpc.resale.rules.useQuery();
  const utils = trpc.useUtils();
  const refresh = () => { void Promise.all([utils.resale.queue.invalidate(), utils.resale.rules.invalidate(), utils.resale.list.invalidate(), utils.resale.eligibility.invalidate()]); };
  return <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6"><h1 className="text-2xl font-semibold">Resale certificates</h1><p className="text-muted-foreground">Review new submissions and exceptions. Approved certificates are reused automatically for eligible purchases.</p>
    <details><summary className="cursor-pointer font-medium">State policies</summary><div className="mt-4 space-y-3">{rules.isLoading ? <p role="status">Loading policies…</p> : rules.error ? <p role="alert">Could not load policies. <button className="underline" onClick={() => void rules.refetch()}>Retry</button></p> : <>{rules.data?.map(rule => <RuleEditor key={`${rule.state}-${rule.revision}`} rule={rule} onSaved={refresh} />)}<RuleEditor key={`new-${rules.data?.length}`} onSaved={refresh} /></>}</div></details>
    <div className="flex gap-3"><Button variant={view === "exceptions" ? "default" : "outline"} onClick={() => { setView("exceptions"); setPage(0); }}>Needs attention</Button><Button variant={view === "all" ? "default" : "outline"} onClick={() => { setView("all"); setPage(0); }}>All certificates</Button></div>
    {queue.isLoading ? <p role="status">Loading certificates…</p> : queue.error ? <div role="alert"><p>Could not load certificates.</p><Button onClick={() => void queue.refetch()}>Retry</Button></div> : queue.data?.items.length ? queue.data.items.map(item => <CertificateReview key={`${item.certificate.id}-${item.certificate.updatedAt.toISOString()}`} certificate={item.certificate} identityChanged={item.identityChanged} onSaved={refresh} />) : <p className="py-8 text-muted-foreground">{view === "exceptions" ? "No certificates need attention." : "No certificates have been submitted."}</p>}
    <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button><span className="text-sm">Page {page + 1}</span><Button variant="outline" disabled={!queue.data?.hasMore} onClick={() => setPage(p => p + 1)}>Next</Button></div>
  </div>;
}
