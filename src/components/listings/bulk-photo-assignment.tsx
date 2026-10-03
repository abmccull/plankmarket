"use client";

import { useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { ListingImage } from "@/components/listings/listing-image";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useBulkUploadStore, type BulkListingItem } from "@/lib/stores/bulk-upload-store";
import { useUploadThing } from "@/lib/uploadthing";
import { trpc } from "@/lib/trpc/client";
import { getErrorMessage } from "@/lib/utils";
import { LISTING_PHOTO_ACCEPT, MAX_SOURCE_PHOTO_BYTES, prepareListingPhoto } from "@/lib/marketplace/prepare-listing-photo";

type Assignment = {
  id: string;
  file: File;
  listingId: string;
  status: "review" | "uploaded" | "saved" | "uncertain";
  mediaId?: string;
  recovered?: boolean;
  recoveredPhoto?: { url: string; fileName: string | null };
  error?: string;
};

function LocalPhotoPreview({ file }: { file: File }) {
  const [source, setSource] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    // Object URL allocation belongs to the browser lifecycle, not rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnavailable(false);
    let url: string;
    try { url = URL.createObjectURL(file); }
    catch {
      setUnavailable(true); return;
    }
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
    {source && !unavailable ?
      // Local object URLs cannot use the remote image optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={source} alt={`Preview of ${file.name}`} className="h-full w-full object-contain" onError={() => setUnavailable(true)} />
      : <span className="px-2 text-center text-xs text-muted-foreground">{unavailable ? "Preview unavailable" : "Loading preview…"}</span>}
  </div>;
}

