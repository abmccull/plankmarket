"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useListingFormStore, type Draft } from "@/lib/stores/listing-form-store";
import { LISTING_DRAFT_FIELD_TYPES, listingDraftSnapshotSchema, type ListingDraftSnapshot } from "@/lib/validators/listing-draft";
import type { ListingFormInput } from "@/lib/validators/listing";

export interface PhotoBatch {
  batchId: string;
  ownerId: string;
  ownerEpoch: number;
  mountEpoch: number;
  draftId: string;
  draftGeneration: number;
  revision: number;
  expectedSnapshot: ListingDraftSnapshot;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function changedScope(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return false;
  const data = error.data;
  return Boolean(data && typeof data === "object" && "code" in data && ["CONFLICT", "FORBIDDEN", "UNAUTHORIZED"].includes(String(data.code)));
}

function rejectedFile(error: unknown) {
  if (!error || typeof error !== "object" || !("data" in error)) return false;
  const data = error.data;
  return Boolean(data && typeof data === "object" && "code" in data && data.code === "BAD_REQUEST");
}

function snapshot(): ListingDraftSnapshot {
  const draft = useListingFormStore.getState();
  const fields = Object.fromEntries(Object.entries(draft.formData).filter(([key]) => Object.hasOwn(LISTING_DRAFT_FIELD_TYPES, key)));
  // JSON preserves unfinished numeric fields as null; publication still uses the
  // complete form schema and cannot turn a saved incomplete draft into inventory.
  return listingDraftSnapshotSchema.parse(JSON.parse(JSON.stringify({ schemaVersion: 2, currentStep: draft.currentStep, formData: fields, uploadedMediaIds: draft.uploadedMediaIds, defaultsApplied: draft.defaultsApplied })));
}

export function useAccountListingDraft(sellerId: string) {
  const client = trpc.useUtils().client;
  type Remote = NonNullable<Awaited<ReturnType<typeof client.listing.getFormDraft.query>>>;
  type PhotoReceipt = Awaited<ReturnType<typeof client.listingPhoto.complete.mutate>>;
  const [phase, setPhase] = useState<"loading" | "ready" | "saving" | "saved" | "advancing" | "conflict" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const [resolved, setResolved] = useState(false);
  const [mediaWarning, setMediaWarning] = useState(false);
  const [photoState, setPhotoState] = useState<"idle" | "uploading" | "unknown" | "conflict">("idle");
  const remote = useRef<Remote | null>(null);
  const newId = useRef<string | null>(null);
  const acknowledged = useRef<string | null>(null);
  const mounted = useRef(false);
  const mountEpoch = useRef(0);
  const ownerEpoch = useRef(0);
  const observedOwner = useRef<string | null>(null);
  const photoLock = useRef(false);
  const photoBatch = useRef<PhotoBatch | null>(null);
  const pendingPhoto = useRef<{ binding: PhotoBatch; uploadId: string } | null>(null);
  const loadSequence = useRef(0);
  const phaseRef = useRef(phase);
  const saving = useRef<Promise<{ id: string; revision: number } | null> | null>(null);
  const pendingOperation = useRef<{ operationId: string; snapshot: ListingDraftSnapshot } | null>(null);
  const owner = useCallback(() => mounted.current && useAuthStore.getState().user?.id === sellerId && useListingFormStore.getState().sellerId === sellerId, [sellerId]);
  const capture = useCallback(() => ({ ownerEpoch: ownerEpoch.current, mountEpoch: mountEpoch.current }), []);
  const current = useCallback((binding: { ownerEpoch: number; mountEpoch: number }) => owner() && binding.ownerEpoch === ownerEpoch.current && binding.mountEpoch === mountEpoch.current, [owner]);
  const releasePhotos = useCallback(() => { photoLock.current = false; photoBatch.current = null; pendingPhoto.current = null; setPhotoState("idle"); }, []);
  const transition = useCallback((next: typeof phase, text: string | null = null) => { phaseRef.current = next; setPhase(next); setMessage(text); }, []);

  const accept = useCallback((row: Remote, replace: boolean, remount = true) => {
    setResolved(true);
    remote.current = row;
    const serialized = canonical(row.snapshot);
    acknowledged.current = serialized;
    setMediaWarning(row.mediaAvailability.some(item => item.status !== "available"));
    if (replace) {
      const draft: Draft = { currentStep: row.snapshot.currentStep, formData: row.snapshot.formData as Partial<ListingFormInput>, uploadedMediaIds: row.snapshot.uploadedMediaIds, defaultsApplied: row.snapshot.defaultsApplied };
      useListingFormStore.getState().restoreAccount(draft, row.id, row.revision, serialized, row.publishedListingId);
      if (remount) setGeneration(value => value + 1);
    } else useListingFormStore.getState().acknowledgeAccount(row.id, row.revision, serialized);
    transition(row.state === "published" || canonical(snapshot()) === serialized ? "saved" : "ready");
  }, [transition]);

  const load = useCallback(async () => {
    const binding = capture();
    const sequence = ++loadSequence.current;
    transition("loading");
    try {
      const row = await client.listing.getFormDraft.query({});
      if (!current(binding) || sequence !== loadSequence.current) return;
      const local = useListingFormStore.getState();
      remote.current = row;
      setMediaWarning(Boolean(row?.mediaAvailability.some(item => item.status !== "available")));
      if (local.restoreError) {
        transition("conflict", "This browser's recovery copy could not be read. Your account draft has not been overwritten.");
        return;
      }
      const localSnapshot = canonical(snapshot());
      if (photoLock.current && pendingPhoto.current) {
        setResolved(true);
        transition("conflict", "The account draft changed during photo preparation. Your device's version is intact. Choose which version to continue.");
        return;
      }
      if (!row) {
        if (local.accountDraftId) { transition("error", "The account draft could not be found. Your browser copy is intact. Retry before saving or publishing."); return; }
        newId.current ??= crypto.randomUUID();
        acknowledged.current = null;
        setResolved(true);
        transition("ready");
        return;
      }
      const remoteSnapshot = canonical(row.snapshot);
      const localIsEmpty = local.currentStep === 1 && !local.defaultsApplied && !local.uploadedMediaIds.length &&
        Object.keys(local.formData).every(key => ["allowOffers", "certifications"].includes(key)) &&
        (local.formData.allowOffers === undefined || local.formData.allowOffers === true) &&
        (!local.formData.certifications || local.formData.certifications.length === 0);
      if (row.state === "published") {
        pendingOperation.current = null;
        if (local.publishedListingId || localIsEmpty || localSnapshot === remoteSnapshot || (local.accountDraftId === row.id && localSnapshot === local.accountSnapshot)) accept(row, true);
        else transition("conflict", "This account draft was already published. Your newer device edits are kept here; download them before opening the publication confirmation.");
      } else if (pendingOperation.current?.operationId === row.lastSaveOperationId) {
        pendingOperation.current = null;
        accept(row, false);
      } else if (local.publishedListingId || localIsEmpty || localSnapshot === remoteSnapshot || (local.accountDraftId === row.id && localSnapshot === local.accountSnapshot)) {
        accept(row, true);
      } else if (local.accountDraftId === row.id && local.accountRevision === row.revision && row.state === "editing") {
        acknowledged.current = remoteSnapshot;
        setResolved(true);
        transition("ready");
      } else transition("conflict", "This device and your account have different drafts. Choose which version to continue; neither has been overwritten.");
    } catch {
      if (current(binding) && sequence === loadSequence.current) transition("error", "Your account draft could not be loaded. Your work is still here. Retry to reconcile before saving or publishing.");
    }
  }, [accept, capture, client, current, transition]);

  const save = useCallback(async (photoFlush = false): Promise<{ id: string; revision: number } | null> => {
    const binding = capture();
    while (saving.current) { await saving.current; }
    if (!current(binding) || (photoLock.current && !photoFlush) || !["ready", "saved", "saving"].includes(phaseRef.current)) return null;
    const row = remote.current;
    if (row && row.state !== "editing") return null;
    let next: ListingDraftSnapshot;
    try { next = snapshot(); } catch { transition("error", "Some draft values could not be saved. Your edits remain on this device; review the fields, then retry."); return null; }
    const serialized = canonical(next);
    if (row && acknowledged.current === serialized) return { id: row.id, revision: row.revision };
    const operation = { operationId: crypto.randomUUID(), snapshot: next };
    pendingOperation.current = operation;
    transition("saving");
    const request = (async () => {
      try {
        const saved = await client.listing.saveFormDraft.mutate({ id: row?.id ?? (newId.current ??= crypto.randomUUID()), expectedRevision: row?.revision ?? null, ...operation });
        if (!current(binding)) return null;
        pendingOperation.current = null;
        accept(saved, false);
        return { id: saved.id, revision: saved.revision };
      } catch (error) {
        if (current(binding)) transition("error", error instanceof Error ? `${error.message} Your edits remain here. Retry to check the saved account version.` : "Save was not confirmed. Retry to check the account version before sending again.");
        return null;
      }
    })();
    saving.current = request;
    try { return await request; } finally { saving.current = null; }
  }, [accept, capture, client, current, transition]);
  const saveNow = useCallback(() => save(), [save]);

  const isCurrentPhotoBatch = useCallback((binding: PhotoBatch) => current(binding) && binding.ownerId === sellerId && photoBatch.current?.batchId === binding.batchId && photoBatch.current.revision === binding.revision && photoLock.current, [current, sellerId]);

  const beginPhotoBatch = useCallback(async (): Promise<PhotoBatch | null> => {
    if (!owner() || photoLock.current || !["ready", "saved", "saving"].includes(phaseRef.current)) return null;
    const lifetime = capture();
    photoLock.current = true;
    setPhotoState("uploading");
    // This is the only save allowed through the pause. It serializes behind
    // existing autosave and flushes the latest form snapshot before prepare.
    const saved = await save(true);
    if (!current(lifetime)) return null;
    const row = remote.current;
    if (!saved || !row || row.state !== "editing" || canonical(snapshot()) !== canonical(row.snapshot)) {
      releasePhotos();
      if (saved) transition("error", "Your draft changed while photos were starting. Check the account draft before retrying.");
      return null;
    }
    const binding: PhotoBatch = { batchId: crypto.randomUUID(), ownerId: sellerId, ...lifetime, draftId: row.id, draftGeneration: row.generation, revision: row.revision, expectedSnapshot: row.snapshot };
    photoBatch.current = binding;
    transition("ready");
    return binding;
  }, [capture, current, owner, releasePhotos, save, sellerId, transition]);

  const recordPhotoCompletion = useCallback((binding: PhotoBatch, uploadId: string) => {
    if (!isCurrentPhotoBatch(binding)) return false;
    pendingPhoto.current = { binding, uploadId };
    return true;
  }, [isCurrentPhotoBatch]);

  const acceptPhotoCompletion = useCallback((binding: PhotoBatch, uploadId: string, receipt: PhotoReceipt): PhotoBatch | null => {
    if (!isCurrentPhotoBatch(binding)) return null;
    const row = receipt.draft, previous = remote.current;
    const expected = { ...binding.expectedSnapshot, uploadedMediaIds: [...binding.expectedSnapshot.uploadedMediaIds, receipt.photo.id] };
    if (pendingPhoto.current?.uploadId !== uploadId || pendingPhoto.current.binding.batchId !== binding.batchId || !previous || previous.id !== binding.draftId || previous.generation !== binding.draftGeneration || previous.revision !== binding.revision ||
      canonical(snapshot()) !== canonical(binding.expectedSnapshot) || row.id !== binding.draftId || row.generation !== binding.draftGeneration || row.state !== "editing" ||
      row.revision !== binding.revision + 1 || row.lastSaveOperationId !== uploadId || canonical(row.snapshot) !== canonical(expected) || binding.expectedSnapshot.uploadedMediaIds.includes(receipt.photo.id)) {
      setPhotoState("conflict");
      transition("error", "The account draft changed while this photo was saving. Your local draft is intact. Check it before continuing.");
      return null;
    }
    const next = { ...binding, revision: row.revision, expectedSnapshot: row.snapshot };
    photoBatch.current = next;
    pendingPhoto.current = null;
    // Pause remains set while all metadata and selected IDs change together.
    // Do not increment generation: that would unmount the sequential uploader.
    accept(row, true, false);
    transition("ready");
    return next;
  }, [accept, isCurrentPhotoBatch, transition]);

  const endPhotoBatch = useCallback((binding: PhotoBatch, result: "completed" | "retryable-file-failure" | "unknown" | "conflict") => {
    if (!isCurrentPhotoBatch(binding)) return;
    if (result === "unknown" || result === "conflict") {
      setPhotoState(result);
      transition("error", result === "unknown" ? "This photo's save was not confirmed. Check saved photos before trying again." : "Your draft or account access changed. Check the account draft before continuing.");
      return;
    }
    releasePhotos();
    transition(canonical(snapshot()) === acknowledged.current ? "saved" : "ready");
  }, [isCurrentPhotoBatch, releasePhotos, transition]);

  const reconcilePhotoBatch = useCallback(async (binding: PhotoBatch, uploadId: string): Promise<{ kind: "confirmed"; batch: PhotoBatch; photo: PhotoReceipt["photo"] } | { kind: "file-error"; message: string } | null> => {
    if (!isCurrentPhotoBatch(binding)) return null;
    setPhotoState("uploading");
    let retriedAfterReadback = false;
    try {
      const [row, records] = await Promise.all([client.listing.getFormDraft.query({}), client.listingPhoto.list.query({ expectedOwnerId: sellerId, draftId: binding.draftId })]);
      if (!isCurrentPhotoBatch(binding)) return null;
      if (!row || row.id !== binding.draftId || row.generation !== binding.draftGeneration || row.state !== "editing" || canonical(snapshot()) !== canonical(binding.expectedSnapshot)) {
        endPhotoBatch(binding, "conflict");
        return null;
      }
      const record = records.find(item => item.uploadId === uploadId);
      // Listing a ready object does not select it. A removed or differently
      // edited account snapshot always needs the explicit existing choice.
      if (record) {
        const next = acceptPhotoCompletion(binding, uploadId, { photo: record.photo, draft: row });
        return next ? { kind: "confirmed", batch: next, photo: record.photo } : null;
      }
      if (row.revision !== binding.revision || canonical(row.snapshot) !== canonical(binding.expectedSnapshot)) { endPhotoBatch(binding, "conflict"); return null; }
      // No receipt is not proof of no commit. Retry the same operation only.
      retriedAfterReadback = true;
      const receipt = await client.listingPhoto.complete.mutate({ expectedOwnerId: sellerId, draftId: binding.draftId, uploadId, expectedRevision: binding.revision });
      if (!isCurrentPhotoBatch(binding)) return null;
      const next = acceptPhotoCompletion(binding, uploadId, receipt);
      return next ? { kind: "confirmed", batch: next, photo: receipt.photo } : null;
    } catch (error) {
      if (isCurrentPhotoBatch(binding) && retriedAfterReadback && rejectedFile(error)) {
        if (canonical(snapshot()) !== canonical(binding.expectedSnapshot)) { endPhotoBatch(binding, "conflict"); return null; }
        endPhotoBatch(binding, "retryable-file-failure");
        return { kind: "file-error", message: error instanceof Error ? error.message : "The server rejected this photo." };
      }
      if (isCurrentPhotoBatch(binding)) endPhotoBatch(binding, changedScope(error) ? "conflict" : "unknown");
      return null;
    }
  }, [acceptPhotoCompletion, client, endPhotoBatch, isCurrentPhotoBatch, sellerId]);

  const reconcilePhotoTransfer = useCallback(async (binding: PhotoBatch, uploadId: string): Promise<{ kind: "retry" } | { kind: "confirmed"; batch: PhotoBatch; photo: PhotoReceipt["photo"] } | null> => {
    if (!isCurrentPhotoBatch(binding)) return null;
    setPhotoState("uploading");
    try {
      const [row, records] = await Promise.all([client.listing.getFormDraft.query({}), client.listingPhoto.list.query({ expectedOwnerId: sellerId, draftId: binding.draftId })]);
      if (!isCurrentPhotoBatch(binding)) return null;
      if (!row || row.id !== binding.draftId || row.generation !== binding.draftGeneration || row.state !== "editing" || canonical(snapshot()) !== canonical(binding.expectedSnapshot)) { endPhotoBatch(binding, "conflict"); return null; }
      const record = records.find(item => item.uploadId === uploadId);
      if (record) {
        const next = acceptPhotoCompletion(binding, uploadId, { photo: record.photo, draft: row });
        return next ? { kind: "confirmed", batch: next, photo: record.photo } : null;
      }
      if (row.revision !== binding.revision || canonical(row.snapshot) !== canonical(binding.expectedSnapshot)) { endPhotoBatch(binding, "conflict"); return null; }
      // No draft attachment occurred. The old PUT may still finish, so keep its
      // upload UUID/path for an explicit immutable-path retry, not a new upload.
      endPhotoBatch(binding, "retryable-file-failure");
      return { kind: "retry" };
    } catch (error) {
      if (isCurrentPhotoBatch(binding)) endPhotoBatch(binding, changedScope(error) ? "conflict" : "unknown");
      return null;
    }
  }, [acceptPhotoCompletion, client, endPhotoBatch, isCurrentPhotoBatch, sellerId]);

  const useAccountVersion = useCallback(() => {
    if (!owner()) return;
    releasePhotos();
    if (remote.current) accept(remote.current, true);
    else {
      // Explicitly discard an unread recovery copy only after the seller chooses.
      if (!useListingFormStore.getState().reset()) return;
      newId.current ??= crypto.randomUUID();
      transition("ready");
      setResolved(true);
      setGeneration(value => value + 1);
    }
  }, [accept, owner, releasePhotos, transition]);

  const keepThisVersion = useCallback(async () => {
    if (!owner() || remote.current?.state !== "editing") return;
    releasePhotos();
    acknowledged.current = canonical(remote.current.snapshot);
    transition("ready");
    await saveNow();
  }, [owner, releasePhotos, saveNow, transition]);

  const startNew = useCallback(async () => {
    if (saving.current || photoLock.current) return false;
    if (!owner() || !["ready", "saved"].includes(phaseRef.current)) return false;
    const row = remote.current;
    const binding = capture();
    if (!row) {
      if (!useListingFormStore.getState().reset()) return false;
      newId.current = crypto.randomUUID();
      acknowledged.current = null;
      setGeneration(value => value + 1);
      transition("ready");
      return true;
    }
    transition("advancing");
    try {
      const next = await client.listing.advanceFormDraft.mutate({ id: row.id, expectedRevision: row.revision, nextId: crypto.randomUUID(), operationId: crypto.randomUUID() });
      if (!current(binding)) return false;
      accept(next, true);
      return true;
    } catch {
      if (current(binding)) transition("error", "A new draft was not confirmed. Retry to load the account's current version before continuing.");
      return false;
    }
  }, [accept, capture, client, current, owner, transition]);

  const exportLocal = useCallback(() => {
    const data = useListingFormStore.getState();
    let recovery = JSON.stringify({ currentStep: data.currentStep, formData: data.formData, uploadedMediaIds: data.uploadedMediaIds }, null, 2);
    if (data.storageReadBlocked && data.sellerId) {
      try { recovery = localStorage.getItem(`plankmarket-listing-form:${data.sellerId}`) ?? recovery; } catch { /* Keep the in-memory copy when storage itself is inaccessible. */ }
    }
    const blob = new Blob([recovery], { type: "application/json" });
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href = url; link.download = "plankmarket-draft-recovery.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  useLayoutEffect(() => {
    mounted.current = true;
    // Invalidate responses against the latest epoch when this instance unmounts.
    const invalidateMount = () => { mountEpoch.current++; };
    invalidateMount();
    observedOwner.current = useAuthStore.getState().user?.id ?? null;
    const unsubscribe = useAuthStore.subscribe(state => {
      if (!mounted.current) return;
      const next = state.user?.id ?? null;
      if (next !== observedOwner.current) {
        observedOwner.current = next;
        ownerEpoch.current++;
        photoLock.current = false;
        photoBatch.current = null;
        pendingPhoto.current = null;
        setPhotoState("idle");
        loadSequence.current++;
        setResolved(false);
        transition("loading");
        // A batched A -> B -> A can retain this hook instance. Re-read before
        // exposing edits; generation adoption also replaces the old uploader.
        if (next === sellerId) {
          useListingFormStore.getState().bindSeller(sellerId);
          void load();
        }
      }
    });
    useListingFormStore.getState().bindSeller(sellerId);
    void load();
    return () => { mounted.current = false; invalidateMount(); photoLock.current = false; photoBatch.current = null; pendingPhoto.current = null; unsubscribe(); };
  }, [sellerId, load, transition]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (!owner() || photoLock.current || !["ready", "saved", "saving"].includes(phaseRef.current) || remote.current?.state === "published") return;
      try {
        if (canonical(snapshot()) === acknowledged.current) return;
      } catch { return; }
      if (phaseRef.current === "saved") transition("ready");
      timer = setTimeout(() => { void saveNow(); }, 800);
    };
    const unsubscribe = useListingFormStore.subscribe(schedule);
    schedule();
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [phase, photoState, saveNow, owner, transition]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!owner() || useListingFormStore.getState().publishedListingId) return;
      try { if (!photoLock.current && canonical(snapshot()) === acknowledged.current) return; } catch { /* Retain unsaved malformed values. */ }
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [owner]);

  const canEdit = useCallback(() => owner() && !photoLock.current && !["advancing", "loading", "conflict"].includes(phaseRef.current) && (!remote.current || remote.current.state === "editing"), [owner]);
  const unavailableMediaIds = remote.current?.mediaAvailability.filter(item => item.status !== "available").map(item => item.id) ?? [];
  const removeUnavailablePhotos = () => {
    if (!canEdit()) return;
    const draft = useListingFormStore.getState();
    draft.setMediaIds(draft.uploadedMediaIds.filter(id => !unavailableMediaIds.includes(id)));
  };
  const retry = () => {
    const pending = pendingPhoto.current;
    if (photoState === "unknown" && pending) return reconcilePhotoBatch(pending.binding, pending.uploadId);
    return load();
  };
  return { phase, message, generation, resolved, mediaWarning, unavailableMediaIds, removeUnavailablePhotos, remoteState: remote.current?.state, saveNow, retry, useAccountVersion, keepThisVersion, startNew, exportLocal, canEdit,
    accountDraftId: remote.current?.id ?? null, photoState, photoBlocked: photoState !== "idle", beginPhotoBatch, isCurrentPhotoBatch, recordPhotoCompletion, acceptPhotoCompletion, endPhotoBatch, reconcilePhotoBatch, reconcilePhotoTransfer };
}
