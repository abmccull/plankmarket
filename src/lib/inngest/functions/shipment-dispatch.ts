import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import { inngest } from "../client";
import { redis } from "@/lib/redis/client";
import { db } from "@/server/db";
import {
  disputes,
  orders,
  shipments,
} from "@/server/db/schema";
import {
  Priority1ApiError,
  Priority1PostBookValidationError,
  type DispatchResponse,
  priority1,
} from "@/server/services/priority1";
import {
  fetchPriority1BillOfLadingUrl,
  fetchPriority1PalletLabelUrl,
  resolveDispatchBolUrl,
  resolveDispatchLabelUrl,
  shipmentDocumentIdentifiersFrom,
} from "@/server/services/shipment-documents";
import {
  Priority1ShipmentMatchError,
  selectPriority1Shipment,
} from "@/server/services/priority1-selection";
import {
  buildDispatchRequestForOrder,
  getOrderDispatchIneligibilityReason,
  getShipmentIdentifier,
  mapPriority1ShipmentStatus,
  requireLiveDispatchShipmentId,
  mergeTrackingEvents,
  requireShippingBookingSnapshotForOrder,
  ShippingBookingReviewError,
  ShippingQuoteUnbookableError,
} from "@/server/services/shipping-workflow";
import { processOrderRefund } from "@/server/services/refund";
import { openReconciliationCase } from "@/server/services/reconciliation-cases";
import {
  sendOrderConfirmationEmail,
  sendSellerPaidOrderEmail,
} from "@/lib/email/send";

const DISPATCH_LOCK_SECONDS = 120;

type DispatchConflict =
  | {
      kind: "order_ineligible";
      reason: string;
    }
  | {
      kind: "shipment_changed";
      reason: string;
      shipmentStatus: string;
      priority1ShipmentId: string | null;
    };

type DispatchClaim = ReturnType<typeof buildDispatchRequestForOrder> & {
  shipmentId: string;
  dryRun: boolean;
  carrierName: string;
  carrierScac: string | null;
  carrierRate: number;
};

async function sendPaidOrderNotifications(orderId: string) {
  const order = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    columns: {
      id: true,
      orderNumber: true,
      quantitySqFt: true,
      pricePerSqFt: true,
      subtotal: true,
      buyerFee: true,
      shippingPrice: true,
      buyerFreightCharge: true,
      sellerFreightContribution: true,
      totalPrice: true,
      sellerPayout: true,
      paymentStatus: true,
      escrowStatus: true,
      status: true,
    },
    with: {
      buyer: { columns: { email: true, name: true } },
      seller: { columns: { email: true, name: true } },
      listing: { columns: { title: true } },
      shipment: {
        columns: {
          priority1ShipmentId: true,
          status: true,
          isDryRun: true,
        },
      },
    },
  });
  if (
    !order ||
    order.paymentStatus !== "succeeded" ||
    order.escrowStatus !== "held" ||
    ["cancelled", "refunded"].includes(order.status) ||
    !order.shipment?.priority1ShipmentId ||
    order.shipment.isDryRun ||
    !["dispatched", "in_transit", "out_for_delivery", "delivered"].includes(
      order.shipment.status,
    )
  ) {
    return { sent: false, reason: "Order is not paid and provider-booked" };
  }

  await Promise.all([
    sendOrderConfirmationEmail({
      to: order.buyer.email,
      buyerName: order.buyer.name,
      orderNumber: order.orderNumber,
      listingTitle: order.listing.title,
      quantity: String(order.quantitySqFt),
      pricePerSqFt: `$${Number(order.pricePerSqFt).toFixed(2)}`,
      subtotal: `$${Number(order.subtotal).toFixed(2)}`,
      buyerFee: `$${Number(order.buyerFee).toFixed(2)}`,
      fullFreightCharge: `$${Number(order.shippingPrice ?? 0).toFixed(2)}`,
      buyerFreightCharge: `$${Number(order.buyerFreightCharge).toFixed(2)}`,
      sellerShippingCredit: `$${Number(
        order.sellerFreightContribution,
      ).toFixed(2)}`,
      hasSellerShippingCredit: Number(order.sellerFreightContribution) > 0,
      total: `$${Number(order.totalPrice).toFixed(2)}`,
      orderId: order.id,
      idempotencyKey: `paid-order-buyer-${order.id}`,
    }),
    sendSellerPaidOrderEmail({
      to: order.seller.email,
      sellerName: order.seller.name,
      orderNumber: order.orderNumber,
      listingTitle: order.listing.title,
      quantity: String(order.quantitySqFt),
      fullFreightCharge: `$${Number(order.shippingPrice ?? 0).toFixed(2)}`,
      buyerFreightCharge: `$${Number(order.buyerFreightCharge).toFixed(2)}`,
      sellerFreightContribution: `$${Number(
        order.sellerFreightContribution,
      ).toFixed(2)}`,
      sellerPayout: `$${Number(order.sellerPayout).toFixed(2)}`,
      orderId: order.id,
      idempotencyKey: `paid-order-seller-${order.id}`,
    }),
  ]);
  return { sent: true };
}

