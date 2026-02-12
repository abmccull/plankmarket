"use client";

import { useEffect } from "react";
import { PostHogProvider } from "posthog-js/react";
import { initPostHog } from "./posthog-client";
import { useAuthStore } from "@/lib/stores/auth-store";

const posthogClient = initPostHog();

export function PostHogAnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (user) {
      posthogClient.identify(user.id, {
        email: user.email,
        name: user.name,
        role: user.role,
        business_name: user.businessName,
        verified: user.verified,
        stripe_onboarding_complete: user.stripeOnboardingComplete,
      });
    } else {
      posthogClient.reset();
    }
  }, [user]);

  return <PostHogProvider client={posthogClient}>{children}</PostHogProvider>;
}
