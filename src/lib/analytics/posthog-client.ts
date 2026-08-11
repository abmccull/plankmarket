import posthog from "posthog-js";
import { sanitizeAnalyticsProperties } from "./privacy";

let posthogInitialized = false;

export function initPostHog() {
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    if (!posthogInitialized) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: "/ingest",
        ui_host:
          process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.posthog.com",
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_exceptions: false,
        disable_session_recording: true,
        opt_out_capturing_by_default: true,
        cookieless_mode: "on_reject",
        mask_all_element_attributes: true,
        mask_all_text: true,
        mask_personal_data_properties: true,
        custom_personal_data_properties: [
          "email",
          "phone",
          "address",
          "name",
          "ein",
          "tax_id",
        ],
        before_send: (event) => {
          if (!event) {
            return null;
          }

          event.properties = sanitizeAnalyticsProperties(
            (event.properties as Record<string, unknown> | undefined) ?? {},
          );
          return event;
        },
      });
      posthogInitialized = true;
    }
  }
  return posthog;
}
