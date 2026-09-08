"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { PhotoUpload } from "@/components/listings/photo-upload";
import { useBulkUploadStore } from "@/lib/stores/bulk-upload-store";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BulkPhotoUploadProps {
  listingId: string;
  onPendingChange?: (pending: boolean) => void;
}

export function BulkPhotoUpload({ listingId, onPendingChange }: BulkPhotoUploadProps) {
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  useEffect(() => { onPendingChange?.(pendingIds !== null); }, [pendingIds, onPendingChange]);
  const utils = trpc.useUtils();
  const save = trpc.listing.update.useMutation({
    onSuccess: async () => { setPendingIds(null); await utils.upload.getListingMedia.invalidate({ listingId }); toast.success("Photos saved"); },
    onError: (error) => toast.error(error.message),
  });
  const markListingHasPhotos = useBulkUploadStore((s) => s.markListingHasPhotos);

  const { data: existingMedia, isLoading } = trpc.upload.getListingMedia.useQuery(
    { listingId },
    { refetchOnWindowFocus: false }
  );

  const initialMediaIds = useMemo(
    () => existingMedia?.map((m) => m.id) ?? [],
    [existingMedia]
  );

  // Sync Zustand store (external system) when media data loads
  const mediaCount = existingMedia?.length ?? 0;
  useEffect(() => {
    if (existingMedia) {
      markListingHasPhotos(listingId, mediaCount);
    }
  }, [existingMedia, listingId, mediaCount, markListingHasPhotos]);

  const handleImagesChange = (newMediaIds: string[]) => {
    setPendingIds(newMediaIds);
    markListingHasPhotos(listingId, 0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
    <PhotoUpload
      listingId={listingId}
      onImagesChange={handleImagesChange}
      initialMediaIds={initialMediaIds}
    />
    <Button type="button" disabled={pendingIds === null || save.isPending} onClick={() => {
      if (pendingIds !== null) save.mutate({ id: listingId, data: { mediaIds: pendingIds } });
    }}>{save.isPending ? "Saving photos..." : "Save photos"}</Button>
    {pendingIds !== null && <p className="text-sm text-muted-foreground">Save these photos before moving to another listing or publishing.</p>}
    </div>
  );
}