async function releaseDispatchLock(key: string, token: string): Promise<void> {
  await redis.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    [key],
    [token],
  );
}

async function reconcilePendingShipment(params: {
  order: Awaited<ReturnType<typeof loadDispatchOrder>>;
  shipmentId: string;
  expectedPriority1ShipmentId: string | null;
}) {
  const { order, shipmentId, expectedPriority1ShipmentId } = params;
  if (!order) return null;
  if (priority1.isDryRun()) return null;

  try {
    const response = await priority1.getStatus({
      identifierType: "CUSTOMER_REFERENCE",
      identifierValue: order.orderNumber,
    });
    const providerShipment = selectPriority1Shipment(
      response,
      expectedPriority1ShipmentId,
    );
    if (!providerShipment) return null;

    const proNumber = getShipmentIdentifier(
      providerShipment.shipmentIdentifiers,
      "PRO",
    );
    const bolNumber = getShipmentIdentifier(
      providerShipment.shipmentIdentifiers,
      "BILL_OF_LADING",
    );

    // Fetch BOL + labels outside the DB transaction (network I/O).
    const identifiers = shipmentDocumentIdentifiersFrom({
      proNumber,
      bolNumber,
      trackingNumber: order.trackingNumber,
    });
    const [bolFetch, labelFetch] = await Promise.all([
      fetchPriority1BillOfLadingUrl(identifiers),
      fetchPriority1PalletLabelUrl(identifiers),
    ]);
    const bolUrlBackfill = bolFetch.url;
    const labelUrlBackfill = labelFetch.url;

    await db.transaction(async (tx) => {
      const [lockedOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, order.id))
        .for("update");
      const [lockedShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipmentId))
        .for("update");
      const [openDispute] = await tx
        .select({ id: disputes.id })
        .from(disputes)
        .where(
          and(
            eq(disputes.orderId, order.id),
            inArray(disputes.status, ["open", "under_review"]),
          ),
        )
        .limit(1);
      if (!lockedOrder || !lockedShipment) {
        throw new ShippingBookingReviewError(
          "MANUAL_REVIEW_REQUIRED: order or shipment disappeared during Priority1 reconciliation",
        );
      }

      const ineligibility = getOrderDispatchIneligibilityReason({
        paymentStatus: lockedOrder.paymentStatus,
        escrowStatus: lockedOrder.escrowStatus,
        orderStatus: lockedOrder.status,
        inventoryReleasedAt: lockedOrder.inventoryReleasedAt,
        hasOpenDispute: Boolean(openDispute),
      });
      if (ineligibility || lockedShipment.status !== "pending") {
        throw new ShippingBookingReviewError(
          `MANUAL_REVIEW_REQUIRED: Priority1 booking was found, but local dispatch is no longer eligible${ineligibility ? `: ${ineligibility}` : ""}`,
        );
      }
      if (!lockedShipment.dispatchAttemptedAt) {
        throw new ShippingBookingReviewError(
          "MANUAL_REVIEW_REQUIRED: Priority1 booking has no matching local dispatch claim",
        );
      }

      const mapped = mapPriority1ShipmentStatus(
        lockedShipment.status,
        providerShipment,
      );
      if (mapped.mappedStatus === "cancelled") {
        throw new ShippingQuoteUnbookableError(
          "MANUAL_REVIEW_REQUIRED: Priority1 reports the paid freight booking as cancelled",
        );
      }
      const reconciledStatus =
        mapped.mappedStatus === "pending" ? "dispatched" : mapped.mappedStatus;

      const bolUrl = lockedShipment.bolUrl ?? bolUrlBackfill;
      const labelUrl = lockedShipment.labelUrl ?? labelUrlBackfill;
      const missingDocs: string[] = [];
      if (!bolUrl) missingDocs.push("BOL");
      if (!labelUrl) missingDocs.push("pallet labels");

      await tx
        .update(shipments)
        .set({
          priority1ShipmentId: String(providerShipment.id),
          proNumber,
          bolNumber,
          carrierName:
            providerShipment.carrierName || lockedShipment.carrierName,
          carrierScac:
            providerShipment.carrierCode || lockedShipment.carrierScac,
          isDryRun: false,
          status: reconciledStatus,
          dispatchedAt: lockedShipment.dispatchedAt ?? new Date(),
          trackingEvents: mergeTrackingEvents(
            lockedShipment.trackingEvents,
            mapped.trackingEvents,
          ),
          deliveredAt: mapped.deliveredAt ?? lockedShipment.deliveredAt,
          bolUrl,
          labelUrl,
          lastError:
            missingDocs.length === 0
              ? null
              : `Priority1 shipment reconciled; missing ${missingDocs.join(" and ")}`,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, shipmentId));

      if (proNumber || bolNumber) {
        await tx
          .update(orders)
          .set({
            trackingNumber: proNumber || bolNumber,
            carrier:
              providerShipment.carrierName || lockedOrder.selectedCarrier,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));
      }
    });

    return {
      dispatched: false,
      reconciled: true,
      shipmentId,
      priority1Id: providerShipment.id,
      proNumber,
    };
  } catch (error) {
    if (error instanceof Priority1ApiError && error.status === 404) return null;
    if (error instanceof Priority1ShipmentMatchError) {
      throw new ShippingBookingReviewError(error.message);
    }
    throw error;
  }
}

