"use client";

import { useState, useSyncExternalStore } from "react";
import { Info, X } from "lucide-react";

interface OnboardingTipProps {
  id: string;
  children: React.ReactNode;
}

function getStorageKey(id: string) {
  return `onboarding-tip-${id}`;
}

function readDismissed(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(getStorageKey(id)) === "true";
  } catch {
    return false;
  }
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function OnboardingTip({ id, children }: OnboardingTipProps) {
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const savedDismissal = useSyncExternalStore(subscribeToStorage, () => readDismissed(id), () => false);

  if (dismissedId === id || savedDismissal) return null;

  const handleDismiss = () => {
    setDismissedId(id);
    try {
      localStorage.setItem(getStorageKey(id), "true");
    } catch {
      // Remember this choice for the open page even when optional storage is unavailable.
    }
  };

  return (
    <div className="flex items-start gap-2 py-1 text-muted-foreground">
        <Info className="mt-3.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div className="flex min-h-11 flex-1 items-center text-sm">
          {children}
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Dismiss tip"
        >
          <X className="h-4 w-4" />
        </button>
    </div>
  );
}
