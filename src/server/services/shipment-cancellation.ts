import { randomUUID } from "crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db, type Database } from "@/server/db";
import { orders, shipments } from "@/server/db/schema";
import {
  Priority1ApiError,
  priority1,
  type P1ShipmentStatus,
} from "./priority1";
import { selectPriority1Shipment } from "./priority1-selection";
import { mapPriority1ShipmentStatus } from "./shipping-workflow";
import {
  openReconciliationCaseInTransaction,
  type OpenReconciliationCaseInput,
} from "./reconciliation-cases";

type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type ShipmentStatus = typeof shipments.$inferSelect.status;

const SHIPMENT_CANCELLATION_LEASE_MS = 5 * 60 * 1000;
const TERMINAL_SHIPMENT_STATUS_RANK: Record<ShipmentStatus, number> = {
  pending: 0,
  dispatched: 1,
  in_transit: 2,
  out_for_delivery: 3,
  exception: 3,
  cancelled: 4,
  delivered: 5,
};

export interface ShipmentCancellationResult {
  cancelled: boolean;
  shipmentId?: string;
  priority1ShipmentId?: string;
  reason?: string;
}

type CancellationRequest = {
  orderId: string;
  orderNumber: string;
  shipmentId: string;
};

type CancellationClaim = CancellationRequest & {
  claimToken: string;
  localStatus: typeof shipments.$inferSelect.status;
  priority1ShipmentId: string | null;
  dispatchAttemptedAt: Date | null;
};

type CancellationTerminalResolution = {
  cancelled: boolean;
  shipmentStatus: ShipmentStatus;
  priority1ShipmentId: string | null;
  deliveredAt: Date | null;
  reason: string;
  reconciliationCase: OpenReconciliationCaseInput;
};

export class ShipmentCancellationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ShipmentCancellationError";
  }
}

function isDefinitelyUncancelableShipmentStatus(status: ShipmentStatus): boolean {
  return (
    status === "in_transit" ||
    status === "out_for_delivery" ||
    status === "delivered"
  );
}

function preferAdvancedShipmentStatus(
  current: ShipmentStatus,
  desired: ShipmentStatus,
): ShipmentStatus {
  return TERMINAL_SHIPMENT_STATUS_RANK[current] >=
    TERMINAL_SHIPMENT_STATUS_RANK[desired]
    ? current
    : desired;
}

function buildCancellationTerminalCase(params: {
  claim: CancellationClaim;
  shipmentStatus: ShipmentStatus;
  priority1ShipmentId: string | null;
  deliveredAt?: Date | null;
  summary: string;
  title: string;
  caseKey: string;
  details: Record<string, unknown>;
}): CancellationTerminalResolution {
  return {
    cancelled: params.shipmentStatus === "cancelled",
    shipmentStatus: params.shipmentStatus,
    priority1ShipmentId: params.priority1ShipmentId,
    deliveredAt: params.deliveredAt ?? null,
    reason: params.summary,
    reconciliationCase: {
      caseKey: params.caseKey,
      type: "shipment_ambiguity",
      source: "priority1",
      severity: "high",
      title: params.title,
      summary: params.summary,
      orderId: params.claim.orderId,
      externalReference:
        params.priority1ShipmentId ?? params.claim.orderNumber,
      details: {
        shipmentId: params.claim.shipmentId,
        priority1ShipmentId: params.priority1ShipmentId,
        localStatus: params.claim.localStatus,
        dispatchAttemptedAt: params.claim.dispatchAttemptedAt,
        ...params.details,
      },
    },
  };
}

