"use client";

import { useRef, useState } from "react";
import { ListingImage as Image } from "@/components/listings/listing-image";
import { ChevronLeft, ChevronRight, Expand, ImageOff, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface MediaItem {
  id: string;
  url: string;
}

function ListingPhoto({
  image,
  alt,
  inspection = false,
  thumbnail = false,
}: {
  image: MediaItem;
  alt: string;
  inspection?: boolean;
  thumbnail?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (failed) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-3 text-muted-foreground">
        <ImageOff className={thumbnail ? "h-6 w-6" : "h-10 w-10"} aria-hidden="true" />
        <span className={thumbnail ? "sr-only" : "text-sm"}>Photo unavailable</span>
        {inspection && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setAttempt((value) => value + 1);
              setFailed(false);
            }}
          >
            Retry photo
          </Button>
        )}
      </div>
    );
  }

  return (
    <Image
      key={attempt}
      src={image.url}
      alt={alt}
      fill
      sizes={thumbnail ? "80px" : inspection ? "(max-width: 1280px) 100vw, 1152px" : "(max-width: 1024px) 100vw, 66vw"}
      className={inspection ? "object-contain" : "object-cover"}
      unoptimized={inspection}
      loading={thumbnail ? "lazy" : "eager"}
      onError={() => setFailed(true)}
    />
  );
}

function NoPhotos() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-muted-foreground">
      <Package className="h-12 w-12" aria-hidden="true" />
      <p className="text-sm">No listing photos available.</p>
    </div>
  );
}

export function ImageGallery({
  media,
  title,
}: {
  media: MediaItem[] | null | undefined;
  title: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const galleryRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const items = media ?? [];
  const selectedIndex = Math.max(0, items.findIndex((image) => image.id === selectedId));
  const selectedImage = items[selectedIndex];

  // Reconcile only when the selected identity changes, before rendering children.
  // This also prevents a removed photo being selected again if it later returns.
  if (selectedId !== (selectedImage?.id ?? null)) {
    setSelectedId(selectedImage?.id ?? null);
  }

  function movePhoto(direction: -1 | 1) {
    if (items.length < 2) return;
    const nextIndex = (selectedIndex + direction + items.length) % items.length;
    setSelectedId(items[nextIndex].id);
  }

  return (
    <div ref={galleryRef} role="group" aria-label="Listing photos" tabIndex={-1} className="space-y-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Dialog open={open} onOpenChange={setOpen}>
        {selectedImage ? (
          <DialogTrigger asChild>
            <button
              ref={triggerRef}
              type="button"
              aria-label={`View full photo ${selectedIndex + 1} of ${items.length}: ${title}`}
              className="relative block aspect-[16/9] w-full overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ListingPhoto key={`${selectedImage.id}:${selectedImage.url}`} image={selectedImage} alt={`${title}, photo ${selectedIndex + 1} of ${items.length}`} />
              <span className="absolute bottom-3 right-3 inline-flex min-h-11 items-center gap-2 rounded-md bg-background/95 px-3 text-sm font-semibold text-foreground shadow-sm" aria-hidden="true">
                <Expand className="h-4 w-4" /> View full photo
              </span>
            </button>
          </DialogTrigger>
        ) : (
          <div className="aspect-[16/9] overflow-hidden rounded-xl bg-muted"><NoPhotos /></div>
        )}

        <DialogContent
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-6xl gap-3 overflow-y-auto p-4 sm:p-6 [&>button:last-child]:flex [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:right-2 [&>button:last-child]:top-2"
          onCloseAutoFocus={(event) => {
            if (!triggerRef.current) {
              event.preventDefault();
              galleryRef.current?.focus();
            }
          }}
          onKeyDown={(event) => {
            if (event.altKey || event.ctrlKey || event.metaKey || items.length < 2) return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              movePhoto(event.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          <DialogHeader className="pr-10 text-left">
            <DialogTitle className="break-words leading-snug">Photos of {title}</DialogTitle>
            <DialogDescription>
              View the full photo without cropping.{items.length > 1 && " Use the left and right arrow keys to move between photos."}
            </DialogDescription>
          </DialogHeader>
          <div className="relative h-[min(58dvh,42rem)] min-h-40 overflow-hidden rounded-md bg-muted">
            {selectedImage ? (
              <ListingPhoto key={`${selectedImage.id}:${selectedImage.url}`} image={selectedImage} alt={`${title}, photo ${selectedIndex + 1} of ${items.length}`} inspection />
            ) : <NoPhotos />}
          </div>
          {selectedImage && (
            <p role="status" aria-live="polite" aria-atomic="true" className="text-center text-sm text-muted-foreground">
              Photo {selectedIndex + 1} of {items.length}
            </p>
          )}
          {items.length > 1 && (
            <div className="flex justify-between gap-3">
              <Button type="button" variant="outline" className="min-h-11" aria-label="Previous photo" onClick={() => movePhoto(-1)}>
                <ChevronLeft aria-hidden="true" /> Previous
              </Button>
              <Button type="button" variant="outline" className="min-h-11" aria-label="Next photo" onClick={() => movePhoto(1)}>
                Next <ChevronRight aria-hidden="true" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {items.length > 1 && (
        <div className="flex gap-2 overflow-x-auto p-1 pb-2" role="group" aria-label="Choose a listing photo">
          {items.map((image, index) => (
            <button
              key={image.id}
              type="button"
              aria-label={`Show photo ${index + 1} of ${items.length}`}
              aria-pressed={index === selectedIndex}
              onClick={() => setSelectedId(image.id)}
              className={cn(
                "relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                index === selectedIndex ? "ring-2 ring-primary ring-offset-2" : "opacity-70 hover:opacity-100",
              )}
            >
              <ListingPhoto key={`${image.id}:${image.url}`} image={image} alt="" thumbnail />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
