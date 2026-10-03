"use client";
import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Dimensions = { palletLength: number; palletWidth: number; palletHeight: number };
export function ReusePalletDialog({ sellerId, disabled, onApply }: { sellerId: string; disabled: boolean; onApply: (dimensions: Dimensions) => boolean }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button" variant="outline" className="mb-3 min-h-11" disabled={disabled}>Use previous pallet dimensions</Button></DialogTrigger>
    {open && <PalletPicker key={sellerId} sellerId={sellerId} disabled={disabled} onApply={onApply} close={() => setOpen(false)} />}
  </Dialog>;
}
function PalletPicker({ sellerId, disabled, onApply, close }: { sellerId: string; disabled: boolean; onApply: (dimensions: Dimensions) => boolean; close: () => void }) {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmedSignature, setConfirmedSignature] = useState<string | null>(null);
  const activeOwnerId = useAuthStore(state => state.user?.id);
  const invalidatedRef = useRef(false);
  const [invalidated, setInvalidated] = useState(false);
  useEffect(() => useAuthStore.subscribe(state => {
    if (state.user?.id !== sellerId) { invalidatedRef.current = true; setInvalidated(true); }
  }), [sellerId]);
  const accountValid = !invalidated && activeOwnerId === sellerId;
  const [problem, setProblem] = useState<string | null>(null);
  const query = trpc.listing.getReusablePallets.useQuery({ expectedOwnerId: sellerId, page }, { enabled: !disabled && accountValid, retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false });
  const owned = accountValid && !disabled && !query.isFetching && !query.isError && query.data?.ownerId === sellerId && query.data.page === page;
  const selected = owned ? query.data!.items.find(item => item.id === selectedId) : undefined;
  const signature = selected ? JSON.stringify([sellerId, selected.id, selected.dimensions.palletLength, selected.dimensions.palletWidth, selected.dimensions.palletHeight]) : null;
  const confirmed = signature !== null && confirmedSignature === signature;
  const changePage = (next: number) => { setSelectedId(null); setConfirmedSignature(null); setPage(next); };
  if (!accountValid) return <DialogContent><DialogHeader><DialogTitle>Account changed</DialogTitle><DialogDescription>Close this review and reopen it from your current account before reusing pallet dimensions.</DialogDescription></DialogHeader><Button type="button" onClick={close}>Close review</Button></DialogContent>;
  return <DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Review previous pallet dimensions</DialogTitle><DialogDescription>Choose a previous listing, then confirm that its dimensions match this pallet. Weight must be entered for the current lot.</DialogDescription></DialogHeader>
    {query.isError ? <div role="alert"><p>Previous dimensions could not be loaded. Your draft is unchanged.</p><Button type="button" variant="outline" disabled={disabled} onClick={() => void query.refetch()}>Retry</Button></div>
      : !owned ? <p role="status">Checking your previous pallets…</p>
      : query.data!.items.length === 0 ? <p>No reusable pallet dimensions found.</p>
      : <div className="space-y-2">{query.data!.items.map(item => <button type="button" key={item.id} aria-pressed={item.id === selectedId} className="min-h-11 w-full rounded-md border p-3 text-left focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setSelectedId(item.id); setConfirmedSignature(null); setProblem(null); }}><span className="block break-words text-sm font-medium">{item.title}</span><span className="text-sm text-muted-foreground">{item.dimensions.palletLength} L × {item.dimensions.palletWidth} W × {item.dimensions.palletHeight} H in</span></button>)}</div>}
    {selected && <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmedSignature(event.target.checked ? signature : null)} />I checked that these dimensions match the current pallet.</label>}
    <p className="text-sm text-muted-foreground">Replaces length, width and height only. Check this lot’s weight before requesting freight quotes.</p>
    {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={!owned || page === 1} onClick={() => changePage(page - 1)}>Previous</Button><Button type="button" variant="outline" disabled={!owned || !query.data?.hasMore} onClick={() => changePage(page + 1)}>Next</Button><Button type="button" variant="ghost" onClick={close}>Cancel</Button><Button type="button" className="min-h-11" disabled={!selected || !confirmed || disabled} onClick={() => { if (!selected || !confirmed || disabled || invalidatedRef.current || useAuthStore.getState().user?.id !== sellerId) return; if (onApply(selected.dimensions)) close(); else setProblem("Your account or draft changed. Finish draft recovery before applying dimensions."); }}>Apply dimensions</Button></div>
  </DialogContent>;
}