async function loadDispatchOrder(orderId: string) {
  return db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: {
      buyer: true,
    },
  });
}

async function claimShipmentDispatch(params: {
  orderId: string;
  shipmentId: string;
  buyer: NonNullable<Awaited<ReturnType<typeof loadDispatchOrder>>>["buyer"];
}) {
  return db.transaction(async (tx): Promise<DispatchClaim> => {
    const [lockedOrder] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, params.orderId))
      .for("update");
    const [lockedShipment] = await tx
      .select()
      .from(shipments)
      .where(eq(shipments.id, params.shipmentId))
      .for("update");
    const [openDispute] = await tx
      .select({ id: disputes.id })
      .from(disputes)
      .where(
        and(
          eq(disputes.orderId, params.orderId),
          inArray(disputes.status, ["open", "under_review"]),
        ),
      )
      .limit(1);
    if (!lockedOrder || !lockedShipment) {
      throw new ShippingBookingReviewError(
        "MANUAL_REVIEW_REQUIRED: order or shipment disappeared before dispatch claim",
      );
    }
    const ineligibility = getOrderDispatchIneligibilityReason({
      paymentStatus: lockedOrder.paymentStatus,
      escrowStatus: lockedOrder.escrowStatus,
      orderStatus: lockedOrder.status,
      inventoryReleasedAt: lockedOrder.inventoryReleasedAt,
      hasOpenDispute: Boolean(openDispute),
    });
    if (ineligibility) {
      throw new ShippingBookingReviewError(
        `MANUAL_REVIEW_REQUIRED: ${ineligibility}; no dispatch was sent`,
      );
    }
    const snapshot = requireShippingBookingSnapshotForOrder({
      snapshot: lockedOrder.shippingBookingSnapshot,
      order: lockedOrder,
    });
    if (
      lockedShipment.status !== "pending" ||
      lockedShipment.dispatchAttemptedAt ||
      lockedShipment.cancellationRequestedAt
    ) {
      throw new ShippingBookingReviewError(
        "MANUAL_REVIEW_REQUIRED: shipment state changed before Priority1 booking; no dispatch was sent",
      );
    }

    const dispatchBuild = buildDispatchRequestForOrder({
      order: lockedOrder,
      buyer: params.buyer,
      snapshot,
    });

    await tx
      .update(shipments)
      .set({
        dispatchAttemptedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, lockedShipment.id));

    return {
      shipmentId: lockedShipment.id,
      dryRun: priority1.isDryRun(),
      carrierName: snapshot.carrierName,
      carrierScac: snapshot.carrierScac,
      carrierRate: snapshot.carrierRate,
      ...dispatchBuild,
    };
  });
}

async function finalizeDispatchedShipment(params: {
  orderId: string;
  shipmentId: string;
  dispatch: DispatchResponse;
  claim: DispatchClaim;
}): Promise<
  | DispatchConflict
  | {
      dispatched: true;
      shipmentId: string;
      priority1Id: number;
      proNumber: string | undefined;
      bolNumber: string | undefined;
      bolUrl: string | null;
      labelUrl: string | null;
      actualCarrierCost: number | undefined;
      costMismatch: boolean;
    }
