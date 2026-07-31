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
  priority1,
} from "@/server/services/priority1";
import {
  Priority1ShipmentMatchError,
  selectPriority1Shipment,
} from "@/server/services/priority1-selection";
import {
  buildDispatchRequestForOrder,
  getOrderDispatchIneligibilityReason,
  getShipmentIdentifier,
  mapPriority1ShipmentStatus,
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

      await tx
        .update(shipments)
        .set({
          priority1ShipmentId: String(providerShipment.id),
          proNumber,
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
          lastError: null,
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
      throw new ShippingBookingReviewError(
        "MANUAL_REVIEW_REQUIRED: a previous Priority1 dispatch attempt could not be reconciled; refusing a duplicate booking",
      );
    }

    // Phase 1 commits an ambiguity marker before any provider call. If the
    // provider succeeds but the later DB transaction fails, retries reconcile
    // by customer reference instead of creating a duplicate shipment.
    await db.transaction(async (tx) => {
      const [lockedOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");
      const [lockedShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipment!.id))
        .for("update");
      const [openDispute] = await tx
        .select({ id: disputes.id })
        .from(disputes)
        .where(
          and(
            eq(disputes.orderId, orderId),
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
      requireShippingBookingSnapshotForOrder({
        snapshot: lockedOrder.shippingBookingSnapshot,
        order: lockedOrder,
      });
      if (
        lockedShipment.status !== "pending" ||
        lockedShipment.dispatchAttemptedAt
      ) {
        throw new ShippingBookingReviewError(
          "MANUAL_REVIEW_REQUIRED: shipment state changed before Priority1 booking; no dispatch was sent",
        );
      }

      await tx
        .update(shipments)
        .set({
          dispatchAttemptedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, lockedShipment.id));
    });

    // Phase 2 holds the same order row lock used by cancellation/refund across
    // the live provider call. Either booking wins and cancellation observes the
    // provider ID, or cancellation wins and this recheck aborts before booking.
    return await db.transaction(async (tx) => {
      const [lockedOrder] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");
      const [lockedShipment] = await tx
        .select()
        .from(shipments)
        .where(eq(shipments.id, shipment!.id))
        .for("update");
      const [openDispute] = await tx
        .select({ id: disputes.id })
        .from(disputes)
        .where(
          and(
            eq(disputes.orderId, orderId),
            inArray(disputes.status, ["open", "under_review"]),
          ),
        )
        .limit(1);
      if (!lockedOrder || !lockedShipment) {
        throw new ShippingBookingReviewError(
          "MANUAL_REVIEW_REQUIRED: order or shipment disappeared before provider booking",
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
      if (
        lockedShipment.status !== "pending" ||
        !lockedShipment.dispatchAttemptedAt ||
        lockedShipment.priority1ShipmentId
      ) {
        throw new ShippingBookingReviewError(
          "MANUAL_REVIEW_REQUIRED: shipment claim changed before provider booking",
        );
      }

      const snapshot = requireShippingBookingSnapshotForOrder({
        snapshot: lockedOrder.shippingBookingSnapshot,
        order: lockedOrder,
      });
      const { pickupDate, request } = buildDispatchRequestForOrder({
        order: lockedOrder,
        buyer: order.buyer,
        snapshot,
      });
      const dispatchResult = await priority1.dispatch(request);
      if (!Number.isInteger(dispatchResult.id) || dispatchResult.id <= 0) {
        throw new Error(
          "Priority1 dispatch response did not include a shipment ID",
        );
      }

      const proNumber = getShipmentIdentifier(
        dispatchResult.shipmentIdentifiers,
        "PRO",
      );
      const bolNumber = getShipmentIdentifier(
        dispatchResult.shipmentIdentifiers,
        "BILL_OF_LADING",
      );
      const costMismatch =
        dispatchResult.totalCost !== undefined &&
        Math.abs(dispatchResult.totalCost - snapshot.carrierRate) > 0.01;

      await tx
        .update(shipments)
        .set({
          priority1ShipmentId: String(dispatchResult.id),
          proNumber,
          carrierName: snapshot.carrierName,
          carrierScac: snapshot.carrierScac,
          isDryRun: dryRun,
          bolUrl: dispatchResult.capacityProviderBolUrl,
          labelUrl: dispatchResult.capacityProviderPalletLabelUrl,
          status: "dispatched",
          dispatchedAt: new Date(),
          pickupDate,
          lastError: costMismatch
            ? `Priority1 dispatch cost ${dispatchResult.totalCost} differs from quoted carrier rate ${snapshot.carrierRate}`
            : null,
          updatedAt: new Date(),
        })
        .where(eq(shipments.id, lockedShipment.id));

      await tx
        .update(orders)
        .set({
          trackingNumber: proNumber || bolNumber,
          carrier: snapshot.carrierName,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      return {
        dispatched: true,
        shipmentId: lockedShipment.id,
        priority1Id: dispatchResult.id,
        proNumber,
        bolNumber,
        actualCarrierCost: dispatchResult.totalCost,
        costMismatch,
      };
    });
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
