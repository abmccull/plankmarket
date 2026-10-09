"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { useDropzone } from "react-dropzone";
import { ArrowDown, ArrowUp, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useListingFormStore } from "@/lib/stores/listing-form-store";
import { cn } from "@/lib/utils";
import type { PhotoBatch, useAccountListingDraft } from "@/hooks/use-account-listing-draft";
import { LISTING_PHOTO_ACCEPT, MAX_SOURCE_PHOTO_BYTES, PHOTO_SOURCE_GUIDANCE, prepareListingPhoto } from "@/lib/marketplace/prepare-listing-photo";
import type { FileRejection } from "react-dropzone";

interface Photo { id: string; url: string; fileName: string; sortOrder: number }
type Account = ReturnType<typeof useAccountListingDraft>;
type FileState = "queued" | "optimizing" | "preparing" | "transferring" | "completing" | "failed" | "unknown" | "saved";
interface PendingFile {
  uploadId: string;
  file: File;
  preparedFile?: File;
  status: FileState;
  message?: string;
  binding?: PhotoBatch;
  intent?: { uploadId: string; path: string; token: string; expiresAt: Date | string };
  transferred?: boolean;
  attemptedTransfer?: boolean;
  transferUnknown?: boolean;
}
interface Props {
  account: Account;
  ownerId: string;
  mediaIds: string[];
  canRestoreLegacy: boolean;
  disabled?: boolean;
  onImagesChange: (ids: string[]) => void;
  onInteractionBlockedChange: (blocked: boolean) => void;
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  const data = "data" in error ? error.data : null;
  return data && typeof data === "object" && "code" in data && typeof data.code === "string" ? data.code : undefined;
}
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }

class PhotoTransferTimeout extends Error {
  constructor() { super("The transfer did not respond in time. It may still finish. Check saved photos before retrying."); }
}
function boundedTransfer<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PhotoTransferTimeout()), 60_000); });
  // This bounds the wait, not the remote write. Promise.race observes the old
  // promise's later resolution/rejection without resuming this upload sequence.
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timer));
}

