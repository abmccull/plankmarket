"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  UserCircle,
  ShieldCheck,
  CreditCard,
  Package,
  Search,
  Bookmark,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  useOnboardingStore,
  type SellerOnboardingStep,
  type BuyerOnboardingStep,
} from "@/lib/stores/onboarding-store";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  step: SellerOnboardingStep | BuyerOnboardingStep;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}

const SELLER_ITEMS: ChecklistItem[] = [
  {
    step: "profile_complete",
    title: "Complete your profile",
    description: "Add your business details and contact information",
    icon: UserCircle,
    href: "/seller/settings",
  },
  {
    step: "verification_submitted",
    title: "Submit verification",
    description: "Verify your identity to build trust with buyers",
    icon: ShieldCheck,
    href: "/seller/verification",
  },
  {
    step: "stripe_connected",
    title: "Connect Stripe",
    description: "Set up payments to receive funds from sales",
    icon: CreditCard,
    href: "/seller/stripe-onboarding",
  },
  {
    step: "first_listing",
    title: "Create first listing",
    description: "List your first flooring inventory",
    icon: Package,
    href: "/seller/listings/new",
  },
];

const BUYER_ITEMS: ChecklistItem[] = [
  {
    step: "profile_complete",
    title: "Complete your profile",
    description: "Add your contact information and preferences",
    icon: UserCircle,
    href: "/buyer/settings",
  },
  {
    step: "first_browse",
    title: "Browse listings",
    description: "Explore available flooring inventory",
    icon: Search,
    href: "/listings",
  },
  {
    step: "first_save_search",
    title: "Save a search",
    description: "Get notified when new listings match your needs",
    icon: Bookmark,
    href: "/listings",
  },
];

export function OnboardingChecklist() {
  const user = useAuthStore((state) => state.user);
  const { isComplete, getProgress, isDismissed, dismiss } = useOnboardingStore();

  if (!user || isDismissed) {
    return null;
  }

  const items = user.role === "seller" ? SELLER_ITEMS : BUYER_ITEMS;
  const progress = getProgress(user.role);

  if (progress === 100) {
    return null;
  }

  return (
    <Card className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-2 h-8 w-8"
        onClick={dismiss}
        aria-label="Dismiss checklist"
      >
        <X className="h-4 w-4" />
      </Button>

      <CardHeader>
        <CardTitle className="text-lg">Get Started</CardTitle>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {progress}% complete
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </CardHeader>

      <CardContent>
        <ul className="space-y-3">
          {items.map((item) => {
            const completed = isComplete(item.step);
            const Icon = item.icon;

            return (
              <li key={item.step}>
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
    </Card>
  );
}
