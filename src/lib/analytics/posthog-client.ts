import posthog from "posthog-js";

export function initPostHog() {
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: "/ingest",
      ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.posthog.com",
      capture_pageview: true,
      capture_pageleave: true,
    });
  }
  return posthog;
}
