"use client";

import { trpc } from "@/lib/trpc/client";

interface ProStatusResult {
  isPro: boolean;
  proStatus: string;
  proExpiresAt: Date | null;
  availableCredit: number;
  isLoading: boolean;
}

export function useProStatus(): ProStatusResult {
  const { data, isLoading } = trpc.subscription.getStatus.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const proStatus = data?.proStatus ?? "free";
  const proExpiresAt = data?.proExpiresAt ? new Date(data.proExpiresAt) : null;

  const isPro =
    proStatus === "active" ||
    proStatus === "trialing" ||
    (proStatus === "cancelled" && proExpiresAt !== null && proExpiresAt > new Date());

  return {
    isPro,
    proStatus,
    proExpiresAt,
    availableCredit: data?.availableCredit ?? 0,
    isLoading,
  };
}
