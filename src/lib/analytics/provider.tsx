"use client";

import { useEffect, useState } from "react";
import { PostHogProvider } from "posthog-js/react";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { PostHog } from "posthog-js";

export function PostHogAnalyticsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  const [posthogClient, setPosthogClient] = useState<PostHog | null>(null);

  // Lazy-load PostHog after initial render to improve Core Web Vitals
  useEffect(() => {
    import("./posthog-client").then(({ initPostHog }) => {
      setPosthogClient(initPostHog());
    });
  }, []);

  useEffect(() => {
    if (!posthogClient) return;
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
  }, [user, posthogClient]);

  if (!posthogClient) {
    return <>{children}</>;
  }

  return <PostHogProvider client={posthogClient}>{children}</PostHogProvider>;
}
