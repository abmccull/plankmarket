"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

export function VerificationPendingBanner() {
  const [isDismissed, setIsDismissed] = useState<boolean>(
    () => sessionStorage.getItem("verification-pending-banner-dismissed") === "true"
  );

  if (isDismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem("verification-pending-banner-dismissed", "true");
    setIsDismissed(true);
  };

  return (
    <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 flex-shrink-0" aria-hidden="true" />
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Verification pending — set up your account while we review your application.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 flex-shrink-0"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
