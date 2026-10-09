"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useTradingWorkspace } from "@/hooks/use-trading-workspace";
import { canCreateListings } from "@/lib/auth/roles";
import { isPathWithin, type TradingWorkspace } from "@/lib/workspace-navigation";
import { cn } from "@/lib/utils";

export function WorkspaceSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuthStore();
  const pathname = usePathname();
  const { workspace, selectWorkspace, ready } = useTradingWorkspace(pathname);
  if (!ready || !user || !canCreateListings(user.role) || isPathWithin(pathname, "/admin")) return null;
  return <div role="group" aria-label="Trading workspace" className="grid grid-cols-2 gap-1 rounded-md border p-1">
    {([['buyer', 'Buying'], ['seller', 'Selling']] as const).map(([value, label]) => <Link
      key={value} href={`/${value}`} aria-current={workspace === value ? "true" : undefined}
      onNavigate={() => { selectWorkspace(value as TradingWorkspace); onNavigate?.(); }}
      className={cn("flex min-h-11 items-center justify-center rounded-sm px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        workspace === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
    >{label}</Link>)}
  </div>;
}
