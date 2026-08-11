import { inngest } from "../client";
import { db } from "@/server/db";
import {
  disputes,
  orders,
  platformSettings,
  shipments,
  users,
} from "@/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { sendEmailOrThrow } from "@/lib/email/delivery";
import { buildEmailIdempotencyKey } from "@/lib/email/delivery-policy";
import { env } from "@/env";
import { stripe } from "@/lib/stripe";
import { escapeHtml } from "@/lib/utils";
import type Stripe from "stripe";
import {
  hasPersistedProviderPickupEvidence,
  isProviderConfirmedPickup,
  type ProviderConfirmedPickupEventData,
} from "@/server/services/payout-eligibility";
import { findStripeTransferForOrder } from "@/server/services/stripe-order-transfer";
import {
  openReconciliationCase,
  resolveReconciliationCaseByKey,
} from "@/server/services/reconciliation-cases";

interface OrderPickedUpEvent {
  data: ProviderConfirmedPickupEventData;
}

interface PayoutReleaseResult {
  released: boolean;
  reason?: string;
  orderId?: string;
  orderNumber?: string;
  payoutAmount?: number;
  sellerEmail?: string;
  sellerName?: string;
}

/** Soft fails that may clear later (status recovery, dispute close, etc.). */
const RECOVERABLE_PAYOUT_SOFT_FAIL_REASONS = [
  "Shipment lacks live Priority1 pickup evidence",
  "Order is not a paid, provider-shipped order",
  "Order has an open dispute",
  "Source charge is refunded or disputed",
] as const;

export function isRecoverablePayoutSoftFail(reason: string | undefined): boolean {
  if (!reason) return false;
  return RECOVERABLE_PAYOUT_SOFT_FAIL_REASONS.some(
    (candidate) => reason === candidate || reason.startsWith(candidate),
  );
}

/** Max soft-retry attempts after the configured delay (12h apart). */
export const PAYOUT_SOFT_RETRY_ATTEMPTS = 6;
export const PAYOUT_SOFT_RETRY_INTERVAL = "12h";

export function normalizePayoutDelayDays(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return 3;
  return Math.min(30, Math.max(1, Math.trunc(parsed)));
}

async function getConfiguredPayoutDelayDays(): Promise<number> {
  const setting = await db.query.platformSettings.findFirst({
    where: eq(platformSettings.key, "escrowReleaseDays"),
    columns: { value: true },
  });
  return normalizePayoutDelayDays(setting?.value);
}