function buildLocalTerminalResolution(
  claim: CancellationClaim,
): CancellationTerminalResolution | null {
  if (!isDefinitelyUncancelableShipmentStatus(claim.localStatus)) {
    return null;
  }

  return buildCancellationTerminalCase({
    claim,
    shipmentStatus: claim.localStatus,
    priority1ShipmentId: claim.priority1ShipmentId,
    deliveredAt: claim.localStatus === "delivered" ? new Date() : null,
    caseKey: `shipment-cancel-terminal:${claim.orderId}`,
    title: "Freight cancellation reached a terminal shipment state",
    summary:
      claim.localStatus === "delivered"
        ? "The shipment was already marked delivered before cancellation finalized. The cancellation request was consumed and manual reconciliation is required."
        : `The shipment is already ${claim.localStatus.replaceAll("_", " ")} and can no longer be safely cancelled. The cancellation request was consumed and manual reconciliation is required.`,
    details: {
      terminalSource: "local",
      resolvedShipmentStatus: claim.localStatus,
    },
  });
}

function buildProviderTerminalResolution(params: {
  claim: CancellationClaim;
  providerShipment: P1ShipmentStatus;
  priority1ShipmentId: string;
}): CancellationTerminalResolution | null {
  const mapped = mapPriority1ShipmentStatus(
    params.claim.localStatus,
    params.providerShipment,
  );

  if (mapped.mappedStatus === "cancelled") {
    return buildCancellationTerminalCase({
      claim: params.claim,
      shipmentStatus: "cancelled",
      priority1ShipmentId: params.priority1ShipmentId,
      caseKey: `shipment-cancel-provider-cancelled:${params.claim.orderId}`,
      title: "Freight cancellation reconciled a provider-cancelled shipment",
      summary:
        "Priority1 already marked this shipment cancelled before local cancellation finalized. The local shipment was reconciled to cancelled and manual review is required.",
      details: {
        terminalSource: "provider",
        providerStatus: params.providerShipment.status,
        actualPickupDate: params.providerShipment.actualPickupDate,
        actualDeliveryDate: params.providerShipment.actualDeliveryDate,
        resolvedShipmentStatus: "cancelled",
      },
    });
  }

  if (!mapped.pickupConfirmed && mapped.mappedStatus !== "delivered") {
    return null;
  }

  return buildCancellationTerminalCase({
    claim: params.claim,
    shipmentStatus: mapped.mappedStatus,
    priority1ShipmentId: params.priority1ShipmentId,
    deliveredAt: mapped.deliveredAt,
    caseKey: `shipment-cancel-terminal:${params.claim.orderId}`,
    title: "Freight cancellation reached a provider terminal shipment state",
    summary:
      mapped.mappedStatus === "delivered"
        ? "Priority1 reports this shipment as delivered. The cancellation request was consumed and manual reconciliation is required."
        : `Priority1 reports this shipment as ${mapped.mappedStatus.replaceAll("_", " ")}. The cancellation request was consumed and manual reconciliation is required.`,
    details: {
      terminalSource: "provider",
      providerStatus: params.providerShipment.status,
      pickupConfirmed: mapped.pickupConfirmed,
      actualPickupDate: params.providerShipment.actualPickupDate,
      actualDeliveryDate: params.providerShipment.actualDeliveryDate,
      resolvedShipmentStatus: mapped.mappedStatus,
    },
  });
}

