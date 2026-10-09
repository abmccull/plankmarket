"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  UserCircle,
  ShieldCheck,
  CreditCard,
  Package,
  Bookmark,
  ShoppingCart,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { useId, useState, useSyncExternalStore } from "react";
import { QueryErrorState } from "@/components/ui/state-panel";
import { resolveTradingWorkspace } from "@/lib/workspace-navigation";

interface ChecklistItem {
  key: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

interface OnboardingChecklistProps {
  /** Override which checklist variant to display, regardless of user role */
  variant?: "buyer" | "seller";
  defaultCollapsed?: boolean;
}

const SELLER_ITEMS: ChecklistItem[] = [
  {
    key: "email_verified",
    title: "Verify your email",
    description: "Check your inbox for a verification link",
    icon: ShieldCheck,
    href: "/seller/settings",
  },
  {
    key: "business_verified",
    title: "Business verification",
    description: "Get verified to publish listings",
    icon: ShieldCheck,
    href: "/seller/verification",
  },
  {
    key: "profile_complete",
    title: "Complete your profile",
    description: "Add your business details and contact information",
    icon: UserCircle,
    href: "/seller/settings",
  },
  {
    key: "preferences_set",
    title: "Set your preferences",
    description: "Help buyers find your inventory",
    icon: SlidersHorizontal,
    href: "/preferences",
  },
  {
    key: "stripe_connected",
    title: "Connect Stripe",
    description: "Set up payments to receive funds from sales",
    icon: CreditCard,
    href: "/seller/stripe-onboarding",
  },
  {
    key: "first_listing",
    title: "Create first listing",
    description: "List your first flooring inventory",
    icon: Package,
    href: "/seller/listings/new",
  },
];

const BUYER_ITEMS: ChecklistItem[] = [
  {
    key: "email_verified",
    title: "Verify your email",
    description: "Check your inbox for a verification link",
    icon: ShieldCheck,
    href: "/buyer/settings",
  },
  {
    key: "business_verified",
    title: "Business verification",
    description: "Required before checkout",
    icon: ShieldCheck,
    href: "/buyer/verification",
  },
  {
    key: "profile_complete",
    title: "Complete your profile",
    description: "Add your contact information and preferences",
    icon: UserCircle,
    href: "/buyer/settings",
  },
  {
    key: "preferences_set",
    title: "Set your preferences",
    description: "Get personalized recommendations",
    icon: SlidersHorizontal,
    href: "/preferences",
  },
  {
    key: "first_saved_search",
    title: "Save a search",
    description: "Get notified when new listings match your needs",
    icon: Bookmark,
    href: "/listings",
  },
  {
    key: "first_purchase",
    title: "Start your first order",
    description: "Find a lot that fits your job",
    icon: ShoppingCart,
    href: "/listings",
  },
];

function subscribeToSetupPreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

export function OnboardingChecklist({ variant, defaultCollapsed = false }: OnboardingChecklistProps = {}) {
  const user = useAuthStore((state) => state.user);
  const stepsId = useId();
  const effectiveRole = resolveTradingWorkspace(user?.role ?? "buyer", "/", variant);
  const storageKey = `onboarding-checklist-collapsed:${user?.id ?? "anonymous"}:${effectiveRole}`;
  const [sessionCollapsed, setSessionCollapsed] = useState<{ key: string; value: boolean } | null>(null);
  const storedCollapsed = useSyncExternalStore(
    subscribeToSetupPreference,
    () => {
      try {
        const stored = localStorage.getItem(storageKey);
        return stored === null ? null : stored === "true";
      } catch {
        return null;
      }
    },
    () => null,
  );
  const isCollapsed = (sessionCollapsed?.key === storageKey ? sessionCollapsed.value : null) ?? storedCollapsed ?? defaultCollapsed;

  const { data: progress, isLoading, isError, isFetching, refetch } = trpc.auth.getOnboardingProgress.useQuery(
    { role: effectiveRole },
    { enabled: !!user }
  );

  if (!user || isLoading) return null;
  if (isError || !progress) {
    return <QueryErrorState title="We couldn’t check account setup" description="Your order queues remain available. Retry to see the remaining setup steps." onRetry={() => void refetch()} isRetrying={isFetching} className="min-h-0 py-4" />;
  }
  if (progress.percentComplete === 100) return null;

  const items = effectiveRole === "seller" ? SELLER_ITEMS : BUYER_ITEMS;
  const requiredKeys = effectiveRole === "seller"
    ? ["business_verified", "stripe_connected"]
    : ["business_verified"];
  const requiredItems = items.filter((item) => requiredKeys.includes(item.key));
  const optionalItems = items.filter((item) => !requiredKeys.includes(item.key));
  const requiredCompleted = requiredItems.filter((item) => progress.steps[item.key]).length;
  const requiredPercent = Math.round(requiredCompleted / requiredItems.length * 100);
  const nextRequired = requiredItems.find((item) => !progress.steps[item.key]);
  const optionalRemaining = optionalItems.filter((item) => !progress.steps[item.key]).length;

  const toggleCollapsed = () => {
    if (useAuthStore.getState().user?.id !== user.id) return;
    const next = !isCollapsed;
    try { localStorage.setItem(storageKey, String(next)); } catch { /* Session-only state is still useful. */ }
    setSessionCollapsed({ key: storageKey, value: next });
  };

  const renderItems = (group: ChecklistItem[]) => (
    <ul className="divide-y">
      {group.map((item) => {
        const completed = progress.steps[item.key] ?? false;
        return (
          <li key={item.key}>
            <Link href={item.href === "/preferences" ? `/preferences?workspace=${effectiveRole}` : item.href} className="flex min-h-11 items-start gap-3 rounded-sm py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {completed ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> : <Circle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", completed && "text-muted-foreground")}>{item.title}<span className="sr-only">{completed ? ": complete" : ": not complete"}</span></span>
                <span className="mt-1 block text-xs text-muted-foreground">{item.description}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold">{nextRequired ? "Finish required setup" : "Required setup complete"}</h2>
            <p className="text-sm text-muted-foreground">{effectiveRole === "seller" ? "Business approval and Stripe setup are needed before accepting payments." : "Business approval is required before checkout."}</p>
          </div>
          {nextRequired && <Button asChild className="h-auto min-h-11 whitespace-normal"><Link href={nextRequired.href}>{nextRequired.key === "business_verified" ? "Verify business" : "Set up payments"}</Link></Button>}
        </div>
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{requiredCompleted} of {requiredItems.length} required steps complete</p>
          <Progress aria-label="Required account setup completion" value={requiredPercent} className="h-1.5" />
        </div>
        <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 rounded-sm text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={toggleCollapsed} aria-expanded={!isCollapsed} aria-controls={stepsId}>
          <span>View setup and optional next steps{optionalRemaining > 0 ? " (" + optionalRemaining + " optional)" : ""}</span>
          <ChevronDown aria-hidden="true" className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200", isCollapsed && "-rotate-90")} />
        </button>
      </CardHeader>
      {!isCollapsed && (
        <CardContent id={stepsId} className="space-y-5">
          <section aria-label="Required account setup"><h3 className="text-sm font-semibold">Required setup</h3>{renderItems(requiredItems)}</section>
          <section aria-label="Optional tools and next steps"><h3 className="text-sm font-semibold">Optional tools and next steps</h3><p className="mt-1 text-xs text-muted-foreground">These do not change your business approval.</p>{renderItems(optionalItems)}</section>
        </CardContent>
      )}
    </Card>
  );
}
