"use client";

import { useState } from "react";
import Image from "next/image";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface MediaItem {
  id: string;
  url: string;
}

export function ImageGallery({
  media,
  title,
}: {
  media: MediaItem[] | null | undefined;
  title: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!media || media.length === 0) {
    return (
      <div className="aspect-[16/9] bg-muted rounded-xl overflow-hidden flex items-center justify-center">
        <Package className="h-16 w-16 text-muted-foreground/50" />
      </div>
    );
  }

  const selectedImage = media[selectedIndex];

  return (
    <div className="space-y-3">
      <div className="aspect-[16/9] bg-muted rounded-xl overflow-hidden relative">
        <Image
          src={selectedImage.url}
          alt={title}
          fill
          sizes="(max-width: 1024px) 100vw, 66vw"
          className="object-cover"
          priority
        />
      </div>

      {media.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {media.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setSelectedIndex(i)}
              className={cn(
                "h-20 w-20 rounded-md bg-muted overflow-hidden shrink-0 relative ring-offset-background transition-all",
                i === selectedIndex
                  ? "ring-2 ring-primary ring-offset-2"
                  : "opacity-70 hover:opacity-100"
              )}
            >
              <Image
                src={img.url}
                alt={`${title} ${i + 1}`}
                fill
                sizes="80px"
                className="object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
