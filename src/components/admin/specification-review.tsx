"use client";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { specificationKeys, specificationLabel } from "@/lib/product-specifications";

export function SpecificationReview({ listingId, onComplete }: { listingId: string; onComplete: () => void }) {
  const review = trpc.listing.getSpecificationReview.useQuery({ listingId });
  const [evidenceMediaId, setEvidenceMediaId] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const mutation = trpc.listing.reviewSpecifications.useMutation({ onSuccess: onComplete });
  if (review.isLoading) return <p role="status">Loading current specifications…</p>;
  if (review.error) return <div role="alert"><p>{review.error.message}</p><Button onClick={() => void review.refetch()}>Retry</Button></div>;
  if (!review.data) return null;
  const listing = review.data;
  return <div className="space-y-4">
    <p className="font-medium">{listing.title}</p>
    <p>Current source: {specificationLabel(listing.specificationProvenance)}{listing.specificationReviewedAt ? ` · ${new Date(listing.specificationReviewedAt).toLocaleDateString()}` : ""}</p>
    <dl className="grid grid-cols-2 gap-2 text-sm">{specificationKeys.map(key => <div key={key}><dt className="text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</dt><dd>{Array.isArray(listing[key]) ? (listing[key] as string[]).join(", ") || "Unknown" : specificationLabel(String(listing[key] ?? "unknown"))}</dd></div>)}</dl>
    <div className="space-y-2"><Label htmlFor="spec-evidence">Attached manufacturer evidence</Label><select id="spec-evidence" className="h-10 w-full rounded-md border bg-background px-3" value={evidenceMediaId} onChange={e => { setEvidenceMediaId(e.target.value); setConfirmed(false); }}><option value="">Choose a listing image</option>{listing.media.map(m => <option key={m.id} value={m.id}>{m.fileName}</option>)}</select>
      {listing.media.filter(m => m.id === evidenceMediaId).map(m => <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="block underline">Open attached evidence: {m.fileName}</a>)}
      {listing.media.length === 0 && <p>No attached evidence. Ask the seller to upload a legible manufacturer label or specification image before review.</p>}
    </div>
    <div className="space-y-2"><Label htmlFor="spec-review-note">Review notes</Label><Textarea id="spec-review-note" value={reviewNote} maxLength={2000} onChange={e => setReviewNote(e.target.value)} placeholder="Record the manufacturer source and specifications checked." /></div>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>I checked each declared value against this evidence, including any waterproof claim.</span></label>
    {mutation.error && <p role="alert">{mutation.error.message} Reload the listing if it changed during review.</p>}
    <Button disabled={!confirmed || !evidenceMediaId || reviewNote.trim().length < 10 || mutation.isPending} onClick={() => mutation.mutate({ listingId, evidenceMediaId, expectedUpdatedAt: listing.updatedAt, reviewNote })}>{mutation.isPending ? "Saving review…" : "Mark specifications evidence-reviewed"}</Button>
  </div>;
}
