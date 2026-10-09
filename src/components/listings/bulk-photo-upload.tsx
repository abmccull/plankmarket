"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { PhotoUpload } from "@/components/listings/photo-upload";
import { useBulkUploadStore } from "@/lib/stores/bulk-upload-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import {
  QueryErrorState,
  StatePanelLoading,
} from "@/components/ui/state-panel";

interface BulkPhotoUploadProps {
  listingId: string;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}

export function BulkPhotoUpload(props: BulkPhotoUploadProps) {
  const user = useAuthStore((state) => state.user);
  if (!user)
    return <StatePanelLoading label="Loading listing photos" rows={1} />;
  return (
    <OwnedBulkPhotos
      key={user.id + ":" + props.listingId}
      {...props}
      actorId={user.id}
    />
  );
}

function OwnedBulkPhotos({
  listingId,
  actorId,
  onPendingChange,
  disabled = false,
}: BulkPhotoUploadProps & { actorId: string }) {
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [childBlocked, setChildBlocked] = useState(false);
  const childBlockedRef = useRef(false);
  const [readFailed, setReadFailed] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(false),
    working = useRef(false),
    refreshing = useRef(false);
  const utils = trpc.useUtils();
  const query = trpc.upload.getListingMedia.useQuery(
    { listingId },
    { refetchOnWindowFocus: false },
  );
  const save = trpc.listing.update.useMutation({ retry: false });
  const markListingHasPhotos = useBulkUploadStore(
    (state) => state.markListingHasPhotos,
  );
  const current = () =>
    mounted.current &&
    useAuthStore.getState().user?.id === actorId &&
    useBulkUploadStore.getState().sellerId === actorId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const blockedRead = query.isError || readFailed || reviewRequired;
  useEffect(() => {
    onPendingChange?.(
      pendingIds !== null ||
        busy ||
        reading ||
        blockedRead ||
        childBlocked ||
        query.isFetching,
    );
  }, [
    pendingIds,
    busy,
    reading,
    blockedRead,
    childBlocked,
    query.isFetching,
    onPendingChange,
  ]);
  const initialMediaIds = useMemo(
    () => pendingIds ?? query.data?.map((item) => item.id) ?? [],
    [pendingIds, query.data],
  );
  useEffect(() => {
    if (
      query.data &&
      !query.isError &&
      pendingIds === null &&
      !readFailed &&
      useAuthStore.getState().user?.id === actorId &&
      useBulkUploadStore.getState().sellerId === actorId
    )
      markListingHasPhotos(actorId, listingId, query.data.length);
  }, [
    query.data,
    query.isError,
    pendingIds,
    readFailed,
    actorId,
    listingId,
    markListingHasPhotos,
  ]);

  async function refreshMedia() {
    if (!current() || refreshing.current) return false;
    refreshing.current = true;
    setReading(true);
    try {
      await utils.upload.getListingMedia.cancel({ listingId });
      if (!current()) return false;
      const fresh = await utils.client.upload.getListingMedia.query({
        listingId,
      });
      if (!current()) return false;
      await utils.upload.getListingMedia.cancel({ listingId });
      if (!current()) return false;
      utils.upload.getListingMedia.setData({ listingId }, fresh);
      setReadFailed(false);
      setReviewRequired(false);
      const samePending =
        pendingIds !== null &&
        JSON.stringify(pendingIds) ===
          JSON.stringify(fresh.map((item) => item.id));
      if (samePending) setPendingIds(null);
      if (pendingIds === null || samePending)
        markListingHasPhotos(actorId, listingId, fresh.length);
      return true;
    } catch {
      if (current()) setReadFailed(true);
      return false;
    } finally {
      refreshing.current = false;
      if (current()) setReading(false);
    }
  }

  async function savePhotos() {
    if (
      !current() ||
      disabled ||
      working.current ||
      refreshing.current ||
      childBlockedRef.current ||
      blockedRead ||
      pendingIds === null ||
      query.isFetching
    )
      return;
    const mediaIds = [...pendingIds];
    working.current = true;
    setBusy(true);
    setActionError(null);
    try {
      await save.mutateAsync({ id: listingId, data: { mediaIds } });
    } catch (error) {
      if (current()) {
        setReviewRequired(true);
        setActionError(
          (error instanceof Error
            ? error.message
            : "We could not confirm the save.") +
            " Reload saved photos before another attempt; the earlier save may have completed.",
        );
      }
      working.current = false;
      if (current()) setBusy(false);
      return;
    }
    if (!current()) {
      working.current = false;
      return;
    }
    setReceipt("Photo changes saved.");
    setPendingIds(null);
    // Do not use a failed follow-up read as permission to repeat the write.
    setReadFailed(true);
    markListingHasPhotos(actorId, listingId, 0);
    await refreshMedia();
    working.current = false;
    if (current()) setBusy(false);
  }

  if (query.isLoading)
    return <StatePanelLoading label="Loading saved listing photos" rows={1} />;
  return (
    <div className="space-y-3">
      {receipt && (
        <p role="status">
          {receipt}
          {readFailed && !reading && !busy
            ? " The saved-photo list could not refresh. Retry the read before continuing."
            : ""}
        </p>
      )}
      {actionError && <p role="alert">{actionError}</p>}
      {reading ? (
        <StatePanelLoading label="Refreshing saved listing photos" rows={1} />
      ) : blockedRead ? (
        <QueryErrorState
          title="Saved photos unavailable"
          description="We could not confirm the saved photos. Your pending photo choices are kept on this page. Reload before editing, saving or publishing."
          onRetry={() => void refreshMedia()}
          isRetrying={busy}
        />
      ) : (
        <>
          <PhotoUpload
            disabled={disabled || busy}
            listingId={listingId}
            onInteractionBlockedChange={(blocked) => {
              if (current()) {
                childBlockedRef.current = blocked;
                setChildBlocked(blocked);
                onPendingChange?.(
                  blocked ||
                    pendingIds !== null ||
                    busy ||
                    reading ||
                    blockedRead ||
                    query.isFetching,
                );
              }
            }}
            onImagesChange={(newMediaIds) => {
              if (!current() || working.current || refreshing.current) return;
              const savedIds = query.data?.map((item) => item.id) ?? [];
              if (JSON.stringify(newMediaIds) === JSON.stringify(savedIds)) {
                setPendingIds(null);
                return;
              }
              setPendingIds(newMediaIds);
              markListingHasPhotos(actorId, listingId, 0);
            }}
            initialMediaIds={initialMediaIds}
          />
          <Button
            className="min-h-11"
            type="button"
            disabled={
              disabled ||
              pendingIds === null ||
              busy ||
              reading ||
              childBlocked ||
              query.isFetching
            }
            onClick={() => void savePhotos()}
          >
            {busy ? "Saving photos..." : "Save photos"}
          </Button>
          {pendingIds !== null && (
            <p className="text-sm text-muted-foreground">
              Save these photos before moving to another listing or publishing.
            </p>
          )}
        </>
      )}
    </div>
  );
}