function UploadedPhotoRecovery({ ownerId, fileName, disabled, onSelect, onClose }: {
  ownerId: string; fileName: string; disabled: boolean;
  onSelect: (photo: { id: string; url: string; fileName: string | null }) => boolean; onClose: () => void;
}) {
  const [cursor, setCursor] = useState<{ createdAt: string; id: string }>();
  const [problem, setProblem] = useState<string | null>(null);
  const photos = trpc.upload.getUnattachedPhotos.useQuery({ expectedOwnerId: ownerId, cursor }, {
    enabled: !disabled, retry: false, staleTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false,
  });
  const owned = photos.data?.ownerId === ownerId && !photos.isError && !photos.isFetching;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto">
    <DialogHeader><DialogTitle>Find the uploaded photo</DialogTitle><DialogDescription>Compare these unattached uploads with {fileName}. Choose only the image you recognize. Names alone do not prove a match.</DialogDescription></DialogHeader>
    <p className="text-sm text-muted-foreground">A recent upload may still be processing. Refresh to check again. An empty result does not mean it is safe to upload the file again.</p>
    <Button type="button" variant="outline" className="min-h-11" disabled={disabled || photos.isFetching} onClick={() => void photos.refetch()}>Refresh uploads</Button>
    {photos.isError ? <p role="alert">Uploads could not be checked. Your assignment is unchanged.</p>
      : !owned ? <p role="status">Checking your uploads…</p>
      : photos.data!.items.length === 0 ? <p role="status">No unattached photos found on this page.</p>
      : <ul className="divide-y">{photos.data!.items.map(photo => <li key={photo.id} className="flex items-center gap-3 py-3">
        <ListingImage src={photo.url} alt={photo.fileName || "Unattached uploaded photo"} width={96} height={96} className="h-24 w-24 shrink-0 rounded-md border object-contain" />
        <div className="min-w-0 flex-1"><p className="break-words text-sm">{photo.fileName || "Unnamed photo"}</p><p className="text-xs text-muted-foreground">{new Date(photo.createdAt).toLocaleString()}</p>
          <Button type="button" variant="outline" className="mt-2 min-h-11 whitespace-normal" disabled={disabled} onClick={() => {
            if (onSelect(photo)) onClose(); else setProblem("Your account or selection changed, or this photo is already selected. Your assignment is unchanged.");
          }}>This is my photo</Button></div>
      </li>)}</ul>}
    {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={disabled || photos.isFetching || !cursor} onClick={() => setCursor(undefined)}>Newest uploads</Button>
      <Button type="button" variant="outline" className="min-h-11" disabled={disabled || !owned || !photos.data?.nextCursor} onClick={() => { if (photos.data?.nextCursor) setCursor(photos.data.nextCursor); }}>Older uploads</Button>
      <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>Cancel</Button></div>
  </DialogContent></Dialog>;
}

export function BulkPhotoAssignment({ listings, disabled, onPendingChange, onSaved }: {
  listings: BulkListingItem[];
  disabled: boolean;
  onPendingChange: (pending: boolean) => void;
  onSaved: () => void;
}) {
  const activeActorId = useAuthStore(state => state.user?.id);
  const actorId = useRef(useAuthStore.getState().user?.id);
  const mounted = useRef(false);
  const invalidated = useRef(false);
  const working = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [items, setItems] = useState<Assignment[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [accountChanged, setAccountChanged] = useState(false);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const save = trpc.listing.update.useMutation({ retry: false });
  const { startUpload } = useUploadThing("listingImageUploader");
  const current = () => mounted.current && !invalidated.current &&
    useAuthStore.getState().user?.id === actorId.current &&
    useBulkUploadStore.getState().sellerId === actorId.current;
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = useAuthStore.subscribe(state => {
      if (state.user?.id === actorId.current) return;
      invalidated.current = true;
      controller.current?.abort();
      setAccountChanged(true);
    });
    return () => { mounted.current = false; controller.current?.abort(); unsubscribe(); };
  }, []);
  const pending = items.some(item => item.status !== "saved");
  useEffect(() => { onPendingChange(pending || busy || accountChanged); }, [pending, busy, accountChanged, onPendingChange]);
  useEffect(() => {
    if (!pending && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending, busy]);

  const { getRootProps, getInputProps } = useDropzone({
    accept: LISTING_PHOTO_ACCEPT,
    maxSize: MAX_SOURCE_PHOTO_BYTES,
    maxFiles: 100,
    disabled: disabled || busy || accountChanged,
    onDrop(files, rejected) {
      if (!current() || working.current || disabled) return;
      if (files.length + items.length > 100) {
        setNotice("Review up to 100 photos at a time. Finish or remove this selection first.");
        return;
      }
      setNotice(rejected.length ? "Some files were rejected. Choose supported photos within the file-size limit." : null);
      setItems(old => [...old, ...files.map(file => {
        const stem = file.name.replace(/\.[^.]+$/, "").trim().toLocaleLowerCase();
        const matches = listings.filter(listing => listing.modelNumber?.trim().toLocaleLowerCase() === stem);
        return { id: crypto.randomUUID(), file, listingId: matches.length === 1 ? matches[0].id : "", status: "review" as const };
      })]);
    },
  });
  const patch = (id: string, changes: Partial<Assignment>) => {
    if (current()) setItems(old => old.map(item => item.id === id ? { ...item, ...changes } : item));
  };

  async function processSelection() {
    if (!current() || working.current || disabled || items.some(item => !item.listingId)) return;
    working.current = true;
    setBusy(true);
    setNotice(null);
    const abort = new AbortController();
    controller.current = abort;
    // Freeze reviewed IDs and bytes for this operation. Never bind by row position.
    const selection = items.map(item => ({ ...item }));
    for (const listing of listings) {
      if (!current() || abort.signal.aborted) break;
      const group = selection.filter(item => item.listingId === listing.id && item.status !== "saved" && item.status !== "uncertain");
      if (!group.length) continue;
      try {
        const savedMedia = await utils.client.upload.getListingMedia.query({ listingId: listing.id });
        if (!current() || abort.signal.aborted) break;
        const existingIds = savedMedia.map(media => media.id);
        const recovered = group.filter(item => item.mediaId && existingIds.includes(item.mediaId));
        recovered.forEach(item => { item.status = "saved"; patch(item.id, { status: "saved", error: undefined }); });
        if (recovered.length) {
          utils.upload.getListingMedia.setData({ listingId: listing.id }, savedMedia);
          useBulkUploadStore.getState().markListingHasPhotos(actorId.current!, listing.id, existingIds.length);
          onSaved();
        }
        const remaining = group.filter(item => item.status !== "saved");
        if (existingIds.length + remaining.length > 20) throw new Error("This listing would exceed 20 photos. Remove or reassign photos before continuing.");
        for (const item of remaining) {
          if (!current() || abort.signal.aborted) break;
          if (item.mediaId) continue;
          let prepared: File;
          try { prepared = await prepareListingPhoto(item.file, { signal: abort.signal }); }
          catch (error) { patch(item.id, { error: getErrorMessage(error, "Could not prepare this photo.") }); continue; }
          if (!current() || abort.signal.aborted) break;
          // An uncertain upload must not be repeated automatically: its signed
          // callback may already have created media even without a response.
          try {
            const response = await startUpload([prepared], {});
            if (!current()) break;
            const mediaId = response?.[0]?.serverData?.id;
            if (!mediaId) throw new Error("Upload receipt unavailable");
            item.mediaId = mediaId;
            item.status = "uploaded";
            patch(item.id, { mediaId, status: "uploaded", error: undefined });
          } catch {
            item.status = "uncertain";
            patch(item.id, { status: "uncertain", error: "Upload could not be confirmed and will not be retried automatically. Check your unattached uploads to find the photo. If you cannot identify it, contact support before uploading this file again." });
          }
        }
        if (!current() || abort.signal.aborted) break;
        const ready = remaining.filter(item => item.mediaId && item.status !== "uncertain");
        if (!ready.length) continue;
        const mediaIds = [...new Set(ready.map(item => item.mediaId!))];
        // Once attachment is attempted, retain the exact IDs until read-back
        // resolves a lost response. Selection correction is only pre-write.
        for (const item of ready) patch(item.id, { recovered: false });
        let saveError: unknown;
        try { await save.mutateAsync({ id: listing.id, data: { mediaIds }, appendMedia: true }); }
        catch (error) { saveError = error; }
        if (!current()) break;
        // Reconcile both success and lost responses before allowing another write.
        const fresh = await utils.client.upload.getListingMedia.query({ listingId: listing.id });
        if (!current()) break;
        const freshIds = fresh.map(media => media.id);
        utils.upload.getListingMedia.setData({ listingId: listing.id }, fresh);
        useBulkUploadStore.getState().markListingHasPhotos(actorId.current!, listing.id, freshIds.length);
        for (const item of ready) {
          if (freshIds.includes(item.mediaId!)) patch(item.id, { status: "saved", error: undefined });
          else patch(item.id, { error: getErrorMessage(saveError, "Photo attachment was not confirmed. Review and retry; uploaded bytes are retained.") });
        }
        onSaved();
      } catch (error) {
        for (const item of group.filter(item => item.status !== "saved" && item.status !== "uncertain")) {
          patch(item.id, { error: getErrorMessage(error, "Saved photos could not be checked. Retry the read before continuing.") });
        }
      }
    }
    controller.current = null;
    working.current = false;
    if (current()) setBusy(false);
  }

  if (accountChanged || activeActorId !== actorId.current) {
    return <section className="border-b pb-5"><p role="alert">Your account changed. Reload before assigning photos.</p></section>;
  }
  return <section className="space-y-3 border-b pb-5" aria-labelledby="batch-photos-heading">
    <h2 id="batch-photos-heading" className="text-lg font-semibold">Assign photos to multiple listings</h2>
    <p className="text-sm text-muted-foreground">Choose photos together, then review each destination. A filename exactly matching one SKU is suggested. Photos stay on this page until you confirm.</p>
    {notice && <p role="alert">{notice}</p>}
    {recoveringId && actorId.current && <UploadedPhotoRecovery key={`${actorId.current}:${recoveringId}`} ownerId={actorId.current}
      fileName={items.find(item => item.id === recoveringId)?.file.name || "the selected file"}
      disabled={busy || disabled || accountChanged} onClose={() => setRecoveringId(null)} onSelect={photo => {
        if (!current() || working.current || disabled || items.some(item => item.id !== recoveringId && item.mediaId === photo.id)) return false;
        const candidate = items.find(item => item.id === recoveringId);
        if (!candidate || (candidate.status !== "uncertain" && !(candidate.status === "uploaded" && candidate.recovered))) return false;
        patch(candidate.id, { mediaId: photo.id, recovered: true, recoveredPhoto: { url: photo.url, fileName: photo.fileName }, status: "uploaded", error: "Recovered upload selected. Save reviewed assignments to confirm attachment." });
        return true;
      }} />}
    <div {...getRootProps()} className="cursor-pointer rounded-md border border-dashed p-4 text-sm">
      <input {...getInputProps()} aria-label="Choose photos for batch assignment" />
      Choose photos for these listings
    </div>
    {items.length > 0 && <>
      <p role="status" className="text-sm">{items.filter(item => item.status === "saved").length} of {items.length} photos saved</p>
      <ul className="divide-y">
        {items.map(item => <li key={item.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-start gap-3">{item.recoveredPhoto ? <ListingImage src={item.recoveredPhoto.url} alt={`Selected uploaded photo: ${item.recoveredPhoto.fileName || "unnamed photo"}`} width={96} height={96} className="h-24 w-24 shrink-0 rounded-md border object-contain" /> : <LocalPhotoPreview file={item.file} />}<div className="min-w-0"><p className="break-words text-sm font-medium">{item.recoveredPhoto ? item.recoveredPhoto.fileName || "Unnamed uploaded photo" : item.file.name}</p>{item.recoveredPhoto && <p className="break-words text-xs text-muted-foreground">Existing upload selected for {item.file.name}</p>}{item.error && <p role="alert" className="text-sm text-destructive">{item.error}</p>}</div></div>
          <div><label htmlFor={`assign-${item.id}`} className="text-xs">Listing for {item.file.name}</label>
            <select id={`assign-${item.id}`} className="h-11 w-full min-w-0 rounded-md border bg-background px-2 text-sm" value={item.listingId}
              disabled={busy || disabled || accountChanged || item.status !== "review"}
              onChange={event => patch(item.id, { listingId: event.target.value, error: undefined })}>
              <option value="">Choose a listing</option>
              {listings.map((listing, index) => <option key={listing.id} value={listing.id}>{index + 1}. {listing.title}{listing.modelNumber ? ` — ${listing.modelNumber}` : ""} — {listing.totalSqFt.toLocaleString()} sqft</option>)}
            </select>
          </div>
          {item.status === "saved" ? <span className="self-center text-sm">Saved</span> : <div className="flex flex-wrap items-center gap-2">{(item.status === "uncertain" || item.recovered) && <Button type="button" variant="outline" className="min-h-11" disabled={busy || disabled || accountChanged} onClick={() => setRecoveringId(item.id)}>{item.recovered ? "Choose another upload" : "Find uploaded photo"}</Button>}<Button type="button" variant="ghost" className="min-h-11" disabled={busy || disabled || accountChanged || (item.status === "uploaded" && !item.recovered)}
            onClick={() => setItems(old => old.filter(candidate => candidate.id !== item.id))}>{item.status === "uncertain" ? "Dismiss warning" : "Remove"}</Button></div>}
        </li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={busy || disabled || accountChanged || !pending || items.some(item => !item.listingId) || items.every(item => item.status === "saved" || item.status === "uncertain")}
          onClick={() => void processSelection()}>{busy ? "Saving assigned photos…" : "Save reviewed assignments"}</Button>
        {busy && <Button type="button" variant="outline" className="min-h-11" onClick={() => controller.current?.abort()}>Stop after current upload</Button>}
        {!pending && <Button type="button" variant="outline" onClick={() => setItems([])}>Clear completed selection</Button>}
      </div>
      {pending && <p className="text-sm text-muted-foreground">Finish or remove pending assignments before editing individual photos or publishing. Keep this page open while files are pending.</p>}
    </>}
  </section>;
}