async function finalizeTerminalCancellationResolution(
  claim: CancellationClaim,
  resolution: CancellationTerminalResolution,
): Promise<ShipmentCancellationResult> {
  const now = new Date();

  const finalizedStatus = await db.transaction(async (tx) => {
    const [shipment] = await tx
      .select({
        id: shipments.id,
        status: shipments.status,
        deliveredAt: shipments.deliveredAt,
        priority1ShipmentId: shipments.priority1ShipmentId,
        cancellationClaimToken: shipments.cancellationClaimToken,
      })
      .from(shipments)
      .where(eq(shipments.id, claim.shipmentId))
      .for("update");
    if (!shipment) {
      throw new ShipmentCancellationError(
        "Shipment disappeared before cancellation finalization",
      );
    }
    if (shipment.cancellationClaimToken !== claim.claimToken) {
      throw new ShipmentCancellationError(
        "Shipment cancellation ownership changed before finalization",
      );
    }

    const nextStatus =
      shipment.status === "cancelled" ||
      isDefinitelyUncancelableShipmentStatus(shipment.status)
        ? preferAdvancedShipmentStatus(shipment.status, resolution.shipmentStatus)
        : resolution.shipmentStatus;

    await tx
      .update(shipments)
      .set({
        priority1ShipmentId:
          resolution.priority1ShipmentId ?? shipment.priority1ShipmentId,
        status: nextStatus,
        deliveredAt:
          nextStatus === "delivered"
            ? resolution.deliveredAt ?? shipment.deliveredAt ?? now
            : shipment.deliveredAt,
        cancellationRequestedAt: null,
        cancellationClaimToken: null,
        cancellationClaimedAt: null,
        lastError: resolution.reason,
        updatedAt: now,
      })
      .where(
        and(
          eq(shipments.id, claim.shipmentId),
          eq(shipments.cancellationClaimToken, claim.claimToken),
        ),
      );

    await openReconciliationCaseInTransaction(tx, {
      ...resolution.reconciliationCase,
      details: {
        ...(resolution.reconciliationCase.details ?? {}),
        finalShipmentStatus: nextStatus,
        finalizedAt: now.toISOString(),
      },
    });

    return nextStatus;
  });

  return {
    cancelled: finalizedStatus === "cancelled",
    shipmentId: claim.shipmentId,
    priority1ShipmentId: resolution.priority1ShipmentId ?? undefined,
    reason: resolution.reason,
  };
}

async function openClaimOwnedCancellationCase(
  claim: CancellationClaim,
  reconciliationCase: OpenReconciliationCaseInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [shipment] = await tx
      .select({ cancellationClaimToken: shipments.cancellationClaimToken })
      .from(shipments)
      .where(eq(shipments.id, claim.shipmentId))
      .for("update");
    if (!shipment || shipment.cancellationClaimToken !== claim.claimToken) {
      throw new ShipmentCancellationError(
        "Shipment cancellation ownership changed before reconciliation",
      );
    }

    await openReconciliationCaseInTransaction(tx, reconciliationCase);
  });
}

async function requestCancellationWithLocks(
  executor: DbTransaction,
  orderId: string,
): Promise<CancellationRequest | ShipmentCancellationResult> {
  const [order] = await executor
    .select({ id: orders.id, orderNumber: orders.orderNumber })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update");
  if (!order) return { cancelled: false, reason: "Order not found" };

  const [shipment] = await executor
    .select({
      id: shipments.id,
      status: shipments.status,
      priority1ShipmentId: shipments.priority1ShipmentId,
      cancellationRequestedAt: shipments.cancellationRequestedAt,
    })
    .from(shipments)
    .where(eq(shipments.orderId, orderId))
    .for("update");
  if (!shipment) {
    return { cancelled: false, reason: "No freight shipment exists" };
  }
  if (shipment.status === "cancelled") {
    return {
      cancelled: true,
      shipmentId: shipment.id,
      priority1ShipmentId: shipment.priority1ShipmentId ?? undefined,
      reason: "Shipment was already cancelled",
    };
  }
  if (!shipment.cancellationRequestedAt) {
    await executor
      .update(shipments)
      .set({
        cancellationRequestedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, shipment.id));
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    shipmentId: shipment.id,
  };
}

export async function requestPriority1ShipmentCancellation(
  orderId: string,
  executor?: DbTransaction,
): Promise<CancellationRequest | ShipmentCancellationResult> {
  if (executor) {
    return requestCancellationWithLocks(executor, orderId);
  }

  return db.transaction((tx) =>
    requestCancellationWithLocks(tx, orderId),
  );
}