> {
  return db.transaction(async (tx) => {
    const [lockedOrder] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, params.orderId))
      .for("update");
    const [lockedShipment] = await tx
      .select()
      .from(shipments)
      .where(eq(shipments.id, params.shipmentId))
      .for("update");
    const [openDispute] = await tx
      .select({ id: disputes.id })
      .from(disputes)
      .where(
        and(
          eq(disputes.orderId, params.orderId),
          inArray(disputes.status, ["open", "under_review"]),
        ),
      )
      .limit(1);
    if (!lockedOrder || !lockedShipment) {
      throw new ShippingBookingReviewError(
        "MANUAL_REVIEW_REQUIRED: order or shipment disappeared before provider finalization",
      );
    }

    const ineligibility = getOrderDispatchIneligibilityReason({
      paymentStatus: lockedOrder.paymentStatus,
      escrowStatus: lockedOrder.escrowStatus,
      orderStatus: lockedOrder.status,
      inventoryReleasedAt: lockedOrder.inventoryReleasedAt,
      hasOpenDispute: Boolean(openDispute),
    });
    if (ineligibility) {
      return {
        kind: "order_ineligible",
        reason: ineligibility,
      } satisfies DispatchConflict;
    }
    if (
      lockedShipment.status !== "pending" ||
      !lockedShipment.dispatchAttemptedAt ||
      lockedShipment.priority1ShipmentId ||
      lockedShipment.cancellationRequestedAt
    ) {
      return {
        kind: "shipment_changed",
        reason: "shipment claim changed before provider finalization",
        shipmentStatus: lockedShipment.status,
        priority1ShipmentId: lockedShipment.priority1ShipmentId,
      } satisfies DispatchConflict;
    }

    const proNumber = getShipmentIdentifier(
      params.dispatch.shipmentIdentifiers,
      "PRO",
    );
    const bolNumber = getShipmentIdentifier(
      params.dispatch.shipmentIdentifiers,
      "BILL_OF_LADING",
    );
    const costMismatch =
      params.dispatch.totalCost !== undefined &&
      Math.abs(params.dispatch.totalCost - params.claim.carrierRate) > 0.01;

    const bolUrl = resolveDispatchBolUrl(params.dispatch);
    const labelUrl = resolveDispatchLabelUrl(params.dispatch);
    const lastErrorParts: string[] = [];
    if (costMismatch) {
      lastErrorParts.push(
        `Priority1 dispatch cost ${params.dispatch.totalCost} differs from quoted carrier rate ${params.claim.carrierRate}`,
      );
    }
    const docsMissing = !bolUrl || !labelUrl;
    if (docsMissing) {
      const missing = [
        !bolUrl ? "BOL" : null,
        !labelUrl ? "pallet labels" : null,
      ]
        .filter(Boolean)
        .join(" and ");
      lastErrorParts.push(
        `Priority1 dispatch missing ${missing}; document backfill pending`,
      );
    }

    await tx
      .update(shipments)
      .set({
        priority1ShipmentId: String(params.dispatch.id),
        proNumber,
        bolNumber,
        carrierName: params.claim.carrierName,
        carrierScac: params.claim.carrierScac,
        isDryRun: params.claim.dryRun,
        bolUrl,
        labelUrl,
        status: "dispatched",
        dispatchedAt: new Date(),
        pickupDate: params.claim.pickupDate,
        lastError: lastErrorParts.length > 0 ? lastErrorParts.join("; ") : null,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, lockedShipment.id));

    await tx
      .update(orders)
      .set({
        trackingNumber: proNumber || bolNumber,
        carrier: params.claim.carrierName,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, params.orderId));

    return {
      dispatched: true,
      shipmentId: lockedShipment.id,
      priority1Id: params.dispatch.id,
      proNumber,
      bolNumber,
      bolUrl,
      labelUrl,
      actualCarrierCost: params.dispatch.totalCost,
      costMismatch,
    };
  });
}

