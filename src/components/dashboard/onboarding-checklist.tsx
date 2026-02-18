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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAuthStore } from "@/lib/stores/auth-store";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { useState } from "react";

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
    description: "Get verified to make purchases",
    icon: ShieldCheck,
    href: "/buyer/settings",
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
    title: "Make your first purchase",
    description: "Find and purchase flooring inventory",
    icon: ShoppingCart,
    href: "/listings",
  },
];

export function OnboardingChecklist({ variant }: OnboardingChecklistProps = {}) {
  const user = useAuthStore((state) => state.user);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("onboarding-checklist-collapsed") === "true";
  });

  // Determine effective role: explicit variant prop > user role
  const effectiveRole = variant ?? (user?.role === "seller" ? "seller" : user?.role === "admin" ? "seller" : "buyer");

  const { data: progress, isLoading } = trpc.auth.getOnboardingProgress.useQuery(
    { role: effectiveRole },
    { enabled: !!user }
  );

  // Hide entirely when not applicable or fully complete
  if (!user || isLoading || !progress || progress.percentComplete === 100) {
    return null;
  }

  const items = effectiveRole === "seller" ? SELLER_ITEMS : BUYER_ITEMS;

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    localStorage.setItem("onboarding-checklist-collapsed", String(next));
    setIsCollapsed(next);
  };

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={toggleCollapsed}
        role="button"
        aria-expanded={!isCollapsed}
        aria-controls="onboarding-steps"
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Get Started</CardTitle>
          <ChevronDown
            className={cn(
              "h-5 w-5 text-muted-foreground transition-transform duration-200",
              isCollapsed && "-rotate-90"
            )}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {progress.completedCount} of {progress.totalCount} complete
            </span>
            <span className="text-muted-foreground">
              {progress.percentComplete}%
            </span>
          </div>
          <Progress value={progress.percentComplete} className="h-2" />
        </div>
      </CardHeader>

      {!isCollapsed && (
        <CardContent id="onboarding-steps">
          <ul className="space-y-3">
            {items.map((item) => {
              const completed = progress.steps[item.key] ?? false;
              const Icon = item.icon;

              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-start gap-3 rounded-lg p-3 transition-colors",
                      !completed && "hover:bg-accent"
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {completed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <h4
                          className={cn(
                            "font-medium text-sm",
                            completed && "text-muted-foreground line-through"
                          )}
                        >
                          {item.title}
                        </h4>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.description}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
