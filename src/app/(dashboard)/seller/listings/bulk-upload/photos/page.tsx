"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useBulkUploadStore } from "@/lib/stores/bulk-upload-store";
import { BulkPhotoUpload } from "@/components/listings/bulk-photo-upload";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils";
import { celebrateMilestone } from "@/lib/utils/celebrate";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function BulkPhotoWizardPage() {
  const router = useRouter();
  const { batchId, listings, currentPhotoIndex, setCurrentPhotoIndex, reset } =
    useBulkUploadStore();

  const publishMutation = trpc.listing.publishBulk.useMutation({
    onSuccess: (data) => {
      celebrateMilestone(
        "Listings Published!",
        `${data.publishedCount} listing${data.publishedCount !== 1 ? "s" : ""} are now live${data.skippedCount > 0 ? `. ${data.skippedCount} skipped (no photos).` : "."}`
      );
      reset();
      router.push("/seller/listings");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to publish listings");
    },
  });

  useEffect(() => {
    if (!batchId || listings.length === 0) {
      router.replace("/seller/listings/bulk-upload");
    }
  }, [batchId, listings.length, router]);

  if (!batchId || listings.length === 0) {
    return null;
  }

  const currentListing = listings[currentPhotoIndex];
  const listingsWithPhotos = listings.filter((l) => l.hasPhotos);
  const progressPercent = (listingsWithPhotos.length / listings.length) * 100;

  const handlePrevious = () => {
    if (currentPhotoIndex > 0) {
      setCurrentPhotoIndex(currentPhotoIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentPhotoIndex < listings.length - 1) {
      setCurrentPhotoIndex(currentPhotoIndex + 1);
    }
  };

  const handlePublish = () => {
    const idsWithPhotos = listingsWithPhotos.map((l) => l.id);
    if (idsWithPhotos.length === 0) {
      toast.error("Add photos to at least one listing before publishing");
      return;
    }
    publishMutation.mutate({ listingIds: idsWithPhotos });
  };

  const handleSaveExit = () => {
    toast.info(
      `${listings.length} listing${listings.length !== 1 ? "s" : ""} saved as drafts. Add photos anytime from your listings page.`
    );
    reset();
    router.push("/seller/listings");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Add Photos</h1>
        <p className="text-muted-foreground mt-1">
          Add photos to your draft listings before publishing
        </p>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {listingsWithPhotos.length} of {listings.length} listings have photos
          </span>
          <span className="text-muted-foreground">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar — listing list */}
        <div className="rounded-lg border overflow-auto max-h-[600px]">
          <div className="p-3 border-b bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Listings ({listings.length})
            </p>
          </div>
          <div className="divide-y">
            {listings.map((listing, index) => (
              <button
                key={listing.id}
                onClick={() => setCurrentPhotoIndex(index)}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-muted/50",
                  index === currentPhotoIndex && "bg-primary/5 border-l-2 border-l-primary"
                )}
              >
                <div className="flex items-center gap-2">
                  {listing.hasPhotos ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Camera className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate font-medium">{listing.title}</span>
                </div>
                <div className="text-xs text-muted-foreground ml-6 mt-0.5">
                  {listing.materialType} &middot; {listing.totalSqFt.toLocaleString()} sqft
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main area */}
        <div className="space-y-4">
          {/* Current listing info */}
          <div className="rounded-lg border p-4 bg-muted/20">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold">{currentListing.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {currentListing.materialType} &middot;{" "}
                  {currentListing.totalSqFt.toLocaleString()} sqft &middot;{" "}
                  {formatCurrency(currentListing.askPricePerSqFt)}/sqft
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                Listing {currentPhotoIndex + 1} of {listings.length}
              </span>
            </div>
          </div>

          {/* Photo upload */}
          <BulkPhotoUpload
            key={currentListing.id}
            listingId={currentListing.id}
          />

          {/* Navigation */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentPhotoIndex === 0}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={handleNext}
                disabled={currentPhotoIndex === listings.length - 1}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
              {!currentListing.hasPhotos && currentPhotoIndex < listings.length - 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNext}
                  className="text-muted-foreground"
                >
                  Skip (No Photos Yet)
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleSaveExit}>
                <LogOut className="mr-2 h-4 w-4" />
                Save as Drafts &amp; Exit
              </Button>
              <Button
                onClick={handlePublish}
                disabled={listingsWithPhotos.length === 0 || publishMutation.isPending}
              >
                {publishMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  `Publish ${listingsWithPhotos.length > 0 ? listingsWithPhotos.length : ""} With Photos`
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
