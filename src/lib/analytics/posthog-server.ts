import { PostHog } from "posthog-node";

let posthogServerInstance: PostHog | null = null;

export function getPostHogServer(): PostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return null;
  }

  if (!posthogServerInstance) {
    posthogServerInstance = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
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
