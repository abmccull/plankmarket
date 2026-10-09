import { AcknowledgedPostHog } from "./posthog-acknowledged";

let posthogServerInstance: AcknowledgedPostHog | null = null;

export function getPostHogServer(): AcknowledgedPostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return null;
  }

  if (!posthogServerInstance) {
    posthogServerInstance = new AcknowledgedPostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      // Serverless functions may be frozen immediately after the response.
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return posthogServerInstance;
}

export async function shutdownPostHog(): Promise<void> {
  if (posthogServerInstance) {
    await posthogServerInstance.shutdown();
    posthogServerInstance = null;
  }
}