export async function releaseSellerPayout(
  orderId: string,
): Promise<PayoutReleaseResult> {
  try {
    return await db.transaction(async (tx) => {
      const [order] = await tx
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          createdAt: orders.createdAt,
          sellerId: orders.sellerId,
          totalPrice: orders.totalPrice,
          sellerPayout: orders.sellerPayout,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          escrowStatus: orders.escrowStatus,
          stripePaymentIntentId: orders.stripePaymentIntentId,
          stripeTransferId: orders.stripeTransferId,
          selectedQuoteId: orders.selectedQuoteId,
          shippedAt: orders.shippedAt,
          shipmentQuoteId: shipments.quoteId,
          priority1ShipmentId: shipments.priority1ShipmentId,
          shipmentStatus: shipments.status,
          shipmentIsDryRun: shipments.isDryRun,
          shipmentTrackingEvents: shipments.trackingEvents,
          sellerStripeAccountId: users.stripeAccountId,
          sellerStripeOnboardingComplete: users.stripeOnboardingComplete,
          sellerEmail: users.email,
          sellerName: users.name,
        })
        .from(orders)
        .innerJoin(users, eq(users.id, orders.sellerId))
        .innerJoin(shipments, eq(shipments.orderId, orders.id))
        .where(eq(orders.id, orderId))
        .for("update");

      if (!order) return { released: false, reason: "Order not found" };
      if (order.escrowStatus !== "held") {
        return {
          released: false,
          reason: `Payment hold status is ${order.escrowStatus}`,
        };
      }
      if (
        order.paymentStatus !== "succeeded" ||
        !["shipped", "delivered"].includes(order.status) ||
        !order.stripePaymentIntentId
      ) {
        return {
          released: false,
          reason: "Order is not a paid, provider-shipped order",
        };
      }
      if (
        !hasPersistedProviderPickupEvidence({
          selectedQuoteId: order.selectedQuoteId,
          shipmentQuoteId: order.shipmentQuoteId,
          priority1ShipmentId: order.priority1ShipmentId,
          shipmentStatus: order.shipmentStatus,
          shipmentIsDryRun: order.shipmentIsDryRun,
          shipmentTrackingEvents: order.shipmentTrackingEvents,
          orderShippedAt: order.shippedAt,
        })
      ) {
        return {
          released: false,
          reason: "Shipment lacks live Priority1 pickup evidence",
        };
      }

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
      if (openDispute) {
        return { released: false, reason: "Order has an open dispute" };
      }

      if (
        !order.sellerStripeAccountId ||
        !order.sellerStripeOnboardingComplete
      ) {
        throw new Error(`Seller ${order.sellerId} payout account is not ready`);
      }
      const sellerAccount = await stripe.accounts.retrieve(
        order.sellerStripeAccountId,
      );
      if (
        !sellerAccount.payouts_enabled ||
        sellerAccount.capabilities?.transfers !== "active"
      ) {
        throw new Error(
          `Seller ${order.sellerId} Stripe account cannot receive transfers`,
        );
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(
        order.stripePaymentIntentId,
        { expand: ["latest_charge"] },
      );
      const expectedChargeCents = Math.round(Number(order.totalPrice) * 100);
      if (
        paymentIntent.id !== order.stripePaymentIntentId ||
        paymentIntent.metadata.orderId !== order.id ||
        paymentIntent.status !== "succeeded" ||
        paymentIntent.amount_received !== expectedChargeCents ||
        paymentIntent.currency !== "usd"
      ) {
        throw new Error(`Stripe payment does not match order ${order.id}`);
      }

      const latestCharge = paymentIntent.latest_charge;
      const charge =
        typeof latestCharge === "string"
          ? await stripe.charges.retrieve(latestCharge)
          : latestCharge;
      if (!charge || charge.status !== "succeeded") {
        throw new Error(`Order ${order.id} has no successful source charge`);
      }
      if (charge.refunded || charge.amount_refunded > 0 || charge.disputed) {
        return {
          released: false,
          reason: "Source charge is refunded or disputed",
        };
      }

      const payoutCents = Math.round(Number(order.sellerPayout) * 100);
      if (payoutCents <= 0) {
        throw new Error(`Order ${order.id} has a non-positive seller payout`);
      }

      const transferGroup = `order_${order.id}`;
      let transfer: Stripe.Transfer | undefined = order.stripeTransferId
        ? await stripe.transfers.retrieve(order.stripeTransferId)
        : undefined;
      if (!transfer) {
        transfer = await findStripeTransferForOrder({
          stripe,
          orderId: order.id,
          orderCreatedAt: order.createdAt,
          destination: order.sellerStripeAccountId,
        });
      }
      if (!transfer) {
        transfer = await stripe.transfers.create(
          {
            amount: payoutCents,
            currency: "usd",
            destination: order.sellerStripeAccountId,
            source_transaction: charge.id,
            transfer_group: transferGroup,
            metadata: {
              orderId: order.id,
              orderNumber: order.orderNumber,
            },
          },
          {
            idempotencyKey: `order-payout:${order.id}:${payoutCents}`,
          },
        );
      }
      const transferSourceTransaction =
        typeof transfer.source_transaction === "string"
          ? transfer.source_transaction
          : transfer.source_transaction?.id;
      if (
        transfer.amount !== payoutCents ||
        transfer.currency.toLowerCase() !== "usd" ||
        transfer.destination !== order.sellerStripeAccountId ||
        transfer.transfer_group !== transferGroup ||
        transferSourceTransaction !== charge.id ||
        transfer.metadata.orderId !== order.id
      ) {
        throw new Error(`Existing transfer does not match order ${order.id}`);
      }
      if (transfer.amount_reversed > 0) {
        throw new Error(
          `Order ${order.id} has a previously reversed transfer and requires reconciliation`,
        );
      }

      const [updated] = await tx
        .update(orders)
        .set({
          escrowStatus: "released",
          stripeTransferId: transfer.id,
          transferFailedAt: null,
          transferError: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.escrowStatus, "held"),
            eq(orders.paymentStatus, "succeeded"),
            inArray(orders.status, ["shipped", "delivered"]),
          ),
        )
        .returning({ id: orders.id });
      if (!updated) {
        throw new Error(`Order ${order.id} changed during payout release`);
      }

      return {
        released: true,
        orderId: order.id,
        orderNumber: order.orderNumber,
        payoutAmount: Number(order.sellerPayout),
        sellerEmail: order.sellerEmail,
        sellerName: order.sellerName,
      };
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown payout error";
    await db
      .update(orders)
      .set({
        transferFailedAt: new Date(),
        transferError: errorMessage,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, orderId), eq(orders.escrowStatus, "held")));
    await openReconciliationCase(db, {
      caseKey: `payout-failure:${orderId}`,
      type: "payout_failure",
      source: "stripe",
      severity: "critical",
      title: "Seller payout release failed",
      summary: errorMessage,
      orderId,
      details: {
        workflow: "escrow-auto-release",
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
    });
    throw error;
  }
}