async function claimCancellation(
  orderId: string,
): Promise<CancellationClaim | ShipmentCancellationResult> {
  const claimToken = randomUUID();
  const claimedAt = new Date();
  const staleBefore = new Date(
    claimedAt.getTime() - SHIPMENT_CANCELLATION_LEASE_MS,
  );

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update");
    if (!order) return { cancelled: false, reason: "Order not found" };

    const [shipment] = await tx
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, orderId))
      .for("update");
    if (!shipment) {
      return { cancelled: false, reason: "No freight shipment exists" };
    }
    if (shipment.status === "cancelled") {
      return {
        cancelled: true,
        shipmentId: shipment.id,
        priority1ShipmentId: shipment.priority1ShipmentId ?? undefined,
        reason: "Shipment was already cancelled",
      };
    }
    if (!shipment.cancellationRequestedAt) {
      return {
        cancelled: false,
        shipmentId: shipment.id,
        reason: "Shipment cancellation has not been requested",
      };
    }

    const [claimed] = await tx
      .update(shipments)
      .set({
        cancellationClaimToken: claimToken,
        cancellationClaimedAt: claimedAt,
        lastError: null,
        updatedAt: claimedAt,
      })
      .where(
        and(
          eq(shipments.id, shipment.id),
          or(
            isNull(shipments.cancellationClaimToken),
            lt(shipments.cancellationClaimedAt, staleBefore),
          ),
        ),
      )
      .returning({ id: shipments.id });
    if (!claimed) {
      return {
        cancelled: false,
        shipmentId: shipment.id,
        reason: "Shipment cancellation is already being processed",
      };
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      shipmentId: shipment.id,
      claimToken,
      localStatus: shipment.status,
      priority1ShipmentId: shipment.priority1ShipmentId,
      dispatchAttemptedAt: shipment.dispatchAttemptedAt,
    };
  });
}

