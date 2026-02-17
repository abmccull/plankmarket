"use client";

import { useState } from "react";
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
  return localStorage.getItem(getStorageKey(id)) === "true";
}

export function OnboardingTip({ id, children }: OnboardingTipProps) {
  const [isDismissed, setIsDismissed] = useState(() => readDismissed(id));

  if (isDismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(getStorageKey(id), "true");
    setIsDismissed(true);
  };

  return (
    <div className="rounded-lg border border-info/30 bg-info/10 dark:bg-info/10 dark:border-info/30 px-4 py-3 mb-4">
      <div className="flex items-start gap-3">
        <Info className="h-4 w-4 text-info dark:text-info mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 text-sm text-info dark:text-info-foreground">
          {children}
        </div>
        <button
          onClick={handleDismiss}
          className="text-info dark:text-info hover:text-info dark:hover:text-info-foreground flex-shrink-0"
          aria-label="Dismiss tip"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