export const escrowAutoRelease = inngest.createFunction(
  { id: "escrow-auto-release", name: "Release Payment Hold after Pickup" },
  { event: "order/picked-up" },
  async ({ event, step }) => {
    const eventData = event.data as Partial<OrderPickedUpEvent["data"]>;
    if (!isProviderConfirmedPickup(eventData)) {
      return { released: false, reason: "Pickup was not provider-confirmed" };
    }

    const delayDays = await step.run("load-payout-delay", () =>
      getConfiguredPayoutDelayDays(),
    );
    const releaseAt = new Date(
      new Date(eventData.pickedUpAt).getTime() +
        delayDays * 24 * 60 * 60 * 1000,
    );
    await step.sleepUntil("wait-configured-payout-delay", releaseAt);

    let result: PayoutReleaseResult = {
      released: false,
      reason: "Payout release not attempted",
    };

    for (let attempt = 0; attempt < PAYOUT_SOFT_RETRY_ATTEMPTS; attempt++) {
      result = await step.run(`check-and-release-${attempt}`, () =>
        releaseSellerPayout(eventData.orderId),
      );

      if (result.released) {
        break;
      }

      const recoverable = isRecoverablePayoutSoftFail(result.reason);
      await step.run(`record-payout-soft-fail-${attempt}`, () =>
        openReconciliationCase(db, {
          caseKey: `payout-soft-defer:${eventData.orderId}`,
          type: "payout_failure",
          source: "stripe",
          severity: recoverable ? "medium" : "high",
          title: recoverable
            ? "Seller payout deferred — will retry"
            : "Seller payout soft-failed",
          summary:
            result.reason ??
            "Payout release returned without transferring funds",
          orderId: eventData.orderId,
          details: {
            workflow: "escrow-auto-release",
            attempt,
            recoverable,
            reason: result.reason ?? null,
          },
        }),
      );

      if (!recoverable || attempt >= PAYOUT_SOFT_RETRY_ATTEMPTS - 1) {
        // Exhausted soft retries (or permanent soft-fail): mark for admin retry.
        await step.run(`mark-payout-soft-fail-${attempt}`, async () => {
          await db
            .update(orders)
            .set({
              transferFailedAt: new Date(),
              transferError:
                result.reason ??
                "Payout release soft-failed after deferred retries",
              updatedAt: new Date(),
            })
            .where(
              and(eq(orders.id, eventData.orderId), eq(orders.escrowStatus, "held")),
            );
        });
        break;
      }

      await step.sleep(
        `wait-payout-soft-retry-${attempt}`,
        PAYOUT_SOFT_RETRY_INTERVAL,
      );
    }

    if (result.released) {
      await step.run("resolve-payout-reconciliation", () =>
        resolveReconciliationCaseByKey(db, {
          caseKey: `payout-failure:${eventData.orderId}`,
          resolution:
            "Stripe accepted and the database persisted the validated seller transfer.",
          details: {
            orderId: eventData.orderId,
          },
        }),
      );
      await step.run("resolve-payout-soft-defer", () =>
        resolveReconciliationCaseByKey(db, {
          caseKey: `payout-soft-defer:${eventData.orderId}`,
          resolution: "Payout released after deferred retry.",
          details: {
            orderId: eventData.orderId,
          },
        }),
      );
    }
    if (
      result.released &&
      result.sellerEmail &&
      result.sellerName &&
      result.orderNumber &&
      result.orderId &&
      result.payoutAmount !== undefined
    ) {
      await step.run("notify-seller", () =>
        sendEmailOrThrow({
          category: "seller_payout_released",
          idempotencyKey: buildEmailIdempotencyKey(
            "seller_payout_released",
            result.orderId,
            result.sellerEmail,
          ),
          message: {
            from: env.EMAIL_FROM,
            to: result.sellerEmail!,
            subject: `Funds released for order ${result.orderNumber}`,
            html: `
            <p>Hi ${escapeHtml(result.sellerName!)},</p>
            <p>Your carrier-confirmed shipment for order <strong>${escapeHtml(result.orderNumber!)}</strong> completed its payout hold, and funds have been released to your connected account.</p>
            <p><strong>Payout amount:</strong> $${result.payoutAmount!.toFixed(2)}</p>
            <p><a href="${env.NEXT_PUBLIC_APP_URL}/seller/orders/${result.orderId}">View order details</a></p>
          `,
          },
        }),
      );
    }

    return result;
  },
);
