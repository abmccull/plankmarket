"use client";

import { useProStatus } from "@/hooks/use-pro-status";
import { UpgradePrompt } from "@/components/upgrade-prompt";
import { Skeleton } from "@/components/ui/skeleton";

interface ProGateProps {
  children: React.ReactNode;
  feature: string;
  description?: string;
}

export function ProGate({ children, feature, description }: ProGateProps) {
  const { isPro, isLoading } = useProStatus();

  if (isLoading) {
    return <Skeleton className="min-h-[8rem] w-full rounded-xl" />;
  }

  if (!isPro) {
    return <UpgradePrompt feature={feature} description={description} />;
  }

  return <>{children}</>;
}
