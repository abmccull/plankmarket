"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getDashboardPath } from "@/lib/auth/roles";
import { useAuthStore } from "@/lib/stores/auth-store";

export function ProSuccessActions() {
  const { user, isAuthenticated } = useAuthStore();
  const dashboardHref = user ? getDashboardPath(user.role) : "/listings";

  return (
    <div className="flex flex-col gap-3 pt-2 sm:flex-row">
      <Button asChild>
        <Link href="/settings/subscription">Manage Subscription</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href={isAuthenticated ? dashboardHref : "/listings"}>
          {isAuthenticated ? "Go to Dashboard" : "Browse Listings"}
        </Link>
      </Button>
    </div>
  );
}
