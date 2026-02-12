import { PostHog } from "posthog-node";

let posthogServerInstance: PostHog | null = null;

export function getPostHogServer(): PostHog {
  if (!posthogServerInstance) {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      throw new Error("NEXT_PUBLIC_POSTHOG_KEY is not set");
    }

    posthogServerInstance = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
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
