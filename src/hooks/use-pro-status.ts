"use client";

import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";

interface ProStatusResult {
  isPro: boolean;
  proStatus: string;
  proExpiresAt: Date | null;
  availableCredit: number;
  isLoading: boolean;
}

export function useProStatus(): ProStatusResult {
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const statusQuery = trpc.subscription?.getStatus?.useQuery;
  const { data, isLoading: statusLoading } = statusQuery
    ? statusQuery(undefined, {
        staleTime: 5 * 60 * 1000,
        retry: false,
        enabled: isAuthenticated,
      })
    : { data: undefined, isLoading: false };

  const proStatus = data?.proStatus ?? "free";
  const proExpiresAt = data?.proExpiresAt ? new Date(data.proExpiresAt) : null;

  const isPro =
    proStatus === "active" ||
    proStatus === "trialing" ||
    proStatus === "past_due" ||
    (proStatus === "cancelled" && proExpiresAt !== null && proExpiresAt > new Date());

  return {
    isPro,
    proStatus,
    proExpiresAt,
    availableCredit: data?.availableCredit ?? 0,
    isLoading: authLoading || (isAuthenticated && statusLoading),
  };
}