async function cancelBookedPriority1Shipment(params: {
  orderId: string;
  orderNumber: string;
  shipmentId: string;
  priority1ShipmentId: string;
  dryRun: boolean;
  carrierName: string;
  carrierScac: string | null;
  conflict: DispatchConflict;
}) {
  const shipmentIdNumber = Number(params.priority1ShipmentId);
  if (!Number.isInteger(shipmentIdNumber) || shipmentIdNumber <= 0) {
    throw new ShippingBookingReviewError(
      `MANUAL_REVIEW_REQUIRED: ${params.conflict.reason}; the new Priority1 shipment ID is invalid`,
    );
  }

  let providerCancelled = params.dryRun;
  if (!params.dryRun) {
    try {
      await priority1.cancel({ id: shipmentIdNumber });
      providerCancelled = true;
    } catch (cancelError) {
      try {
        const response = await priority1.getStatus({
          identifierType: "CUSTOMER_REFERENCE",
          identifierValue: params.orderNumber,
        });
        const providerShipment = selectPriority1Shipment(
          response,
          params.priority1ShipmentId,
        );
        if (providerShipment) {
          const mapped = mapPriority1ShipmentStatus("dispatched", providerShipment);
          providerCancelled = mapped.mappedStatus === "cancelled";
        }
      } catch {
        throw new ShippingBookingReviewError(
          `MANUAL_REVIEW_REQUIRED: ${params.conflict.reason}; provider cancellation of shipment ${params.priority1ShipmentId} could not be confirmed after ${cancelError instanceof Error ? cancelError.message : "an unknown error"}`,
        );
      }

      if (!providerCancelled) {
        throw new ShippingBookingReviewError(
          `MANUAL_REVIEW_REQUIRED: ${params.conflict.reason}; provider shipment ${params.priority1ShipmentId} may still be active`,
        );
      }
    }
  }

  await db.transaction(async (tx) => {
    const [lockedOrder] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, params.orderId))
      .for("update");
    const [lockedShipment] = await tx
      .select()
      .from(shipments)
      .where(eq(shipments.id, params.shipmentId))
      .for("update");

    if (!lockedOrder || !lockedShipment) {
      throw new ShippingBookingReviewError(
        "MANUAL_REVIEW_REQUIRED: order or shipment disappeared while cancelling the provider booking",
      );
    }
    if (
      lockedShipment.priority1ShipmentId &&
      lockedShipment.priority1ShipmentId !== params.priority1ShipmentId
    ) {
      throw new ShippingBookingReviewError(
        `MANUAL_REVIEW_REQUIRED: provider booking ${params.priority1ShipmentId} was cancelled, but shipment ${lockedShipment.id} already references ${lockedShipment.priority1ShipmentId}`,
      );
    }
    if (
      lockedShipment.status !== "pending" &&
      lockedShipment.status !== "cancelled"
    ) {
      throw new ShippingBookingReviewError(
        `MANUAL_REVIEW_REQUIRED: provider booking ${params.priority1ShipmentId} was cancelled, but local shipment status is ${lockedShipment.status}`,
      );
    }

    await tx
      .update(shipments)
      .set({
        priority1ShipmentId: params.priority1ShipmentId,
        carrierName: params.carrierName,
        carrierScac: params.carrierScac,
        isDryRun: params.dryRun,
        status: "cancelled",
        lastError: `Priority1 booking cancelled: ${params.conflict.reason}`,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, lockedShipment.id));
  });

  return {
    dispatched: false,
    cancelled: true,
    shipmentId: params.shipmentId,
    priority1Id: Number(params.priority1ShipmentId),
    reason: `Priority1 booking was cancelled after local state changed: ${params.conflict.reason}`,
  };
}

