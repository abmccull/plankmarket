"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AutoSaveIndicatorProps {
  status: "saved" | "saving" | "unsaved";
  className?: string;
}

export function AutoSaveIndicator({
  status,
  className,
}: AutoSaveIndicatorProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (status === "saved") {
      // Fade out after 3 seconds
      const timer = setTimeout(() => {
        setVisible(false);
      }, 3000);
      return () => clearTimeout(timer);
    } else {
      setVisible(true);
    }
  }, [status]);

  if (!visible && status === "saved") {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm transition-opacity duration-300",
        status === "saved" && !visible && "opacity-0",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {status === "saved" && (
        <>
          <Check
            className="h-4 w-4 text-green-600 dark:text-green-500"
            aria-hidden="true"
          />
          <span className="text-green-600 dark:text-green-500 font-medium">
            Draft saved
          </span>
        </>
      )}
      {status === "saving" && (
        <>
          <Loader2
            className="h-4 w-4 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <span className="text-muted-foreground">Saving...</span>
        </>
      )}
      {status === "unsaved" && (
        <>
          <div
            className="h-2 w-2 rounded-full bg-yellow-500"
            aria-hidden="true"
          />
          <span className="text-yellow-600 dark:text-yellow-500 text-sm">
            Unsaved changes
          </span>
        </>
      )}
    </div>
  );
}