export async function processRequestedPriority1ShipmentCancellation(
  orderId: string,
): Promise<ShipmentCancellationResult> {
  const claim = await claimCancellation(orderId);
  if (!("claimToken" in claim)) return claim;

  let priority1ShipmentId = claim.priority1ShipmentId;
  let terminalResolution = buildLocalTerminalResolution(claim);

  const refreshProviderStatus = async (): Promise<CancellationTerminalResolution | null> => {
    const response = await priority1.getStatus({
      identifierType: "CUSTOMER_REFERENCE",
      identifierValue: claim.orderNumber,
    });
    const providerShipment = selectPriority1Shipment(
      response,
      priority1ShipmentId,
    );
    if (!providerShipment) return null;

    priority1ShipmentId = String(providerShipment.id);
    return buildProviderTerminalResolution({
      claim,
      providerShipment,
      priority1ShipmentId,
    });
  };

  try {
    if (!priority1.isDryRun()) {
      try {
        terminalResolution =
          (await refreshProviderStatus()) ?? terminalResolution;
      } catch (error) {
        if (
          !(error instanceof Priority1ApiError && error.status === 404) &&
          !terminalResolution
        ) {
          throw error;
        }
      }
    }

    if (terminalResolution) {
      return await finalizeTerminalCancellationResolution(claim, {
        ...terminalResolution,
        priority1ShipmentId:
          priority1ShipmentId ?? terminalResolution.priority1ShipmentId,
      });
    }

    if (
      !priority1.isDryRun() &&
      claim.dispatchAttemptedAt &&
      !priority1ShipmentId
    ) {
      await openClaimOwnedCancellationCase(claim, {
        caseKey: `shipment-cancel-unreconciled:${claim.orderId}`,
        type: "shipment_ambiguity",
        source: "priority1",
        severity: "critical",
        title: "Freight cancel blocked — unreconciled prior dispatch",
        summary:
          "A prior Priority1 dispatch attempt could not be reconciled; provider cancellation requires manual review. Buyer refund may already be in progress.",
        orderId: claim.orderId,
        externalReference: claim.orderNumber,
        details: {
          shipmentId: claim.shipmentId,
          dispatchAttemptedAt: claim.dispatchAttemptedAt,
        },
      });
      throw new ShipmentCancellationError(
        "A prior Priority1 dispatch attempt could not be reconciled; provider cancellation requires manual review",
      );
    }

    if (priority1ShipmentId) {
      const numericId = Number(priority1ShipmentId);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        throw new ShipmentCancellationError(
          "Shipment has an invalid Priority1 shipment ID",
        );
      }
      try {
        await priority1.cancel({ id: numericId });
      } catch (cancelError) {
        if (!priority1.isDryRun()) {
          try {
            terminalResolution =
              (await refreshProviderStatus()) ?? terminalResolution;
          } catch {
            throw cancelError;
          }
        }
        if (terminalResolution) {
          return await finalizeTerminalCancellationResolution(claim, {
            ...terminalResolution,
            priority1ShipmentId:
              priority1ShipmentId ?? terminalResolution.priority1ShipmentId,
          });
        }
        throw cancelError;
      }
    }

    const lateTerminalShipment = await db.transaction(async (tx) => {
      const [shipment] = await tx
        .select({
          id: shipments.id,
          status: shipments.status,
          deliveredAt: shipments.deliveredAt,
          priority1ShipmentId: shipments.priority1ShipmentId,
          cancellationClaimToken: shipments.cancellationClaimToken,
        })
        .from(shipments)
        .where(eq(shipments.id, claim.shipmentId))
        .for("update");
      if (!shipment) return null;
      if (shipment.cancellationClaimToken !== claim.claimToken) {
        throw new ShipmentCancellationError(
          "Shipment cancellation ownership changed before finalization",
        );
      }
      if (isDefinitelyUncancelableShipmentStatus(shipment.status)) {
        return shipment;
      }

      await tx
        .update(shipments)
        .set({
          priority1ShipmentId,
          status: "cancelled",
          cancellationRequestedAt: null,
          cancellationClaimToken: null,
          cancellationClaimedAt: null,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(shipments.id, claim.shipmentId),
            eq(shipments.cancellationClaimToken, claim.claimToken),
          ),
        );

      return null;
    });

    if (lateTerminalShipment) {
      const lateClaim: CancellationClaim = {
        ...claim,
        localStatus: lateTerminalShipment.status,
        priority1ShipmentId:
          priority1ShipmentId ?? lateTerminalShipment.priority1ShipmentId,
      };
      const lateResolution = buildLocalTerminalResolution(lateClaim);
      if (!lateResolution) {
        throw new ShipmentCancellationError(
          "Shipment reached an unsupported cancellation state before finalization",
        );
      }
      if (lateTerminalShipment.status === "delivered") {
        lateResolution.deliveredAt = lateTerminalShipment.deliveredAt;
      }
      return await finalizeTerminalCancellationResolution(
        lateClaim,
        lateResolution,
      );
    }

    return {
      cancelled: true,
      shipmentId: claim.shipmentId,
      priority1ShipmentId: priority1ShipmentId ?? undefined,
      reason: priority1ShipmentId
        ? "Priority1 shipment cancelled"
        : "Pending local shipment cancelled before provider dispatch",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown freight cancellation error";
    await db
      .update(shipments)
      .set({
        cancellationClaimToken: null,
        cancellationClaimedAt: null,
        lastError: message,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(shipments.id, claim.shipmentId),
          eq(shipments.cancellationClaimToken, claim.claimToken),
        ),
      );
    throw error instanceof ShipmentCancellationError
      ? error
      : new ShipmentCancellationError(message, { cause: error });
  }
}

/**
 * Existing transactional callers durably request cancellation and return
 * without network I/O. The cancellation scheduler processes the committed
 * request. Callers outside a transaction retain synchronous semantics.
 */
export async function cancelPriority1ShipmentForOrder(
  orderId: string,
  executor?: DbTransaction,
): Promise<ShipmentCancellationResult> {
  const request = await requestPriority1ShipmentCancellation(orderId, executor);
  if ("cancelled" in request) return request;

  if (executor) {
    return {
      cancelled: false,
      shipmentId: request.shipmentId,
      reason: "Shipment cancellation was queued for post-transaction processing",
    };
  }

  return processRequestedPriority1ShipmentCancellation(orderId);
}
