"use client";

import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { PhotoUpload } from "@/components/listings/photo-upload";
import { useBulkUploadStore } from "@/lib/stores/bulk-upload-store";
import { Loader2 } from "lucide-react";

interface BulkPhotoUploadProps {
  listingId: string;
}

export function BulkPhotoUpload({ listingId }: BulkPhotoUploadProps) {
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
    markListingHasPhotos(listingId, newMediaIds.length);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PhotoUpload
      listingId={listingId}
      onImagesChange={handleImagesChange}
      initialMediaIds={initialMediaIds}
    />
  );
}
