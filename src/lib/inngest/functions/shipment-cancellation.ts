import { and, asc, isNotNull, ne } from "drizzle-orm";
import { inngest } from "../client";
import { db } from "@/server/db";
import { shipments } from "@/server/db/schema";
import { processRequestedPriority1ShipmentCancellation } from "@/server/services/shipment-cancellation";

const SHIPMENT_CANCELLATION_BATCH_SIZE = 25;

export const shipmentCancellationScheduler = inngest.createFunction(
  {
    id: "shipment-cancellation-scheduler",
    retries: 2,
    concurrency: { limit: 1 },
  },
  { cron: "*/1 * * * *" },
  async ({ step }) => {
    const candidates = await step.run("load-cancellation-requests", () =>
      db
        .select({ orderId: shipments.orderId })
        .from(shipments)
        .where(
          and(
            isNotNull(shipments.cancellationRequestedAt),
            ne(shipments.status, "cancelled"),
          ),
        )
        .orderBy(asc(shipments.cancellationRequestedAt), asc(shipments.id))
        .limit(SHIPMENT_CANCELLATION_BATCH_SIZE),
    );

    const results: Array<{
      orderId: string;
      cancelled: boolean;
      error?: string;
    }> = [];
    for (const candidate of candidates) {
      try {
        const result = await step.run(
          `cancel-shipment-${candidate.orderId}`,
          () => processRequestedPriority1ShipmentCancellation(candidate.orderId),
        );
        results.push({
          orderId: candidate.orderId,
          cancelled: result.cancelled,
        });
      } catch (error) {
        results.push({
          orderId: candidate.orderId,
          cancelled: false,
          error: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }

    return {
      selected: candidates.length,
      cancelled: results.filter((result) => result.cancelled).length,
      failed: results.filter((result) => result.error).length,
    };
  },
);
