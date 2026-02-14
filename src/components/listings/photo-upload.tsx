"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useUploadThing } from "@/lib/uploadthing";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Upload, X, GripVertical, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";

interface PhotoUploadProps {
  onImagesChange: (mediaIds: string[]) => void;
  initialMediaIds?: string[];
}

interface UploadedImage {
  id: string;
  url: string;
  fileName: string;
  sortOrder: number;
}

export function PhotoUpload({ onImagesChange }: PhotoUploadProps) {
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const recordUploadMutation = trpc.upload.recordUpload.useMutation();
  const deleteMediaMutation = trpc.upload.deleteMedia.useMutation();

  const { startUpload } = useUploadThing("listingImageUploader", {
    onClientUploadComplete: async (files) => {
      if (!files) return;

      try {
        // Record uploads in database
        const records = await recordUploadMutation.mutateAsync({
          files: files.map((file) => ({
            url: file.url,
            key: file.key,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          })),
        });

        // Add to uploaded images list
        const newImages = records.map((record, index) => ({
          id: record.id,
          url: record.url,
          fileName: record.fileName || "Untitled",
          sortOrder: uploadedImages.length + index,
        }));

        const updatedImages = [...uploadedImages, ...newImages];
        setUploadedImages(updatedImages);
        onImagesChange(updatedImages.map((img) => img.id));

        setIsUploading(false);
        setUploadProgress(0);
        toast.success(`${files.length} photo${files.length > 1 ? "s" : ""} uploaded successfully`);
      } catch (error) {
        console.error("Error recording upload:", error);
        toast.error("Failed to save image records");
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    onUploadError: (error) => {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload images");
      setIsUploading(false);
      setUploadProgress(0);
    },
    onUploadBegin: () => {
      setIsUploading(true);
      setUploadProgress(10);
    },
    onUploadProgress: (progress) => {
      setUploadProgress(progress);
    },
  });

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const remainingSlots = 20 - uploadedImages.length;
      if (acceptedFiles.length > remainingSlots) {
        toast.error(`You can only upload ${remainingSlots} more image${remainingSlots !== 1 ? "s" : ""}`);
        return;
      }

      if (acceptedFiles.length === 0) return;

      // Validate file sizes (4MB max per UploadThing config)
      const oversizedFiles = acceptedFiles.filter((file) => file.size > 4 * 1024 * 1024);
      if (oversizedFiles.length > 0) {
        toast.error(`Some files exceed 4MB limit: ${oversizedFiles.map((f) => f.name).join(", ")}`);
        return;
      }

      await startUpload(acceptedFiles);
    },
    [uploadedImages.length, startUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
    },
    maxFiles: 20,
    disabled: isUploading || uploadedImages.length >= 20,
  });

  const handleDelete = async (imageId: string) => {
    try {
      await deleteMediaMutation.mutateAsync({ id: imageId });
      const updatedImages = uploadedImages.filter((img) => img.id !== imageId);
      setUploadedImages(updatedImages);
      onImagesChange(updatedImages.map((img) => img.id));
      toast.success("Image deleted");
    } catch (error) {
      console.error("Error deleting image:", error);
      toast.error("Failed to delete image");
    }
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newImages = [...uploadedImages];
    [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
    // Update sort order
    newImages.forEach((img, idx) => {
      img.sortOrder = idx;
    });
    setUploadedImages(newImages);
    onImagesChange(newImages.map((img) => img.id));
  };

  const handleMoveDown = (index: number) => {
    if (index === uploadedImages.length - 1) return;
    const newImages = [...uploadedImages];
    [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
    // Update sort order
    newImages.forEach((img, idx) => {
      img.sortOrder = idx;
    });
    setUploadedImages(newImages);
    onImagesChange(newImages.map((img) => img.id));
  };

  return (
    <div className="space-y-4">
      {/* Upload Counter */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">
          {uploadedImages.length} / 20 photos uploaded
        </div>
        {uploadedImages.length > 0 && (
          <div className="text-xs text-muted-foreground">
            <AlertCircle className="inline h-3 w-3 mr-1" />
            First image will be the cover photo
          </div>
        )}
      </div>

      {/* Drop Zone */}
      {uploadedImages.length < 20 && (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
            isUploading && "pointer-events-none opacity-50"
          )}
        >
          <input {...getInputProps()} aria-label="Upload images" />
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Upload className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium mb-1">
            {isDragActive
              ? "Drop images here"
              : "Drag and drop images, or click to select"}
          </p>
          <p className="text-xs text-muted-foreground">
            PNG, JPG, or WEBP (max 4MB each, up to {20 - uploadedImages.length} more)
          </p>
        </div>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="space-y-2">
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-xs text-center text-muted-foreground">
            Uploading... {uploadProgress}%
          </p>
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
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent sm:bg-black/40 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-9 w-9"
                  onClick={() => handleMoveUp(index)}
                  disabled={index === 0}
                  aria-label="Move image up"
                >
                  <GripVertical className="h-4 w-4 rotate-180" />
                </Button>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-9 w-9"
                  onClick={() => handleMoveDown(index)}
                  disabled={index === uploadedImages.length - 1}
                  aria-label="Move image down"
                >
                  <GripVertical className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="destructive"
                  className="h-9 w-9"
                  onClick={() => handleDelete(image.id)}
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
