import { PostHog } from "posthog-node";

export interface AcknowledgedAnalyticsEvent {
  distinctId: string;
  event: string;
  properties: Record<string, unknown>;
  uuid: string;
  timestamp: Date;
}

/** Isolate one queued submission from background and concurrent SDK flushes.
 * Real installed-SDK tests with injected fetch verify error propagation. */
export class AcknowledgedPostHog extends PostHog {
  constructor(private readonly captureKey: string, private readonly captureOptions: ConstructorParameters<typeof PostHog>[1] = {}) {
    super(captureKey, captureOptions);
  }

  async captureAcknowledged(message: AcknowledgedAnalyticsEvent): Promise<void> {
    const client = new PostHog(this.captureKey, {
      ...this.captureOptions,
      flushAt: Number.MAX_SAFE_INTEGER,
      flushInterval: 0,
      enableLocalEvaluation: false,
      disableGeoip: true,
    });
    client.capture(message);
    // This private instance has one event, no automatic flush and no other callers.
    // A transport error rejects the observer step; its durable event can retry.
    await client.flush();
    await client.shutdown();
  }
}