export async function dispatchShipmentForOrder(orderId: string) {
  const order = await loadDispatchOrder(orderId);
  if (!order) return { dispatched: false, reason: "Order not found" };

  const existingOpenDispute = await db.query.disputes.findFirst({
    where: and(
      eq(disputes.orderId, orderId),
      inArray(disputes.status, ["open", "under_review"]),
    ),
    columns: { id: true },
  });
  const initialIneligibility = getOrderDispatchIneligibilityReason({
    paymentStatus: order.paymentStatus,
    escrowStatus: order.escrowStatus,
    orderStatus: order.status,
    inventoryReleasedAt: order.inventoryReleasedAt,
    hasOpenDispute: Boolean(existingOpenDispute),
  });
  if (initialIneligibility) {
    return {
      dispatched: false,
      reason: initialIneligibility,
    };
  }
  if (!order.selectedQuoteId) {
    return { dispatched: false, reason: "No verified shipping quote selected" };
  }

  const lockKey = `shipping-dispatch-lock:${orderId}`;
  const lockToken = randomUUID();
  const lockAcquired = await redis.set(lockKey, lockToken, {
    nx: true,
    ex: DISPATCH_LOCK_SECONDS,
  });
  if (!lockAcquired) {
    throw new Error(`Shipment dispatch is already in progress for order ${orderId}`);
  }

  let shipment = await db.query.shipments.findFirst({
    where: eq(shipments.orderId, orderId),
  });

  try {
    const dryRun = priority1.isDryRun();
    if (
      shipment &&
      [
        "dispatched",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ].includes(shipment.status)
    ) {
      return {
        dispatched: false,
        reason: `Shipment already ${shipment.status}`,
        shipmentId: shipment.id,
      };
    }

    if (!shipment) {
      const [created] = await db
        .insert(shipments)
        .values({
          orderId,
          quoteId: order.selectedQuoteId,
          carrierName: order.selectedCarrier,
          isDryRun: dryRun,
          status: "pending",
        })
        .onConflictDoNothing()
        .returning();
      shipment =
        created ??
        (await db.query.shipments.findFirst({
          where: eq(shipments.orderId, orderId),
        }));
    }
    if (!shipment) throw new Error("Unable to claim shipment dispatch");
    const priorDispatchAttempt = shipment.dispatchAttemptedAt;

    const reconciled = await reconcilePendingShipment({
      order,
      shipmentId: shipment.id,
      expectedPriority1ShipmentId: shipment.priority1ShipmentId,
    });
    if (reconciled) return reconciled;
    if (shipment.priority1ShipmentId) {
      throw new Error(
        "Shipment has a Priority1 ID but could not be reconciled; refusing duplicate dispatch",
      );
    }
    if (priorDispatchAttempt && !dryRun) {
      await openReconciliationCase(db, {
        caseKey: `shipment-dispatch-unreconciled:${order.id}`,
        type: "shipment_ambiguity",
        source: "priority1",
        severity: "critical",
        title: "Paid order stuck after prior dispatch attempt",
        summary:
          "A previous Priority1 dispatch attempt could not be reconciled; automatic rebook is refused to avoid double-booking. Manual review required.",
        orderId: order.id,
        externalReference: order.orderNumber,
        details: {
          shipmentId: shipment.id,
          priority1ShipmentId: shipment.priority1ShipmentId,
          dispatchAttemptedAt: shipment.dispatchAttemptedAt,
        },
      }).catch((caseError) => {
        console.error("Failed to open unreconciled dispatch recon case", {
          orderId,
          caseError,
        });
      });
      throw new Error(
        "Previous Priority1 dispatch attempt is still unreconciled; retrying status before refusing a duplicate booking",
      );
    }

    const dispatchClaim = await claimShipmentDispatch({
      orderId,
      shipmentId: shipment.id,
      buyer: order.buyer,
    });

    let dispatchResult: DispatchResponse;
    try {
      dispatchResult = await priority1.dispatch(dispatchClaim.request);
    } catch (dispatchError) {
      // Post-book validation failed after carrier accepted the booking.
      // Cancel + persist, open recon, and refund the still-paid order.
      if (dispatchError instanceof Priority1PostBookValidationError) {
        shipment.priority1ShipmentId = String(
          dispatchError.priority1ShipmentId,
        );
        const cancelResult = await cancelBookedPriority1Shipment({
          orderId,
          orderNumber: order.orderNumber,
          shipmentId: dispatchClaim.shipmentId,
          priority1ShipmentId: String(dispatchError.priority1ShipmentId),
          dryRun: dispatchClaim.dryRun,
          carrierName: dispatchClaim.carrierName,
          carrierScac: dispatchClaim.carrierScac,
          conflict: {
            kind: "shipment_changed",
            reason: `post-book validation failed after Priority1 booking: ${dispatchError.message}`,
            shipmentStatus: "pending",
            priority1ShipmentId: String(dispatchError.priority1ShipmentId),
          },
        });

        await openReconciliationCase(db, {
          caseKey: `shipment-post-book-cancel:${order.id}`,
          type: "shipment_ambiguity",
          source: "priority1",
          severity: "high",
          title: "Post-book validation cancelled freight booking",
          summary: cancelResult.reason,
          orderId: order.id,
          externalReference: String(dispatchError.priority1ShipmentId),
          details: {
            shipmentId: dispatchClaim.shipmentId,
            priority1ShipmentId: dispatchError.priority1ShipmentId,
            orderNumber: order.orderNumber,
            validationError: dispatchError.message,
          },
        }).catch((caseError) => {
          console.error("Failed to open post-book cancel reconciliation case", {
            orderId,
            caseError,
          });
        });

        try {
          const refund = await processOrderRefund({
            db,
            orderId,
            reason: `Freight booking cancelled after post-book validation failure: ${dispatchError.message}`,
            adminAlert: {
              title: "Paid Order Refunded After Post-Book Validation Failure",
              message: `Order ${order.orderNumber}: Priority1 shipment ${dispatchError.priority1ShipmentId} was cancelled after validation failed (${dispatchError.message}).`,
            },
          });
          return {
            ...cancelResult,
            refunded: true,
            refundId: refund.refundId,
          };
        } catch (refundError) {
          throw new ShippingBookingReviewError(
            `MANUAL_REVIEW_REQUIRED: freight booking cancelled after post-book validation, but automatic refund failed: ${
              refundError instanceof Error
                ? refundError.message
                : "unknown refund error"
            }`,
          );
        }
      }
      throw dispatchError;
    }

    const liveShipmentId = requireLiveDispatchShipmentId(dispatchResult.id);
    shipment.priority1ShipmentId = String(liveShipmentId);
    shipment.isDryRun = dispatchClaim.dryRun;

    const finalized = await finalizeDispatchedShipment({
      orderId,
      shipmentId: dispatchClaim.shipmentId,
      dispatch: dispatchResult,
      claim: dispatchClaim,
    });
    if ("kind" in finalized) {
      return await cancelBookedPriority1Shipment({
        orderId,
        orderNumber: order.orderNumber,
        shipmentId: dispatchClaim.shipmentId,
        priority1ShipmentId: String(dispatchResult.id),
        dryRun: dispatchClaim.dryRun,
        carrierName: dispatchClaim.carrierName,
        carrierScac: dispatchClaim.carrierScac,
        conflict: finalized,
      });
    }

    // Immediate BOL + label backfill only when finalize left docs missing.
    const needsBolBackfill = !finalized.bolUrl;
    const needsLabelBackfill = !finalized.labelUrl;
    if (needsBolBackfill || needsLabelBackfill) {
      await openReconciliationCase(db, {
        caseKey: `shipment-docs-pending:${order.id}`,
        type: "shipment_ambiguity",
        source: "priority1",
        severity: "medium",
        title: "Dispatch completed without full freight documents",
        summary:
          "Priority1 booking is live but BOL and/or pallet labels are missing; automatic backfill will retry via tracking.",
        orderId: order.id,
        externalReference: String(dispatchResult.id),
        details: {
          shipmentId: finalized.shipmentId,
          hasBol: Boolean(finalized.bolUrl),
          hasLabel: Boolean(finalized.labelUrl),
        },
      }).catch(() => undefined);
    }
    if (!finalized.proNumber && !finalized.bolNumber) {
      await db
        .update(shipments)
        .set({
          lastError:
            (finalized.costMismatch
              ? `Priority1 dispatch cost mismatch; `
              : "") +
            "Priority1 dispatch missing PRO/BOL identifiers; document recovery blocked until status provides them",
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, finalized.shipmentId));
      await openReconciliationCase(db, {
        caseKey: `shipment-docs-missing-ids:${order.id}`,
        type: "shipment_ambiguity",
        source: "priority1",
        severity: "medium",
        title: "Dispatch missing PRO/BOL identifiers",
        summary:
          "Priority1 booking succeeded without PRO/BOL identifiers; document recovery is blocked until status provides them.",
        orderId: order.id,
        externalReference: String(dispatchResult.id),
        details: { shipmentId: finalized.shipmentId },
      }).catch(() => undefined);
    } else if (needsBolBackfill || needsLabelBackfill) {
      const identifiers = shipmentDocumentIdentifiersFrom({
        proNumber: finalized.proNumber,
        bolNumber: finalized.bolNumber,
      });
      const [bolFetch, labelFetch] = await Promise.all([
        needsBolBackfill
          ? fetchPriority1BillOfLadingUrl(identifiers)
          : Promise.resolve({ url: finalized.bolUrl, error: null, permanent: false }),
        needsLabelBackfill
          ? fetchPriority1PalletLabelUrl(identifiers)
          : Promise.resolve({
              url: finalized.labelUrl,
              error: null,
              permanent: false,
            }),
      ]);
      const lastErrorParts: string[] = [];
      if (finalized.costMismatch) {
        lastErrorParts.push(
          `Priority1 dispatch cost ${finalized.actualCarrierCost} differs from quoted carrier rate`,
        );
      }
      if (needsBolBackfill && !bolFetch.url) {
        lastErrorParts.push(
          bolFetch.error
            ? `BOL backfill failed: ${bolFetch.error}`
            : "BOL document not yet available from Priority1",
        );
      }
      if (needsLabelBackfill && !labelFetch.url) {
        lastErrorParts.push(
          labelFetch.error
            ? `Pallet label backfill failed: ${labelFetch.error}`
            : "Pallet labels not yet available from Priority1",
        );
      }
      await db
        .update(shipments)
        .set({
          ...(bolFetch.url && needsBolBackfill ? { bolUrl: bolFetch.url } : {}),
          ...(labelFetch.url && needsLabelBackfill
            ? { labelUrl: labelFetch.url }
            : {}),
          lastError: lastErrorParts.length > 0 ? lastErrorParts.join("; ") : null,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, finalized.shipmentId));

      if (
        (needsBolBackfill && bolFetch.permanent) ||
        (needsLabelBackfill && labelFetch.permanent)
      ) {
        await openReconciliationCase(db, {
          caseKey: `shipment-docs-permanent:${order.id}`,
          type: "shipment_ambiguity",
          source: "priority1",
          severity: "high",
          title: "Permanent freight document recovery failure",
          summary: lastErrorParts.join("; "),
          orderId: order.id,
          externalReference: String(dispatchResult.id),
          details: {
            shipmentId: finalized.shipmentId,
            bolPermanent: bolFetch.permanent,
            labelPermanent: labelFetch.permanent,
          },
        }).catch(() => undefined);
      }
    }

    return finalized;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown dispatch error";
    if (error instanceof ShippingQuoteUnbookableError) {
      try {
        const refund = await processOrderRefund({
          db,
          orderId,
          reason: `Freight could not be safely booked: ${error.message}`,
          adminAlert: {
            title: "Unbookable Paid Order Refunded",
            message: `Order ${order.orderNumber} was refunded before freight booking: ${error.message}`,
          },
        });
        return {
          dispatched: false,
          refunded: true,
          refundId: refund.refundId,
          reason: error.message,
        };
      } catch (refundError) {
        if (shipment) {
          await db
            .update(shipments)
            .set({
              lastError: `Dispatch blocked; automatic refund failed: ${
                refundError instanceof Error
                  ? refundError.message
                  : "Unknown refund error"
              }`,
              updatedAt: new Date(),
            })
            .where(eq(shipments.id, shipment.id));
        }
        throw refundError;
      }
    }
    if (shipment) {
      await db
        .update(shipments)
        .set({ lastError: errorMessage, updatedAt: new Date() })
        .where(eq(shipments.id, shipment.id));
    }
    if (error instanceof ShippingBookingReviewError) {
      await openReconciliationCase(db, {
        caseKey: `shipment-dispatch-review:${order.id}`,
        type: "shipment_ambiguity",
        source: "priority1",
        severity: "high",
        title: "Shipment dispatch requires reconciliation",
        summary: errorMessage,
        orderId: order.id,
        externalReference:
          shipment?.priority1ShipmentId ?? order.orderNumber,
        details: {
          shipmentId: shipment?.id ?? null,
          priority1ShipmentId: shipment?.priority1ShipmentId ?? null,
          orderNumber: order.orderNumber,
        },
      }).catch((caseError) => {
        console.error("Failed to persist shipment dispatch reconciliation case", {
          orderId: order.id,
          caseError,
        });
      });
    }
    throw error;
  } finally {
    await releaseDispatchLock(lockKey, lockToken).catch((error) => {
      console.error("Failed to release shipment dispatch lock", {
        orderId,
        error,
      });
    });
  }
}

export const shipmentDispatch = inngest.createFunction(
  {
    id: "shipment-dispatch",
    name: "Auto-dispatch Shipment via Priority1",
    retries: 6,
    concurrency: { limit: 1, key: "event.data.orderId" },
  },
  { event: "order/paid" },
  async ({ event, step }) => {
    const { orderId } = event.data;
    const dispatchResult = await step.run("dispatch-shipment", async () => {
      try {
        return await dispatchShipmentForOrder(orderId);
      } catch (error) {
        if (error instanceof ShippingBookingReviewError) {
          throw new NonRetriableError(error.message, { cause: error });
        }
        throw error;
      }
    });
    const notificationResult = await step.run("notify-paid-order", () =>
      sendPaidOrderNotifications(orderId),
    );
    return { ...dispatchResult, notificationResult };
  },
);