export function PrivatePhotoUpload({ account, ownerId, mediaIds, canRestoreLegacy, disabled = false, onImagesChange, onInteractionBlockedChange }: Props) {
  const client = trpc.useUtils().client;
  const [photos, setPhotos] = useState<Record<string, Photo>>({});
  const photoCache = useRef<Record<string, Photo>>({});
  const [files, setFiles] = useState<PendingFile[]>([]);
  const filesRef = useRef<PendingFile[]>([]);
  const [isRestoring, setIsRestoring] = useState(mediaIds.length > 0);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [previewFailures, setPreviewFailures] = useState<Record<string, boolean>>({});
  const [previewAttempts, setPreviewAttempts] = useState<Record<string, number>>({});
  const [working, setWorking] = useState(false);
  const running = useRef(false);
  const preparation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const lifetime = useRef(0);
  const restoreSequence = useRef(0);
  const accountRef = useRef(account);
  accountRef.current = account;
  const current = useCallback((epoch = lifetime.current) => mounted.current && lifetime.current === epoch && useAuthStore.getState().user?.id === ownerId && useListingFormStore.getState().sellerId === ownerId, [ownerId]);
  useLayoutEffect(() => {
    mounted.current = true;
    // This counter fences asynchronous work; cleanup must advance its latest value.
    const invalidateLifetime = () => { lifetime.current++; };
    invalidateLifetime();
    let actor = useAuthStore.getState().user?.id;
    const clearQueue = () => {
      preparation.current?.abort();
      preparation.current = null;
      for (const file of filesRef.current) { file.intent = undefined; file.binding = undefined; }
      filesRef.current = [];
      photoCache.current = {};
      running.current = false;
      restoreSequence.current++;
    };
    const unsubscribe = useAuthStore.subscribe(state => {
      if (!mounted.current) return;
      if (state.user?.id !== actor) {
        actor = state.user?.id;
        invalidateLifetime();
        clearQueue();
        setFiles([]);
        setPhotos({});
        setWorking(false);
        setIsRestoring(false);
        setRestoreError(null);
        setInputError(null);
        setPreviewFailures({});
        setPreviewAttempts({});
        onInteractionBlockedChange(false);
      }
    });
    return () => { mounted.current = false; invalidateLifetime(); clearQueue(); unsubscribe(); };
  }, [onInteractionBlockedChange]);
  const changeFile = useCallback((row: PendingFile, values: Partial<PendingFile>) => {
    Object.assign(row, values);
    if (current()) setFiles([...filesRef.current]);
  }, [current]);
  const rememberPhoto = useCallback((photo: Photo) => { photoCache.current = { ...photoCache.current, [photo.id]: photo }; setPhotos(photoCache.current); }, []);

  const restore = useCallback(async (ids: string[]) => {
    const epoch = lifetime.current, sequence = ++restoreSequence.current;
    if (!current(epoch)) return;
    const missing = ids.filter(id => !photoCache.current[id]);
    if (!missing.length) { setIsRestoring(false); setRestoreError(null); return; }
    setIsRestoring(true);
    setRestoreError(null);
    try {
      const draftId = accountRef.current.accountDraftId;
      const ready = draftId ? await client.listingPhoto.list.query({ expectedOwnerId: ownerId, draftId }) : [];
      if (!current(epoch) || sequence !== restoreSequence.current) return;
      const next = { ...photoCache.current };
      for (const item of ready) if (ids.includes(item.photo.id)) next[item.photo.id] = item.photo;
      const legacyIds = missing.filter(id => !next[id]);
      // Private restoration needs no public-upload permission. Existing legacy
      // media keeps its verified seller gate and the unchanged shared API.
      if (legacyIds.length && canRestoreLegacy) {
        const records = await client.upload.getOwnedMedia.query({ ids: legacyIds });
        if (!current(epoch) || sequence !== restoreSequence.current) return;
        for (const record of records) next[record.id] = { id: record.id, url: record.url, fileName: record.fileName ?? "Photo", sortOrder: record.sortOrder ?? 0 };
      }
      photoCache.current = next;
      setPhotos(next);
      if (ids.some(id => !next[id])) setRestoreError("Some saved photos are unavailable. Your saved selection is unchanged.");
    } catch {
      if (current(epoch) && sequence === restoreSequence.current) setRestoreError("Saved photos could not be loaded. Your saved selection is unchanged.");
    } finally { if (current(epoch) && sequence === restoreSequence.current) setIsRestoring(false); }
  }, [canRestoreLegacy, client, current, ownerId]);
  const mediaKey = mediaIds.join(",");
  useEffect(() => { void restore(mediaKey ? mediaKey.split(",") : []); }, [mediaKey, restore, account.accountDraftId]);
  const blocked = disabled || working || account.photoBlocked || isRestoring || Boolean(restoreError);
  useEffect(() => { onInteractionBlockedChange(working || account.photoBlocked || isRestoring || Boolean(restoreError)); }, [working, account.photoBlocked, isRestoring, restoreError, onInteractionBlockedChange]);

  const run = useCallback(async (rows: PendingFile[]) => {
    if (!current() || disabled || running.current || isRestoring || restoreError || !accountRef.current.canEdit()) return;
    const epoch = lifetime.current;
    running.current = true;
    setWorking(true);
    onInteractionBlockedChange(true);
    let binding = await accountRef.current.beginPhotoBatch();
    if (!current(epoch)) return;
    if (!binding) {
      for (const row of rows) changeFile(row, { status: "failed", message: "Check the account draft before retrying this photo." });
      running.current = false;
      setWorking(false);
      return;
    }
    try {
      for (const row of rows) {
        if (!current(epoch) || !accountRef.current.isCurrentPhotoBatch(binding)) return;
        if (row.binding && (row.binding.draftId !== binding.draftId || row.binding.draftGeneration !== binding.draftGeneration || row.binding.ownerId !== binding.ownerId)) {
          changeFile(row, { status: "failed", message: "This file belongs to an earlier draft. Select it again for this draft." });
          accountRef.current.endPhotoBatch(binding, "retryable-file-failure");
          return;
        }
        row.binding = binding;
        try {
          if (!row.preparedFile) {
            changeFile(row, { status: "optimizing", message: undefined });
            const controller = new AbortController();
            preparation.current = controller;
            try { row.preparedFile = await prepareListingPhoto(row.file, { signal: controller.signal }); }
            finally { if (preparation.current === controller) preparation.current = null; }
            if (!current(epoch) || !accountRef.current.isCurrentPhotoBatch(binding)) return;
          }
          const prepared = row.preparedFile;
          changeFile(row, { status: "preparing", message: undefined });
          // UUID exists in memory before any request. Retrying prepare uses the
          // same immutable identity and never consumes a new upload allowance.
          const mimeType = prepared.type;
          if (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "image/webp") throw new Error("Choose a JPEG, PNG or WebP photo.");
          if (!row.intent) row.intent = await client.listingPhoto.prepare.mutate({ expectedOwnerId: ownerId, draftId: binding.draftId, uploadId: row.uploadId, fileName: prepared.name, fileSize: prepared.size, mimeType });
          if (!current(epoch) || !accountRef.current.isCurrentPhotoBatch(binding)) return;
          if (new Date(row.intent.expiresAt).getTime() <= Date.now()) throw new Error("This upload expired. Remove it from the queue and select the photo again.");
          if (row.attemptedTransfer && !row.transferred) {
            const [draft, ready] = await Promise.all([client.listing.getFormDraft.query({}), client.listingPhoto.list.query({ expectedOwnerId: ownerId, draftId: binding.draftId })]);
            if (!current(epoch) || !accountRef.current.isCurrentPhotoBatch(binding)) return;
            if (!draft || draft.id !== binding.draftId || draft.revision !== binding.revision || ready.some(item => item.uploadId === row.uploadId)) {
              changeFile(row, { status: "unknown", message: "Check the saved photo before continuing." });
              accountRef.current.recordPhotoCompletion(binding, row.uploadId);
              accountRef.current.endPhotoBatch(binding, "unknown");
              return;
            }
          }
          if (!row.transferred) {
            changeFile(row, { status: "transferring" });
            row.attemptedTransfer = true;
            const result = await boundedTransfer(createClient().storage.from("listing-photos").uploadToSignedUrl(row.intent.path, row.intent.token, prepared, { contentType: prepared.type, upsert: false }));
            if (!current(epoch) || !accountRef.current.isCurrentPhotoBatch(binding)) return;
            // An earlier successful transfer may have lost its response. The
            // same immutable signed path cannot be overwritten; completion
            // revalidates the existing bytes before trusting them.
            if (result.error && !("statusCode" in result.error && String(result.error.statusCode) === "409") && !("status" in result.error && String(result.error.status) === "409")) throw result.error;
            row.transferred = true;
          }
          changeFile(row, { status: "completing" });
          if (!accountRef.current.recordPhotoCompletion(binding, row.uploadId)) return;
          const receipt = await client.listingPhoto.complete.mutate({ expectedOwnerId: ownerId, draftId: binding.draftId, uploadId: row.uploadId, expectedRevision: binding.revision });
          if (!current(epoch) || !accountRef.current.isCurrentPhotoBatch(binding)) return;
          const next = accountRef.current.acceptPhotoCompletion(binding, row.uploadId, receipt);
          if (!next) { changeFile(row, { status: "unknown", message: "Check the account draft before continuing." }); return; }
          rememberPhoto(receipt.photo);
          changeFile(row, { status: "saved", message: undefined, binding: next });
          binding = next;
        } catch (error) {
          if (!current(epoch) || !accountRef.current.isCurrentPhotoBatch(binding)) return;
          const code = errorCode(error);
          const conflict = code === "CONFLICT" || code === "FORBIDDEN" || code === "UNAUTHORIZED";
          if (error instanceof PhotoTransferTimeout) {
            accountRef.current.recordPhotoCompletion(binding, row.uploadId);
            changeFile(row, { status: "unknown", transferUnknown: true, message: error.message });
            accountRef.current.endPhotoBatch(binding, "unknown");
          } else if (conflict || (row.status === "completing" && code !== "BAD_REQUEST")) {
            accountRef.current.recordPhotoCompletion(binding, row.uploadId);
            changeFile(row, { status: "unknown", message: conflict ? "Another device changed the draft. Check the account version." : "The photo save was not confirmed." });
            accountRef.current.endPhotoBatch(binding, conflict ? "conflict" : "unknown");
          } else {
            changeFile(row, { status: "failed", message: message(error, "This photo could not be transferred. Retry it when you are ready.") });
            accountRef.current.endPhotoBatch(binding, "retryable-file-failure");
          }
          return;
        }
      }
      accountRef.current.endPhotoBatch(binding, "completed");
    } finally {
      if (current(epoch)) { running.current = false; setWorking(false); }
    }
  }, [changeFile, client, current, disabled, isRestoring, onInteractionBlockedChange, ownerId, rememberPhoto, restoreError]);

  const reconcile = async (row: PendingFile) => {
    if (!current() || running.current || !row.binding) return;
    const epoch = lifetime.current;
    running.current = true;
    setWorking(true);
    try {
      if (row.transferUnknown) {
        const result = await accountRef.current.reconcilePhotoTransfer(row.binding, row.uploadId);
        if (!current(epoch) || !result) return;
        if (result.kind === "retry") {
          changeFile(row, { status: "failed", transferUnknown: false, message: "Your draft is unchanged. Retry this photo using the same upload; its earlier transfer may still finish." });
          return;
        }
        rememberPhoto(result.photo);
        changeFile(row, { status: "saved", transferUnknown: false, message: undefined, binding: result.batch });
        accountRef.current.endPhotoBatch(result.batch, "completed");
        return;
      }
      const receipt = await accountRef.current.reconcilePhotoBatch(row.binding, row.uploadId);
      if (!current(epoch) || !receipt) return;
      if (receipt.kind === "file-error") {
        changeFile(row, { status: "failed", transferUnknown: false, message: `This photo could not be saved. Remove it or resolve the reported problem before retrying. ${receipt.message}` });
        return;
      }
      rememberPhoto(receipt.photo);
      changeFile(row, { status: "saved", message: undefined, binding: receipt.batch });
      accountRef.current.endPhotoBatch(receipt.batch, "completed");
    } finally { if (current(epoch)) { running.current = false; setWorking(false); } }
  };
  const onDrop = useCallback((accepted: File[], rejected: FileRejection[]) => {
    if (!current() || blocked || running.current || !accountRef.current.canEdit()) return;
    setInputError(rejected.length ? `${rejected.map(item => item.file.name).join(", ")}: ${PHOTO_SOURCE_GUIDANCE} Select no more than 20 photos.` : null);
    if (!accepted.length) return;
    const pending = filesRef.current.filter(row => row.status !== "saved");
    if (accepted.length + mediaIds.length + pending.length > 20) { setInputError("You can save up to 20 photos. Remove a saved or queued photo before adding more."); return; }
    const rows: PendingFile[] = accepted.map(file => ({ uploadId: crypto.randomUUID(), file, status: "queued" }));
    filesRef.current = [...filesRef.current.filter(row => row.status !== "saved"), ...rows];
    setFiles([...filesRef.current]);
    void run(rows);
  }, [blocked, current, mediaIds.length, run]);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: LISTING_PHOTO_ACCEPT, maxFiles: 20, maxSize: MAX_SOURCE_PHOTO_BYTES, disabled: blocked || mediaIds.length >= 20 });
  const changeSelection = (ids: string[]) => { if (current() && !blocked && accountRef.current.canEdit()) onImagesChange(ids); };
  const move = (index: number, direction: number) => { const next = [...mediaIds], target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; changeSelection(next); };
  const activeFile = files.find(row => ["optimizing", "preparing", "transferring", "completing"].includes(row.status));
  const progress = activeFile?.status === "completing" ? 85 : activeFile?.status === "transferring" ? 45 : 10;

  return <div className="space-y-4">
    <div className="space-y-1"><p className="text-sm">Photos stay private until you publish.</p><p className="text-xs text-muted-foreground">First photo is the cover. Saved photos stay with your account draft.</p></div>
    <p className="text-sm font-medium">{mediaIds.length} / 20 photos saved</p>
    {isRestoring && <p role="status" className="text-sm text-muted-foreground">Restoring saved photos…</p>}
    {restoreError && <div role="alert" className="space-y-2 text-sm"><p>{restoreError}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={working} onClick={() => void restore(mediaIds)}>Retry saved photos</Button><Button type="button" variant="ghost" disabled={working || account.photoBlocked} onClick={() => void account.retry()}>Check account draft</Button></div></div>}
    {inputError && <p role="alert" className="break-words text-sm text-destructive">{inputError}</p>}
    {mediaIds.length < 20 && <div {...getRootProps()} aria-disabled={blocked} className={cn("rounded-lg border-2 border-dashed p-6 text-center", isDragActive ? "border-primary" : "border-muted-foreground/30", blocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary")}>
      <input {...getInputProps()} aria-label="Upload images" />
      <Upload className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">{isDragActive ? "Drop photos here" : "Choose photos or drag them here"}</p><p className="mt-1 text-xs text-muted-foreground">JPEG, PNG, WebP or HEIC · Up to 25 MB each</p>
    </div>}
    <p className="text-xs text-muted-foreground">Photos are optimized on your device; originals stay unchanged. HEIC uses a still image. Review detail and color before publishing.</p>
    {working && <div role="status" className="space-y-2"><Progress value={progress} aria-label="Photo preparation progress" /><p className="break-all text-sm text-muted-foreground">{activeFile ? `${["optimizing", "preparing"].includes(activeFile.status) ? "Preparing" : activeFile.status === "transferring" ? "Transferring" : "Saving"} ${activeFile.file.name}…` : "Checking your saved photos…"}</p>{activeFile?.status === "optimizing" && <Button type="button" variant="outline" className="min-h-11" onClick={() => preparation.current?.abort()}>Cancel preparation</Button>}</div>}
    {files.filter(row => row.status !== "saved").map(row => <div key={row.uploadId} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-sm">
      <div className="min-w-0"><p className="break-all font-medium">{row.file.name}</p>{row.message && <p role="alert" className="text-muted-foreground">{row.message}</p>}</div>
      {(row.status === "failed" || row.status === "queued") && <div className="flex gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={blocked} aria-label={`Retry upload ${row.file.name}`} onClick={() => void run([row])}>Retry upload</Button><Button type="button" variant="ghost" className="min-h-11" disabled={blocked} aria-label={`Remove queued ${row.file.name}`} onClick={() => { filesRef.current = filesRef.current.filter(file => file !== row); setFiles([...filesRef.current]); }}>Remove</Button></div>}
      {row.status === "unknown" && account.photoState !== "conflict" && <Button type="button" variant="outline" className="min-h-11" disabled={working} onClick={() => void reconcile(row)}>Check saved photos</Button>}
    </div>)}
    {mediaIds.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">{mediaIds.map((id, index) => {
      const photo = photos[id];
      if (!photo) return <div key={id} className="flex aspect-square items-center justify-center rounded-lg border bg-muted p-3 text-center text-xs text-muted-foreground">Saved photo unavailable</div>;
      return <div key={id} className="overflow-hidden rounded-lg border bg-background">
        <div className="relative aspect-square bg-muted">
          <Image key={`${id}:${previewAttempts[id] ?? 0}`} src={photo.url} alt={photo.fileName} unoptimized={photo.url.startsWith("/api/listing-photos/")} fill sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw" className="object-cover" onError={() => setPreviewFailures(values => ({ ...values, [id]: true }))} onLoad={() => setPreviewFailures(values => ({ ...values, [id]: false }))} />
          {index === 0 && <span className="absolute left-2 top-2 rounded bg-background/95 px-2 py-1 text-xs font-medium">Cover</span>}
          {previewFailures[id] && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted px-2 text-center"><p className="text-xs">Photo preview unavailable. Your photo is still saved.</p><Button type="button" variant="outline" className="min-h-11 whitespace-normal" disabled={working} aria-label={`Retry photo preview ${photo.fileName}`} onClick={() => { setPreviewFailures(values => ({ ...values, [id]: false })); setPreviewAttempts(values => ({ ...values, [id]: (values[id] ?? 0) + 1 })); }}>Retry preview</Button></div>}
        </div>
        <div className="flex justify-center gap-1 p-1"><Button type="button" size="icon" variant="ghost" className="h-11 w-11" disabled={blocked || index === 0} aria-label="Move image up" onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" className="h-11 w-11" disabled={blocked || index === mediaIds.length - 1} aria-label="Move image down" onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" className="h-11 w-11" disabled={blocked} aria-label={`Delete ${photo.fileName}`} onClick={() => changeSelection(mediaIds.filter(value => value !== id))}><X className="h-4 w-4" /></Button></div>
      </div>;
    })}</div>}
  </div>;
}
