"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useUploadThing } from "@/lib/uploadthing";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn, getErrorMessage } from "@/lib/utils";
import { Upload, X, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { ListingImage as Image } from "@/components/listings/listing-image";
import { LISTING_PHOTO_ACCEPT, MAX_SOURCE_PHOTO_BYTES, PHOTO_SOURCE_GUIDANCE, prepareListingPhoto } from "@/lib/marketplace/prepare-listing-photo";

interface PhotoUploadProps {
  onImagesChange: (mediaIds: string[]) => void;
  initialMediaIds?: string[];
  listingId?: string;
  disabled?: boolean;
  preserveUnavailable?: boolean;
  onInteractionBlockedChange?: (blocked: boolean) => void;
}

interface UploadedImage {
  id: string;
  url: string;
  fileName: string;
  sortOrder: number;
}

export function PhotoUpload({
  onImagesChange,
  initialMediaIds = [],
  onInteractionBlockedChange,
  disabled = false,
  preserveUnavailable = false,
}: PhotoUploadProps) {
  const actorId = useRef(useAuthStore.getState().user?.id);
  const invalidated = useRef(false);
  const preparation = useRef<AbortController | null>(null);
  const [preparingName, setPreparingName] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [accountChanged, setAccountChanged] = useState(false);
  const mounted = useRef(false),
    uploading = useRef(false);
  const current = useCallback(
    () =>
      mounted.current &&
      !invalidated.current &&
      Boolean(actorId.current) &&
      useAuthStore.getState().user?.id === actorId.current,
    [],
  );
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = useAuthStore.subscribe(state => {
      if (state.user?.id === actorId.current) return;
      invalidated.current = true;
      preparation.current?.abort();
      uploading.current = false;
      setIsUploading(false);
      setPreparingName(null);
      setAccountChanged(true);
      setInputError("Your account changed. Reload this page before adding photos.");
    });
    return () => {
      mounted.current = false;
      preparation.current?.abort();
      unsubscribe();
    };
  }, []);
  const initialIds = useRef(initialMediaIds);
  const hydrated = useRef(initialIds.current.length === 0);
  const {
    data: restoredMedia,
    isLoading: isRestoring,
    error: restoreError,
  } = trpc.upload.getOwnedMedia.useQuery(
    { ids: initialIds.current },
    { enabled: initialIds.current.length > 0, refetchOnWindowFocus: false },
  );
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  useEffect(() => {
    if (mounted.current)
      onInteractionBlockedChange?.(
        accountChanged || isUploading || isRestoring || Boolean(restoreError),
      );
  }, [
    isUploading,
    isRestoring,
    restoreError,
    onInteractionBlockedChange,
    current,
    accountChanged,
  ]);

  useEffect(() => {
    if (!current() || hydrated.current || !restoredMedia) return;
    hydrated.current = true;
    setUploadedImages(
      restoredMedia.map((item, sortOrder) => ({
        id: item.id,
        url: item.url,
        fileName: item.fileName ?? "Photo",
        sortOrder,
      })),
    );
    if (restoredMedia.length !== initialIds.current.length) {
      toast.error(
        "Some saved photos are no longer available. Review the remaining photos before saving.",
      );
      if (!preserveUnavailable) onImagesChange(restoredMedia.map((item) => item.id));
    }
  }, [restoredMedia, onImagesChange, current, preserveUnavailable]);

  const { startUpload } = useUploadThing("listingImageUploader", {
    onClientUploadComplete: async (files) => {
      if (!current()) return;
      if (!files) {
        uploading.current = false;
        setIsUploading(false);
        return;
      }

      try {
        // Upload records are created by UploadThing's signed server callback.
        // Never send client-asserted URLs or keys back to be trusted.
        const records = files.map((file) => file.serverData);
        if (records.some((record) => !record)) {
          throw new Error("Upload metadata was not confirmed by the server");
        }

        // Add to uploaded images list
        const newImages = records.map((record, index) => ({
          id: record!.id,
          url: record!.url,
          fileName: record!.fileName || "Untitled",
          sortOrder: uploadedImages.length + index,
        }));

        const updatedImages = [...uploadedImages, ...newImages];
        setUploadedImages(updatedImages);
        onImagesChange(updatedImages.map((img) => img.id));

        uploading.current = false;
        setIsUploading(false);
        setUploadProgress(0);
        toast.success(
          `${files.length} photo${files.length > 1 ? "s" : ""} uploaded successfully`,
        );
      } catch (error) {
        console.error("Error recording upload:", error);
        toast.error("Failed to save image records");
        uploading.current = false;
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    onUploadError: (error) => {
      if (!current()) return;
      uploading.current = false;
      console.error("Upload error:", error);
      toast.error(getErrorMessage(error, "Failed to upload images"));
      setIsUploading(false);
      setUploadProgress(0);
    },
    onUploadBegin: () => {
      if (!current()) return;
      uploading.current = true;
      setIsUploading(true);
      setUploadProgress(10);
    },
    onUploadProgress: (progress) => {
      if (!current()) return;
      setUploadProgress(progress);
    },
  });

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejected: FileRejection[]) => {
      if (
        !current() ||
        disabled ||
        uploading.current ||
        isRestoring ||
        restoreError
      )
        return;
      const failures = rejected.map(item => `${item.file.name}: ${PHOTO_SOURCE_GUIDANCE}`);
      setInputError(failures.length ? failures.join("\n") : null);
      const remainingSlots = 20 - uploadedImages.length;
      if (acceptedFiles.length > remainingSlots) {
        toast.error(
          `You can only upload ${remainingSlots} more image${remainingSlots !== 1 ? "s" : ""}`,
        );
        return;
      }

      if (acceptedFiles.length === 0) return;

      uploading.current = true;
      setIsUploading(true);
      onInteractionBlockedChange?.(true);
      const controller = new AbortController();
      preparation.current = controller;
      try {
        const prepared: File[] = [];
        for (const file of acceptedFiles) {
          if (!current() || controller.signal.aborted) return;
          setPreparingName(file.name);
          try { prepared.push(await prepareListingPhoto(file, { signal: controller.signal })); }
          catch (error) {
            if (!current()) return;
            failures.push(`${file.name}: ${getErrorMessage(error, "This photo could not be prepared. Try another photo.")}`);
            setInputError(failures.join("\n"));
            if (controller.signal.aborted) return;
          }
        }
        if (!current() || controller.signal.aborted) return;
        preparation.current = null;
        setPreparingName(null);
        if (prepared.length) await startUpload(prepared, {});
      } catch (error) {
        if (current())
          toast.error(getErrorMessage(error, "Failed to upload images"));
      } finally {
        if (preparation.current === controller) preparation.current = null;
        uploading.current = false;
        if (current()) {
          setPreparingName(null);
          setIsUploading(false);
          setUploadProgress(0);
        }
      }
    },
    [
      uploadedImages.length,
      startUpload,
      current,
      disabled,
      isRestoring,
      restoreError,
      onInteractionBlockedChange,
    ],
  );

  const uploadBlocked =
    disabled || accountChanged || isUploading || isRestoring || !!restoreError || uploadedImages.length >= 20;

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: LISTING_PHOTO_ACCEPT,
    maxSize: MAX_SOURCE_PHOTO_BYTES,
    maxFiles: 20,
    disabled: uploadBlocked,
  });

  const handleDelete = (imageId: string) => {
    if (
      !current() ||
      disabled ||
      uploading.current ||
      isRestoring ||
      restoreError
    )
      return;
    const updatedImages = uploadedImages.filter((img) => img.id !== imageId);
    setUploadedImages(updatedImages);
    onImagesChange(updatedImages.map((img) => img.id));
  };

  const handleMoveUp = (index: number) => {
    if (
      !current() ||
      disabled ||
      uploading.current ||
      isRestoring ||
      restoreError
    )
      return;
    if (index === 0) return;
    const newImages = [...uploadedImages];
    [newImages[index - 1], newImages[index]] = [
      newImages[index],
      newImages[index - 1],
    ];
    // Update sort order
    newImages.forEach((img, idx) => {
      img.sortOrder = idx;
    });
    setUploadedImages(newImages);
    onImagesChange(newImages.map((img) => img.id));
  };

  const handleMoveDown = (index: number) => {
    if (
      !current() ||
      disabled ||
      uploading.current ||
      isRestoring ||
      restoreError
    )
      return;
    if (index === uploadedImages.length - 1) return;
    const newImages = [...uploadedImages];
    [newImages[index], newImages[index + 1]] = [
      newImages[index + 1],
      newImages[index],
    ];
    // Update sort order
    newImages.forEach((img, idx) => {
      img.sortOrder = idx;
    });
    setUploadedImages(newImages);
    onImagesChange(newImages.map((img) => img.id));
  };

  return (
    <div className="space-y-4">
      {isRestoring && (
        <p role="status" className="text-sm text-muted-foreground">
          Restoring saved photos...
        </p>
      )}
      {restoreError && (
        <p role="alert" className="text-sm text-destructive">
          Saved photos could not be loaded. Reload this page before editing
          photos.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        First photo is the cover. Changes apply when saved.
      </p>
      {inputError && <p role="alert" className="whitespace-pre-line break-words text-sm text-destructive">{inputError}</p>}
      {/* Upload Counter */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          {uploadedImages.length} / 20 photos uploaded
        </div>
      </div>

      {/* Drop Zone */}
      {uploadedImages.length < 20 && (
        <div
          {...getRootProps()}
          aria-disabled={uploadBlocked}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
            uploadBlocked && "cursor-not-allowed opacity-50",
          )}
        >
          <input {...getInputProps()} aria-label="Upload images" disabled={uploadBlocked} />
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Upload className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">
            {isDragActive
              ? "Drop images here"
              : "Choose photos or drag them here"}
          </p>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG, WebP or HEIC · Up to 25 MB each
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Photos are optimized on your device; originals stay unchanged. HEIC uses a still image. Review detail and color before publishing.</p>

      {/* Upload Progress */}
      {isUploading && (
        <div role="status" className="space-y-2">
          <Progress value={preparingName ? 5 : uploadProgress} className="h-2" aria-label="Photo preparation and upload progress" />
          <p className="break-all text-sm text-muted-foreground">
            {preparingName ? `Preparing ${preparingName}…` : `Uploading… ${uploadProgress}%`}
          </p>
          {preparingName && <Button type="button" variant="outline" className="min-h-11" onClick={() => preparation.current?.abort()}>Cancel preparation</Button>}
        </div>
      )}

      {/* Image Grid */}
      {uploadedImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {uploadedImages.map((image, index) => (
            <div
              key={image.id}
              className="relative group aspect-square rounded-lg overflow-hidden border bg-muted"
            >
              <Image
                src={image.url}
                alt={image.fileName}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                className="object-cover"
                loading="lazy"
              />
              {/* Badge for first image */}
              {index === 0 && (
                <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-medium px-2 py-1 rounded">
                  Cover
                </div>
              )}
              {/* Action buttons */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent sm:bg-black/40 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-11 w-11"
                  onClick={() => handleMoveUp(index)}
                  disabled={
                    disabled ||
                    accountChanged ||
                    isUploading ||
                    isRestoring ||
                    !!restoreError ||
                    index === 0
                  }
                  aria-label="Move image up"
                >
                  <GripVertical className="h-4 w-4 rotate-180" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="h-11 w-11"
                  onClick={() => handleMoveDown(index)}
                  disabled={
                    disabled ||
                    accountChanged ||
                    isUploading ||
                    isRestoring ||
                    !!restoreError ||
                    index === uploadedImages.length - 1
                  }
                  aria-label="Move image down"
                >
                  <GripVertical className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  className="h-11 w-11"
                  onClick={() => handleDelete(image.id)}
                  disabled={
                    disabled || accountChanged || isUploading || isRestoring || !!restoreError
                  }
                  aria-label={`Delete ${image.fileName}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
