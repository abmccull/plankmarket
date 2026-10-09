"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { StatePanel, StatePanelLoading } from "@/components/ui/state-panel";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { useBulkUploadStore } from "@/lib/stores/bulk-upload-store";
import { BulkPhotoUpload } from "@/components/listings/bulk-photo-upload";
import { BulkPhotoAssignment } from "@/components/listings/bulk-photo-assignment";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCurrency, getErrorMessage } from "@/lib/utils";
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
import Link from "next/link";

export default function BulkPhotoWizardPage() {
  const user = useAuthStore((state) => state.user);
  if (!user)
    return <StatePanelLoading label="Loading your draft listings" rows={2} />;
  return <OwnedBulkPhotoWizard key={user.id} actorId={user.id} />;
}
function OwnedBulkPhotoWizard({ actorId }: { actorId: string }) {
  const mounted = useRef(false),
    publishing = useRef(false);
  const submittedIds = useRef<string[]>([]);
  const current = () =>
    mounted.current &&
    useAuthStore.getState().user?.id === actorId &&
    useBulkUploadStore.getState().sellerId === actorId;
  const router = useRouter();
  const [hasPendingPhotos, setHasPendingPhotos] = useState(false);
  const [hasPendingAssignments, setHasPendingAssignments] = useState(false);
  const [photoRevision, setPhotoRevision] = useState(0);
  const [publicationResult, setPublicationResult] = useState<{
    publishedCount: number;
    alreadyPublishedIds: string[];
    submittedIds: string[];
    alertsPending?: boolean;
    skippedDetails: { id: string; title: string; message: string }[];
  } | null>(null);
  const requireSavedPhotos = () => {
    if (!hasPendingPhotos && !hasPendingAssignments) return true;
    toast.error("Resolve or save your photo changes before continuing");
    return false;
  };
  const {
    sellerId,
    batchId,
    listings,
    currentPhotoIndex,
    setCurrentPhotoIndex,
    reset,
    bindSeller,
    storageWarning,
  } = useBulkUploadStore();

  const publishMutation = trpc.listing.publishBulk.useMutation({
    retry: false,
    onSuccess: (data) => {
      if (!current()) return;
      // Keep the publish lock through this terminal receipt.
      setPublicationResult({
        ...data,
        submittedIds: [...submittedIds.current],
      });
      if (data.publishedCount > 0)
        celebrateMilestone(
          "Listings Published!",
          data.publishedCount +
            " listing" +
            (data.publishedCount === 1 ? "" : "s") +
            " are now live.",
        );
    },
    onError: (error) => {
      if (current()) {
        publishing.current = false;
        toast.error(
          getErrorMessage(
            error,
            "We could not confirm publication. Check Drafts before trying again.",
          ),
        );
      }
    },
  });
  useEffect(() => {
    mounted.current = true;
    bindSeller(actorId);
    return () => {
      mounted.current = false;
    };
  }, [actorId, bindSeller]);
  if (sellerId !== actorId)
    return <StatePanelLoading label="Loading your draft listings" rows={2} />;
  if (!batchId || listings.length === 0)
    return (
      <StatePanel
        icon={Camera}
        title="Continue from your saved drafts"
        description={
          storageWarning ??
          "This photo session is no longer in this browser. Your created listings remain saved; open Drafts to finish photos and publish without importing them again."
        }
        primaryAction={{
          label: "Open saved drafts",
          href: "/seller/listings?status=draft",
        }}
        secondaryAction={{
          label: "Start a new import",
          href: "/seller/listings/bulk-upload",
        }}
      />
    );
  if (publicationResult)
    return (
      <section
        className="max-w-2xl space-y-4"
        aria-labelledby="batch-result-title"
      >
        <h1 id="batch-result-title" className="text-3xl font-bold">
          Publication results
        </h1>
        <p>
          {publicationResult.publishedCount} published ·{" "}
          {publicationResult.alreadyPublishedIds.length} already published ·{" "}
          {publicationResult.skippedDetails.length} submitted listings need
          attention
        </p>
        {listings.some(
          (listing) => !publicationResult.submittedIds.includes(listing.id),
        ) && (
          <p>
            {
              listings.filter(
                (listing) =>
                  !publicationResult.submittedIds.includes(listing.id),
              ).length
            }{" "}
            listings from this browser session were not included in this
            request. Open Drafts to check their saved photos and status.
          </p>
        )}
        {publicationResult.alertsPending && (
          <p role="status">
            Listings are live. Buyer alerts are queued for retry.
          </p>
        )}
        {publicationResult.skippedDetails.length > 0 && (
          <ul className="space-y-3">
            {publicationResult.skippedDetails.map((item) => (
              <li key={item.id}>
                <Link
                  className="inline-flex min-h-11 items-center font-medium underline"
                  href={"/seller/listings/" + item.id + "/edit"}
                >
                  {item.title}
                </Link>
                <p className="text-sm text-muted-foreground">{item.message}</p>
              </li>
            ))}
          </ul>
        )}
        <Button asChild className="min-h-11">
          <Link href="/seller/listings?status=draft" onClick={reset}>
            Review saved drafts
          </Link>
        </Button>
        <Button asChild variant="outline" className="ml-2 min-h-11">
          <Link href="/seller/listings" onClick={reset}>
            Open inventory
          </Link>
        </Button>
      </section>
    );
  const currentListing = listings[currentPhotoIndex];
  const photoActionsBlocked = hasPendingPhotos || hasPendingAssignments || publishMutation.isPending;
  const listingsWithPhotos = listings.filter((l) => l.hasPhotos);
  const progressPercent = (listingsWithPhotos.length / listings.length) * 100;

  const handlePrevious = () => {
    if (!current() || publishing.current) return;
    if (!requireSavedPhotos()) return;
    if (currentPhotoIndex > 0) {
      setCurrentPhotoIndex(currentPhotoIndex - 1);
    }
  };

  const handleNext = () => {
    if (!current() || publishing.current) return;
    if (!requireSavedPhotos()) return;
    if (currentPhotoIndex < listings.length - 1) {
      setCurrentPhotoIndex(currentPhotoIndex + 1);
    }
  };

  const handlePublish = () => {
    if (!current() || publishing.current || publicationResult) return;
    if (!requireSavedPhotos()) return;
    const idsWithPhotos = listingsWithPhotos.map((l) => l.id);
    if (idsWithPhotos.length === 0) {
      toast.error("Add photos to at least one listing before publishing");
      return;
    }
    publishing.current = true;
    submittedIds.current = [...idsWithPhotos];
    publishMutation.mutate({ listingIds: idsWithPhotos });
  };

  const handleSaveExit = () => {
    if (!current() || publishing.current) return;
    if (!requireSavedPhotos()) return;
    toast.info(
      `${listings.length} listing${listings.length !== 1 ? "s" : ""} saved as drafts. Add photos anytime from your listings page.`,
    );
    reset();
    router.push("/seller/listings?status=draft");
  };

  return (
    <div className="space-y-6">
      {storageWarning && <p role="alert">{storageWarning}</p>}
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
            {listingsWithPhotos.length} of {listings.length} listings have
            photos
          </span>
          <span className="text-muted-foreground">
            {Math.round(progressPercent)}%
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      <BulkPhotoAssignment
        key={batchId}
        listings={listings}
        disabled={hasPendingPhotos || publishMutation.isPending}
        onPendingChange={setHasPendingAssignments}
        onSaved={() => { if (current()) setPhotoRevision(value => value + 1); }}
      />
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <div className="space-y-2 lg:hidden">
          <label htmlFor="photo-listing" className="text-sm font-medium">Choose a listing for photos</label>
          <select
            id="photo-listing"
            value={currentListing.id}
            disabled={photoActionsBlocked}
            aria-describedby={photoActionsBlocked ? "photo-selection-pending" : undefined}
            onChange={(event) => {
              const index = listings.findIndex((listing) => listing.id === event.target.value);
              if (index >= 0 && current() && !publishing.current && requireSavedPhotos()) setCurrentPhotoIndex(index);
            }}
            className="flex h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {listings.map((listing, index) => <option key={listing.id} value={listing.id}>{index + 1}. {listing.title} — {listing.hasPhotos ? `${listing.mediaCount} saved photo${listing.mediaCount === 1 ? "" : "s"}` : "No photos yet"}</option>)}
          </select>
          {photoActionsBlocked && <p id="photo-selection-pending" className="text-xs text-muted-foreground">Finish loading, save or resolve pending photos and assignments before choosing another listing.</p>}
        </div>
        {/* Sidebar — listing list */}
        <div className="hidden max-h-[600px] overflow-auto rounded-lg border lg:block">
          <div className="p-3 border-b bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Listings ({listings.length})
            </p>
          </div>
          <div className="divide-y">
            {listings.map((listing, index) => (
              <button
                key={listing.id}
                type="button"
                disabled={photoActionsBlocked}
                aria-current={index === currentPhotoIndex ? "step" : undefined}
                onClick={() => {
                  if (current() && !publishing.current && requireSavedPhotos())
                    setCurrentPhotoIndex(index);
                }}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-muted/50",
                  index === currentPhotoIndex &&
                    "bg-primary/5 border-l-2 border-l-primary",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {listing.hasPhotos ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <Camera className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate font-medium">{listing.title}</span>
                </div>
                <div className="text-xs text-muted-foreground ml-6 mt-0.5">
                  {listing.materialType} &middot;{" "}
                  {listing.totalSqFt.toLocaleString()} sqft
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
                <h2 className="text-lg font-semibold">
                  {currentListing.title}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {currentListing.materialType} &middot;{" "}
                  {currentListing.totalSqFt.toLocaleString()} sqft &middot;{" "}
                  {formatCurrency(currentListing.askPricePerSqFt)}/sqft
                </p>
                {currentListing.modelNumber && (
                  <p className="text-sm text-muted-foreground break-words">
                    SKU: {currentListing.modelNumber}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                Listing {currentPhotoIndex + 1} of {listings.length}
              </span>
            </div>
          </div>

          {/* Photo upload */}
          <BulkPhotoUpload
            disabled={hasPendingAssignments || publishMutation.isPending}
            key={currentListing.id + ":" + photoRevision}
            listingId={currentListing.id}
            onPendingChange={(pending) => {
              if (current()) setHasPendingPhotos(pending);
            }}
          />

          {/* Navigation */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-4 border-t">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="min-h-11"
                variant="outline"
                onClick={handlePrevious}
                disabled={currentPhotoIndex === 0 || photoActionsBlocked}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Previous
              </Button>
              <Button
                className="min-h-11"
                variant="outline"
                onClick={handleNext}
                disabled={
                  currentPhotoIndex === listings.length - 1 ||
                  photoActionsBlocked
                }
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
              {!currentListing.hasPhotos &&
                currentPhotoIndex < listings.length - 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNext}
                    className="min-h-11 text-muted-foreground"
                    disabled={photoActionsBlocked}
                  >
                    Skip (No Photos Yet)
                  </Button>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="min-h-11"
                variant="outline"
                onClick={handleSaveExit}
                disabled={photoActionsBlocked}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Save as Drafts &amp; Exit
              </Button>
              <Button
                className="min-h-11"
                onClick={handlePublish}
                disabled={
                  listingsWithPhotos.length === 0 || photoActionsBlocked
                }
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
