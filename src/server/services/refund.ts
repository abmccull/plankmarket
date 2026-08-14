import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import {
  disputes,
  notifications,
  orders,
  shipments,
  users,
} from "@/server/db/schema";
import { stripe } from "@/lib/stripe";
import type { Database } from "@/server/db";
import { releaseReservedInventory } from "./inventory-reservation";
import {
  cancelPriority1ShipmentForOrder,
  ShipmentCancellationError,
} from "./shipment-cancellation";
import { findStripeTransferForOrder } from "./stripe-order-transfer";
import {
  openReconciliationCase,
  resolveReconciliationCaseByKey,
} from "./reconciliation-cases";

interface ProcessOrderRefundParams {
  db: Database;
  orderId: string;
  amountCents?: number;
  reason?: string;
  adminAlert?: { title: string; message: string };
}

interface ReconcileOrderRefundParams {
  db: Database;
  orderId: string;
  refundedAmountCents: number;
  stripeRefundId?: string;
  reason?: string;
}

interface RefundResult {
  refundId: string;
  amountRefunded: number;
  transferReversalId?: string;
  state: OrderRefundState;
  providerStatus: string | null;
}

export type OrderRefundState =
  | "succeeded"
  | "refund_pending"
  | "reconciliation_required";

export const SELLER_FUNDED_FREIGHT_PARTIAL_RECOVERY_REASON =
  "Manual allocation is required for a partial recovery on an order with seller-funded freight. Keep the order in manual review until the recovery is explicitly allocated across merchandise, buyer fees, buyer-paid freight, and seller-funded freight.";

export class ManualFreightAllocationRequiredError extends Error {
  readonly code = "MANUAL_FREIGHT_ALLOCATION_REQUIRED";

  constructor(orderId: string) {
    super(
      `Partial refund blocked for order ${orderId}. ${SELLER_FUNDED_FREIGHT_PARTIAL_RECOVERY_REASON}`,
    );
    this.name = "ManualFreightAllocationRequiredError";
  }
}

interface LockedRefundOrder {
  id: string;
  orderNumber: string;
  createdAt: Date;
  buyerId: string;
  sellerId: string;
  sellerStripeAccountId: string | null;
  subtotal: number;
  buyerFee: number;
  sellerFee: number;
  buyerFreightCharge: number;
  sellerStripeFee: number;
  totalPrice: number;
  sellerPayout: number;
  status: typeof orders.$inferSelect.status;
  paymentStatus: string | null;
  escrowStatus: string;
  stripePaymentIntentId: string | null;
  stripeTransferId: string | null;
  stripeTransferReversalId: string | null;
  transferReversedAmount: number;
  refundedAmount: number | null;
  sellerFreightContribution: number;
  taxLiability: typeof orders.$inferSelect.taxLiability;
  taxReversalStatus: typeof orders.$inferSelect.taxReversalStatus;
  notes: string | null;
}

interface LockedStripeDispute {
  id: string;
  status: typeof disputes.$inferSelect.status;
  source: typeof disputes.$inferSelect.source;
}

function normalizeStripeRefundStatus(
  status: string | null | undefined,
): string | null {
  return typeof status === "string" && status.length > 0 ? status : null;
}

function mapRefundStateFromStripeStatus(
  status: string | null | undefined,
): OrderRefundState {
  const normalizedStatus = normalizeStripeRefundStatus(status);
  if (normalizedStatus === "succeeded") return "succeeded";
  if (normalizedStatus === "pending") return "refund_pending";
  return "reconciliation_required";
}

function formatRefundAttemptSummary(params: {
  state: Exclude<OrderRefundState, "succeeded">;
  stripeRefundId: string;
  refundAmountCents: number;
  providerStatus: string | null;
  reason?: string;
}): string {
  const statusLabel =
    params.state === "refund_pending"
      ? "Refund pending at Stripe"
      : "Refund requires reconciliation";
  return `[${statusLabel}: ${params.stripeRefundId}; amount $${(
    params.refundAmountCents / 100
  ).toFixed(2)}; provider status ${params.providerStatus ?? "unknown"}${
    params.reason ? `; ${params.reason}` : ""
  }]`;
}

export function shouldReleaseInventoryOnRefund(params: {
  orderStatus: string;
  isFullRefund: boolean;
}): boolean {
  const { orderStatus, isFullRefund } = params;

  return (
    isFullRefund &&
    (orderStatus === "pending" ||
      orderStatus === "confirmed" ||
      orderStatus === "processing")
  );
}

export function canIssuePartialOrderRefund(params: {
  stripeTransferId: string | null;
}): boolean {
  return Boolean(params.stripeTransferId);
}

export function requiresManualFreightAllocation(params: {
  sellerFreightContribution: number;
  cumulativeRecoveryCents: number;
  fullAmountCents: number;
}): boolean {
  return (
    Number(params.sellerFreightContribution) > 0 &&
    params.cumulativeRecoveryCents > 0 &&
    params.cumulativeRecoveryCents < params.fullAmountCents
  );
}

export function calculateTargetTransferReversalCents(params: {
  transferAmountCents: number;
  totalChargeCents: number;
  cumulativeRecoveryCents: number;
}): number {
  const { transferAmountCents, totalChargeCents, cumulativeRecoveryCents } =
    params;
  if (transferAmountCents <= 0 || totalChargeCents <= 0) return 0;
  if (cumulativeRecoveryCents >= totalChargeCents) return transferAmountCents;

  return Math.min(
    transferAmountCents,
    Math.round(
      transferAmountCents * (cumulativeRecoveryCents / totalChargeCents),
    ),
  );
}

interface WeightedCentBucket<K extends string> {
  key: K;
  weightCents: number;
}

type ChargeAllocationKey = "subtotal" | "buyerFee" | "buyerFreightCharge";
type SellerAllocationKey =
  | "subtotalRecovery"
  | "sellerFeeRelief"
  | "sellerStripeFeeRelief"
  | "sellerFreightRelief";

interface RefundAllocationSnapshot {
  cumulativeRefundCents: number;
  buyerChargeAllocation: Record<ChargeAllocationKey, number>;
  sellerAllocation: Record<SellerAllocationKey, number> & {
    netPayoutReductionCents: number;
  };
}

function allocateCentsByWeight<K extends string>(params: {
  amountCents: number;
  buckets: ReadonlyArray<WeightedCentBucket<K>>;
}): Record<K, number> {
  const initial = Object.fromEntries(
    params.buckets.map((bucket) => [bucket.key, 0]),
  ) as Record<K, number>;
  const totalWeightCents = params.buckets.reduce(
    (sum, bucket) => sum + Math.max(0, Math.round(bucket.weightCents)),
    0,
  );
  const targetCents = Math.max(
    0,
    Math.min(Math.round(params.amountCents), totalWeightCents),
  );
  if (targetCents === 0 || totalWeightCents === 0) return initial;

  const entries = params.buckets.map((bucket, index) => {
    const weight = Math.max(0, Math.round(bucket.weightCents));
    const numerator = targetCents * weight;
    const floor = Math.floor(numerator / totalWeightCents);
    const remainder = numerator % totalWeightCents;

    return {
      key: bucket.key,
      index,
      floor,
      remainder,
    };
  });

  const remaining = targetCents - entries.reduce((sum, entry) => sum + entry.floor, 0);
  entries
    .slice()
    .sort((left, right) => {
      if (left.remainder === right.remainder) {
        return left.index - right.index;
      }
      return left.remainder > right.remainder ? -1 : 1;
    })
    .slice(0, remaining)
    .forEach((entry) => {
      const target = entries.find((candidate) => candidate.key === entry.key);
      if (target) target.floor += 1;
    });

  return entries.reduce(
    (result, entry) => {
      result[entry.key] = entry.floor;
      return result;
    },
    { ...initial },
  );
}

function scaleByReferenceCents(componentCents: number, params: {
  cumulativeRefundCents: number;
  totalChargeCents: number;
}): { floor: number; remainder: number } {
  const safeComponentCents = Math.max(0, Math.round(componentCents));
  const safeRefundCents = Math.max(0, Math.round(params.cumulativeRefundCents));
  const safeTotalChargeCents = Math.max(0, Math.round(params.totalChargeCents));
  if (
    safeComponentCents === 0 ||
    safeRefundCents === 0 ||
    safeTotalChargeCents === 0
  ) {
    return { floor: 0, remainder: 0 };
  }

  const numerator = safeComponentCents * safeRefundCents;
  const denominator = safeTotalChargeCents;

  return {
    floor: Math.floor(numerator / denominator),
    remainder: numerator % denominator,
  };
}

export function calculateRefundAllocationSnapshot(params: {
  subtotalCents: number;
  buyerFeeCents: number;
  buyerFreightChargeCents: number;
  sellerFeeCents: number;
  sellerStripeFeeCents: number;
  sellerFreightContributionCents: number;
  totalChargeCents: number;
  sellerPayoutCents: number;
  cumulativeRefundCents: number;
}): RefundAllocationSnapshot {
  const totalChargeCents = Math.max(0, Math.round(params.totalChargeCents));
  const cappedRefundCents = Math.max(
    0,
    Math.min(Math.round(params.cumulativeRefundCents), totalChargeCents),
  );
  const targetPayoutReductionCents = calculateTargetTransferReversalCents({
    transferAmountCents: Math.max(0, Math.round(params.sellerPayoutCents)),
    totalChargeCents,
    cumulativeRecoveryCents: cappedRefundCents,
  });

  const buyerChargeAllocation = allocateCentsByWeight({
    amountCents: cappedRefundCents,
    buckets: [
      { key: "subtotal", weightCents: params.subtotalCents },
      { key: "buyerFee", weightCents: params.buyerFeeCents },
      {
        key: "buyerFreightCharge",
        weightCents: params.buyerFreightChargeCents,
      },
    ],
  });

  const sellerEntries = [
    {
      key: "subtotalRecovery" as const,
      ...scaleByReferenceCents(params.subtotalCents, {
        cumulativeRefundCents: cappedRefundCents,
        totalChargeCents,
      }),
    },
    {
      key: "sellerFeeRelief" as const,
      ...scaleByReferenceCents(params.sellerFeeCents, {
        cumulativeRefundCents: cappedRefundCents,
        totalChargeCents,
      }),
    },
    {
      key: "sellerStripeFeeRelief" as const,
      ...scaleByReferenceCents(params.sellerStripeFeeCents, {
        cumulativeRefundCents: cappedRefundCents,
        totalChargeCents,
      }),
    },
    {
      key: "sellerFreightRelief" as const,
      ...scaleByReferenceCents(params.sellerFreightContributionCents, {
        cumulativeRefundCents: cappedRefundCents,
        totalChargeCents,
      }),
    },
  ];

  const sellerAllocation = sellerEntries.reduce(
    (result, entry) => {
      result[entry.key] = entry.floor;
      return result;
    },
    {
      subtotalRecovery: 0,
      sellerFeeRelief: 0,
      sellerStripeFeeRelief: 0,
      sellerFreightRelief: 0,
    } satisfies Record<SellerAllocationKey, number>,
  );

  let currentNetPayoutReductionCents =
    sellerAllocation.subtotalRecovery -
    sellerAllocation.sellerFeeRelief -
    sellerAllocation.sellerStripeFeeRelief -
    sellerAllocation.sellerFreightRelief;
  let deltaToTargetCents =
    targetPayoutReductionCents - currentNetPayoutReductionCents;

  if (deltaToTargetCents > 0) {
    sellerAllocation.subtotalRecovery += deltaToTargetCents;
  } else if (deltaToTargetCents < 0) {
    const negativeAdjustmentOrder = sellerEntries
      .filter((entry) => entry.key !== "subtotalRecovery")
      .sort((left, right) => {
        if (left.remainder === right.remainder) {
          return left.key.localeCompare(right.key);
        }
        return left.remainder > right.remainder ? -1 : 1;
      })
      .map((entry) => entry.key);

    let remainingAdjustmentCents = Math.abs(deltaToTargetCents);
    while (remainingAdjustmentCents > 0) {
      const nextKey =
        negativeAdjustmentOrder[
          (remainingAdjustmentCents - 1) % negativeAdjustmentOrder.length
        ];
      sellerAllocation[nextKey] += 1;
      remainingAdjustmentCents -= 1;
    }
  }

  currentNetPayoutReductionCents =
    sellerAllocation.subtotalRecovery -
    sellerAllocation.sellerFeeRelief -
    sellerAllocation.sellerStripeFeeRelief -
    sellerAllocation.sellerFreightRelief;
  deltaToTargetCents =
    targetPayoutReductionCents - currentNetPayoutReductionCents;
  if (deltaToTargetCents !== 0) {
    throw new Error("Refund allocation failed to converge to the payout target");
  }

  return {
    cumulativeRefundCents: cappedRefundCents,
    buyerChargeAllocation,
    sellerAllocation: {
      ...sellerAllocation,
      netPayoutReductionCents: currentNetPayoutReductionCents,
    },
  };
}

function diffRefundAllocationSnapshots(
  previous: RefundAllocationSnapshot,
  current: RefundAllocationSnapshot,
): RefundAllocationSnapshot {
  return {
    cumulativeRefundCents:
      current.cumulativeRefundCents - previous.cumulativeRefundCents,
    buyerChargeAllocation: {
      subtotal:
        current.buyerChargeAllocation.subtotal -
        previous.buyerChargeAllocation.subtotal,
      buyerFee:
        current.buyerChargeAllocation.buyerFee -
        previous.buyerChargeAllocation.buyerFee,
      buyerFreightCharge:
        current.buyerChargeAllocation.buyerFreightCharge -
        previous.buyerChargeAllocation.buyerFreightCharge,
    },
    sellerAllocation: {
      subtotalRecovery:
        current.sellerAllocation.subtotalRecovery -
        previous.sellerAllocation.subtotalRecovery,
      sellerFeeRelief:
        current.sellerAllocation.sellerFeeRelief -
        previous.sellerAllocation.sellerFeeRelief,
      sellerStripeFeeRelief:
        current.sellerAllocation.sellerStripeFeeRelief -
        previous.sellerAllocation.sellerStripeFeeRelief,
      sellerFreightRelief:
        current.sellerAllocation.sellerFreightRelief -
        previous.sellerAllocation.sellerFreightRelief,
      netPayoutReductionCents:
        current.sellerAllocation.netPayoutReductionCents -
        previous.sellerAllocation.netPayoutReductionCents,
    },
  };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function buildRefundAllocationAuditNote(params: {
  previous: RefundAllocationSnapshot;
  current: RefundAllocationSnapshot;
}): string | undefined {
  if (
    params.current.sellerAllocation.sellerFreightRelief <= 0 &&
    params.previous.sellerAllocation.sellerFreightRelief <= 0
  ) {
    return undefined;
  }

  const delta = diffRefundAllocationSnapshots(params.previous, params.current);

  return [
    "Allocation",
    `buyer subtotal ${formatCents(delta.buyerChargeAllocation.subtotal)}`,
    `buyer fee ${formatCents(delta.buyerChargeAllocation.buyerFee)}`,
    `buyer freight ${formatCents(delta.buyerChargeAllocation.buyerFreightCharge)}`,
    `seller payout reversal ${formatCents(delta.sellerAllocation.netPayoutReductionCents)}`,
    `seller fee relief ${formatCents(delta.sellerAllocation.sellerFeeRelief)}`,
    `seller processing relief ${formatCents(delta.sellerAllocation.sellerStripeFeeRelief)}`,
    `seller freight relief ${formatCents(delta.sellerAllocation.sellerFreightRelief)}`,
  ].join("; ");
}

function calculateRemainingSellerPayout(params: {
  currentSellerPayout: number;
  remainingChargeCents: number;
  refundDeltaCents: number;
  transferAmountCents?: number;
  targetReversalCents?: number;
}): number {
  if (
    params.transferAmountCents !== undefined &&
    params.targetReversalCents !== undefined
  ) {
    return Math.max(
      0,
      (params.transferAmountCents - params.targetReversalCents) / 100,
    );
  }

  if (params.refundDeltaCents >= params.remainingChargeCents) return 0;
  const reduction =
    params.currentSellerPayout *
    (params.refundDeltaCents / params.remainingChargeCents);
  return Math.max(
    0,
    Math.round((params.currentSellerPayout - reduction) * 100) / 100,
  );
}

function calculateExpectedOriginalPayoutCents(order: LockedRefundOrder): number {
  return Math.max(
    0,
    Math.round(Number(order.subtotal) * 100) -
      Math.round(Number(order.sellerFee) * 100) -
      Math.round(Number(order.sellerStripeFee) * 100) -
      Math.round(Number(order.sellerFreightContribution) * 100),
  );
}

function extractPaymentIntentSourceChargeId(
  paymentIntent: Stripe.PaymentIntent,
): string | undefined {
  return typeof paymentIntent.latest_charge === "string"
    ? paymentIntent.latest_charge
    : paymentIntent.latest_charge?.id;
}

async function retrieveValidatedOrderPaymentIntent(params: {
  order: LockedRefundOrder;
  fullAmountCents: number;
}): Promise<Stripe.PaymentIntent | undefined> {
  if (!params.order.stripePaymentIntentId) return undefined;

  const paymentIntent = await stripe.paymentIntents.retrieve(
    params.order.stripePaymentIntentId,
  );
  if (
    paymentIntent.metadata.orderId !== params.order.id ||
    paymentIntent.amount !== params.fullAmountCents ||
    paymentIntent.currency.toLowerCase() !== "usd"
  ) {
    throw new Error(
      `Stored PaymentIntent does not match order ${params.order.id}`,
    );
  }

  return paymentIntent;
}

function validateTransferForOrder(params: {
  order: LockedRefundOrder;
  transfer: Stripe.Transfer;
  expectedSourceChargeId?: string;
}): Stripe.Transfer {
  const { order, transfer, expectedSourceChargeId } = params;
  const transferSourceTransaction =
    typeof transfer.source_transaction === "string"
      ? transfer.source_transaction
      : transfer.source_transaction?.id;
  const expectedOriginalPayoutCents = calculateExpectedOriginalPayoutCents(order);
  const locallyReversedAmountCents = Math.max(
    0,
    Math.round(Number(order.transferReversedAmount) * 100),
  );

  if (
    !order.sellerStripeAccountId ||
    transfer.metadata.orderId !== order.id ||
    transfer.currency.toLowerCase() !== "usd" ||
    transfer.amount !== expectedOriginalPayoutCents ||
    transfer.amount_reversed < locallyReversedAmountCents ||
    transfer.amount_reversed < 0 ||
    transfer.amount_reversed > transfer.amount ||
    transfer.destination !== order.sellerStripeAccountId ||
    transfer.transfer_group !== `order_${order.id}` ||
    (expectedSourceChargeId !== undefined &&
      transferSourceTransaction !== expectedSourceChargeId)
  ) {
    throw new Error(
      `Stored seller transfer does not match order ${order.id}`,
    );
  }

  return transfer;
}

async function resolveSeparateTransfer(
  order: LockedRefundOrder,
  expectedSourceChargeId?: string,
): Promise<Stripe.Transfer | undefined> {
  let transfer: Stripe.Transfer | undefined;
  if (order.stripeTransferId) {
    transfer = await stripe.transfers.retrieve(order.stripeTransferId);
  } else {
    // A transfer can be committed by Stripe while the payout transaction that
    // persists its ID rolls back. Recover that orphan by the same stable group
    // and metadata used by payout creation before assuming no seller funds
    // were released.
    transfer = await findStripeTransferForOrder({
      stripe,
      orderId: order.id,
      orderCreatedAt: order.createdAt,
      destination: order.sellerStripeAccountId ?? undefined,
    });
  }

  if (!transfer) return undefined;
  return validateTransferForOrder({
    order,
    transfer,
    expectedSourceChargeId,
  });
}

async function reverseSeparateTransfer(params: {
  order: LockedRefundOrder;
  fullAmountCents: number;
  cumulativeRecoveryCents: number;
  resolvedTransfer?: Stripe.Transfer;
  expectedSourceChargeId?: string;
}): Promise<{
  transferId?: string;
  reversalId?: string;
  reversedAmountCents: number;
  transferAmountCents?: number;
}> {
  const transfer =
    params.resolvedTransfer ??
    (await resolveSeparateTransfer(
      params.order,
      params.expectedSourceChargeId,
    ));

  if (!transfer) {
    return {
      reversalId: params.order.stripeTransferReversalId ?? undefined,
      reversedAmountCents: Math.round(
        Number(params.order.transferReversedAmount) * 100,
      ),
    };
  }
  const targetReversalCents =
    Number(params.order.sellerFreightContribution) > 0
      ? calculateRefundAllocationSnapshot({
          subtotalCents: Math.round(Number(params.order.subtotal) * 100),
          buyerFeeCents: Math.round(Number(params.order.buyerFee) * 100),
          buyerFreightChargeCents: Math.round(
            Number(params.order.buyerFreightCharge) * 100,
          ),
          sellerFeeCents: Math.round(Number(params.order.sellerFee) * 100),
          sellerStripeFeeCents: Math.round(
            Number(params.order.sellerStripeFee) * 100,
          ),
          sellerFreightContributionCents: Math.round(
            Number(params.order.sellerFreightContribution) * 100,
          ),
          totalChargeCents: params.fullAmountCents,
          sellerPayoutCents: transfer.amount,
          cumulativeRefundCents: params.cumulativeRecoveryCents,
        }).sellerAllocation.netPayoutReductionCents
      : calculateTargetTransferReversalCents({
          transferAmountCents: transfer.amount,
          totalChargeCents: params.fullAmountCents,
          cumulativeRecoveryCents: params.cumulativeRecoveryCents,
        });
  const alreadyReversedCents = transfer.amount_reversed;
  const reversalDeltaCents = Math.max(
    0,
    targetReversalCents - alreadyReversedCents,
  );

  if (reversalDeltaCents === 0) {
    return {
      transferId: transfer.id,
      reversalId:
        params.order.stripeTransferReversalId ??
        transfer.reversals.data[0]?.id,
      reversedAmountCents: alreadyReversedCents,
      transferAmountCents: transfer.amount,
    };
  }

  const reversal = await stripe.transfers.createReversal(
    transfer.id,
    {
      amount: reversalDeltaCents,
      metadata: {
        orderId: params.order.id,
        orderNumber: params.order.orderNumber,
        cumulativeRecoveryCents: String(params.cumulativeRecoveryCents),
      },
    },
    {
      idempotencyKey: `order-transfer-reversal:${params.order.id}:${targetReversalCents}`,
    },
  );

  return {
    transferId: transfer.id,
    reversalId: reversal.id,
    reversedAmountCents: alreadyReversedCents + reversal.amount,
    transferAmountCents: transfer.amount,
  };
}

async function lockRefundOrder(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  orderId: string,
): Promise<LockedRefundOrder> {
  const [order] = await tx
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      createdAt: orders.createdAt,
      buyerId: orders.buyerId,
      sellerId: orders.sellerId,
      subtotal: orders.subtotal,
      buyerFee: orders.buyerFee,
      sellerFee: orders.sellerFee,
      buyerFreightCharge: orders.buyerFreightCharge,
      sellerStripeFee: orders.sellerStripeFee,
      totalPrice: orders.totalPrice,
      sellerPayout: orders.sellerPayout,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      escrowStatus: orders.escrowStatus,
      stripePaymentIntentId: orders.stripePaymentIntentId,
      stripeTransferId: orders.stripeTransferId,
      stripeTransferReversalId: orders.stripeTransferReversalId,
      transferReversedAmount: orders.transferReversedAmount,
      refundedAmount: orders.refundedAmount,
      sellerFreightContribution: orders.sellerFreightContribution,
      taxLiability: orders.taxLiability,
      taxReversalStatus: orders.taxReversalStatus,
      notes: orders.notes,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update");

  if (!order) throw new Error(`Order ${orderId} not found`);
  const [seller] = await tx
    .select({ stripeAccountId: users.stripeAccountId })
    .from(users)
    .where(eq(users.id, order.sellerId));

  return {
    ...order,
    sellerStripeAccountId: seller?.stripeAccountId ?? null,
  };
}

async function lockStripeDisputeForOrder(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  orderId: string,
): Promise<LockedStripeDispute | null> {
  const [dispute] = await tx
    .select({
      id: disputes.id,
      status: disputes.status,
      source: disputes.source,
    })
    .from(disputes)
    .where(eq(disputes.orderId, orderId))
    .for("update");

  if (!dispute || dispute.source !== "stripe") {
    return null;
  }

  return dispute;
}

function getRefundBlockReason(
  dispute: LockedStripeDispute | null,
): string | null {
  if (!dispute) return null;
  if (dispute.status === "resolved_seller") return null;
  if (dispute.status === "resolved_buyer") {
    return "Manual refunds are blocked because Stripe already closed the chargeback against the platform.";
  }
  if (dispute.status === "closed") {
    return "Manual refunds are blocked until the closed Stripe dispute is reconciled.";
  }
  return "Manual refunds are blocked while a Stripe dispute is still open.";
}

async function persistRefundAttemptState(params: {
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0];
  order: LockedRefundOrder;
  stripeRefundId: string;
  refundAmountCents: number;
  providerStatus: string | null;
  state: Exclude<OrderRefundState, "succeeded">;
  reason?: string;
}): Promise<void> {
  await params.tx
    .update(orders)
    .set({
      paymentStatus: params.state,
      stripeRefundId: params.stripeRefundId,
      notes: sql`concat_ws(E'\n', nullif(${orders.notes}, ''), ${formatRefundAttemptSummary({
        state: params.state,
        stripeRefundId: params.stripeRefundId,
        refundAmountCents: params.refundAmountCents,
        providerStatus: params.providerStatus,
        reason: params.reason,
      })})`,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, params.order.id));
}

async function persistRefundState(params: {
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0];
  order: LockedRefundOrder;
  cumulativeRefundCents: number;
  refundDeltaCents: number;
  stripeRefundId: string;
  reason?: string;
  transferId?: string;
  transferReversalId?: string;
  transferReversedAmountCents: number;
  transferAmountCents?: number;
  escrowStatusOverride?: string;
  allowInventoryRelease?: boolean;
  preserveSellerPayout?: boolean;
  allocationAuditNote?: string;
}): Promise<void> {
  const fullAmountCents = Math.round(Number(params.order.totalPrice) * 100);
  const previousRefundedCents = Math.round(
    Number(params.order.refundedAmount ?? 0) * 100,
  );
  const remainingChargeCents = Math.max(
    0,
    fullAmountCents - previousRefundedCents,
  );
  const isFullRefund = params.cumulativeRefundCents >= fullAmountCents;
  const hasReleasedTransfer = Boolean(
    params.transferId ?? params.order.stripeTransferId,
  );
  const newSellerPayout = params.preserveSellerPayout
    ? Number(params.order.sellerPayout)
    : calculateRemainingSellerPayout({
        currentSellerPayout: Number(params.order.sellerPayout),
        remainingChargeCents,
        refundDeltaCents: params.refundDeltaCents,
        transferAmountCents: params.transferAmountCents,
        targetReversalCents:
          params.transferAmountCents === undefined
            ? undefined
            : params.transferReversedAmountCents,
      });
  const refundAmountFormatted = `$${(params.refundDeltaCents / 100).toFixed(2)}`;
  const auditNote = `[Refund ${params.stripeRefundId}: ${refundAmountFormatted}; cumulative $${(params.cumulativeRefundCents / 100).toFixed(2)}${params.transferReversalId ? `; transfer reversal ${params.transferReversalId}` : ""}${params.allocationAuditNote ? `; ${params.allocationAuditNote}` : ""}]`;

  await params.tx
    .update(orders)
    .set({
      paymentStatus: isFullRefund ? "refunded" : "partially_refunded",
      status: isFullRefund ? "refunded" : params.order.status,
      escrowStatus:
        params.escrowStatusOverride ??
        (isFullRefund
          ? "refunded"
          : hasReleasedTransfer
            ? "released"
            : params.order.escrowStatus),
      sellerPayout: newSellerPayout,
      refundedAt: new Date(),
      refundedAmount: params.cumulativeRefundCents / 100,
      stripeRefundId: params.stripeRefundId,
      stripeTransferId: params.transferId ?? params.order.stripeTransferId,
      stripeTransferReversalId:
        params.transferReversalId ?? params.order.stripeTransferReversalId,
      transferReversedAmount: params.transferReversedAmountCents / 100,
      taxReversalStatus:
        params.order.taxLiability === "platform"
          ? "pending"
          : params.order.taxReversalStatus,
      notes: params.order.notes
        ? `${params.order.notes}\n${auditNote}`
        : auditNote,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, params.order.id));

  if (
    params.allowInventoryRelease !== false &&
    shouldReleaseInventoryOnRefund({
      orderStatus: params.order.status,
      isFullRefund,
    })
  ) {
    await releaseReservedInventory({
      db: params.tx,
      orderId: params.order.id,
      reason: "full_refund_before_shipment",
    });
  }

  await params.tx.insert(notifications).values([
    {
      userId: params.order.buyerId,
      type: "system" as const,
      title: "Refund Processed",
      message: `A ${isFullRefund ? "full" : "partial"} refund of ${refundAmountFormatted} has been issued for order ${params.order.orderNumber}.${params.reason ? ` Reason: ${params.reason}` : ""}`,
      data: { orderId: params.order.id },
      read: false,
    },
    {
      userId: params.order.sellerId,
      type: "system" as const,
      title: "Order Refunded",
      message: `A ${isFullRefund ? "full" : "partial"} refund of ${refundAmountFormatted} has been issued for order ${params.order.orderNumber}.${params.reason ? ` Reason: ${params.reason}` : ""}`,
      data: { orderId: params.order.id },
      read: false,
    },
  ]);
}

/**
 * Issue an idempotent order refund and reverse the separate Connect transfer.
 * Partial recovery is automatic only when buyer and seller economics share the
 * same allocation basis; seller-funded freight requires explicit allocation.
 * The row lock serializes this with payout release, while Stripe idempotency
 * plus transfer reconciliation make provider-side retries safe.
 */
export async function processOrderRefund({
  db,
  orderId,
  amountCents,
  reason,
  adminAlert,
}: ProcessOrderRefundParams): Promise<RefundResult> {
  try {
    const result = await db.transaction(async (tx) => {
    const order = await lockRefundOrder(tx, orderId);
    const blockingDispute = await lockStripeDisputeForOrder(tx, orderId);
    const refundBlockReason = getRefundBlockReason(blockingDispute);
    if (refundBlockReason) {
      throw new Error(refundBlockReason);
    }

    if (!order.stripePaymentIntentId) {
      throw new Error(`Order ${orderId} has no payment intent — cannot refund`);
    }
    if (
      order.paymentStatus !== "succeeded" &&
      order.paymentStatus !== "partially_refunded"
    ) {
      throw new Error(
        `Order ${orderId} payment status is "${order.paymentStatus}" — cannot refund`,
      );
    }

    const fullAmountCents = Math.round(Number(order.totalPrice) * 100);
    const paymentIntent = await retrieveValidatedOrderPaymentIntent({
      order,
      fullAmountCents,
    });
    if (!paymentIntent) {
      throw new Error(`Order ${orderId} has no payment intent — cannot refund`);
    }
    const expectedSourceChargeId =
      extractPaymentIntentSourceChargeId(paymentIntent);
    const alreadyRefundedCents = Math.round(
      Number(order.refundedAmount ?? 0) * 100,
    );
    const remainingAmountCents = fullAmountCents - alreadyRefundedCents;
    const refundAmountCents = amountCents ?? remainingAmountCents;
    if (refundAmountCents <= 0 || refundAmountCents > remainingAmountCents) {
      throw new Error(
        `Refund amount must be between 1 and ${remainingAmountCents} cents`,
      );
    }

    const cumulativeRefundCents =
      alreadyRefundedCents + refundAmountCents;
    const isFullRefund = cumulativeRefundCents >= fullAmountCents;
    // Resolve and validate a provider-committed transfer while the order row is
    // still locked. A payout transaction can roll back after Stripe creates the
    // transfer, leaving no local transfer ID even though seller funds moved.
    const resolvedTransfer =
      !isFullRefund ||
      order.stripeTransferId ||
      order.escrowStatus === "released"
        ? await resolveSeparateTransfer(order, expectedSourceChargeId)
        : undefined;
    if (
      !isFullRefund &&
      !canIssuePartialOrderRefund({
        stripeTransferId: resolvedTransfer?.id ?? order.stripeTransferId,
      })
    ) {
      throw new Error(
        "Partial refunds are not supported before seller payout. Issue a full cancellation/refund instead.",
      );
    }
    let reversal: {
      transferId?: string;
      reversalId?: string;
      reversedAmountCents: number;
      transferAmountCents?: number;
    } = {
      transferId: resolvedTransfer?.id ?? order.stripeTransferId ?? undefined,
      reversalId: order.stripeTransferReversalId ?? undefined,
      reversedAmountCents: Math.round(
        Number(order.transferReversedAmount) * 100,
      ),
      transferAmountCents: resolvedTransfer
        ? resolvedTransfer.amount
        : undefined,
    };
    const shouldReverseBeforeRefund = Boolean(
      resolvedTransfer?.id ||
        order.stripeTransferId ||
        order.escrowStatus === "released",
    );
    if (shouldReverseBeforeRefund) {
      reversal = await reverseSeparateTransfer({
        order,
        fullAmountCents,
        cumulativeRecoveryCents: cumulativeRefundCents,
        resolvedTransfer,
        expectedSourceChargeId,
      });
    }
    const refund = await stripe.refunds.create(
      {
        payment_intent: order.stripePaymentIntentId,
        amount: refundAmountCents,
        reason: "requested_by_customer",
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          cumulativeRefundCents: String(cumulativeRefundCents),
        },
      },
      {
        idempotencyKey: `order-refund:${order.id}:${cumulativeRefundCents}`,
      },
    );

    const providerStatus = normalizeStripeRefundStatus(refund.status);
    const state = mapRefundStateFromStripeStatus(providerStatus);
    if (state !== "succeeded") {
      await persistRefundAttemptState({
        tx,
        order,
        stripeRefundId: refund.id,
        refundAmountCents,
        providerStatus,
        state,
        reason,
      });

      return {
        refundId: refund.id,
        amountRefunded: refundAmountCents / 100,
        state,
        providerStatus,
      };
    }

    if (
      isFullRefund &&
      order.status !== "delivered" &&
      order.status !== "refunded"
    ) {
      await cancelPriority1ShipmentForOrder(order.id, tx);
    }

    if (!shouldReverseBeforeRefund) {
      reversal = await reverseSeparateTransfer({
        order,
        fullAmountCents,
        cumulativeRecoveryCents: cumulativeRefundCents,
        resolvedTransfer,
        expectedSourceChargeId,
      });
    }
    const allocationAuditNote =
      Number(order.sellerFreightContribution) > 0 &&
      reversal.transferAmountCents !== undefined
        ? buildRefundAllocationAuditNote({
            previous: calculateRefundAllocationSnapshot({
              subtotalCents: Math.round(Number(order.subtotal) * 100),
              buyerFeeCents: Math.round(Number(order.buyerFee) * 100),
              buyerFreightChargeCents: Math.round(
                Number(order.buyerFreightCharge) * 100,
              ),
              sellerFeeCents: Math.round(Number(order.sellerFee) * 100),
              sellerStripeFeeCents: Math.round(
                Number(order.sellerStripeFee) * 100,
              ),
              sellerFreightContributionCents: Math.round(
                Number(order.sellerFreightContribution) * 100,
              ),
              totalChargeCents: fullAmountCents,
              sellerPayoutCents: reversal.transferAmountCents,
              cumulativeRefundCents: alreadyRefundedCents,
            }),
            current: calculateRefundAllocationSnapshot({
              subtotalCents: Math.round(Number(order.subtotal) * 100),
              buyerFeeCents: Math.round(Number(order.buyerFee) * 100),
              buyerFreightChargeCents: Math.round(
                Number(order.buyerFreightCharge) * 100,
              ),
              sellerFeeCents: Math.round(Number(order.sellerFee) * 100),
              sellerStripeFeeCents: Math.round(
                Number(order.sellerStripeFee) * 100,
              ),
              sellerFreightContributionCents: Math.round(
                Number(order.sellerFreightContribution) * 100,
              ),
              totalChargeCents: fullAmountCents,
              sellerPayoutCents: reversal.transferAmountCents,
              cumulativeRefundCents,
            }),
          })
        : undefined;
    await persistRefundState({
      tx,
      order,
      cumulativeRefundCents,
      refundDeltaCents: refundAmountCents,
      stripeRefundId: refund.id,
      reason,
      transferId: reversal.transferId,
      transferReversalId: reversal.reversalId,
      transferReversedAmountCents: reversal.reversedAmountCents,
      transferAmountCents: reversal.transferAmountCents,
      allocationAuditNote,
    });

    if (adminAlert) {
      const adminUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"));
      if (adminUsers.length > 0) {
        await tx.insert(notifications).values(
          adminUsers.map((admin) => ({
            userId: admin.id,
            type: "system" as const,
            title: adminAlert.title,
            message: adminAlert.message,
            data: { orderId: order.id },
            read: false,
          })),
        );
      }
    }

    return {
      refundId: refund.id,
      amountRefunded: refundAmountCents / 100,
      transferReversalId: reversal.reversalId,
      state,
      providerStatus,
    };
    });
    if (result.state === "succeeded") {
      await resolveReconciliationCaseByKey(db, {
        caseKey: `refund-failure:${orderId}`,
        resolution:
          "Stripe accepted the refund and all local refund allocation state was persisted.",
        details: {
          refundId: result.refundId,
          amountRefunded: result.amountRefunded,
        },
      });
      await resolveReconciliationCaseByKey(db, {
        caseKey: `refund-reconciliation:${orderId}`,
        resolution:
          "Stripe reported the refund as succeeded and local refund state was fully reconciled.",
        details: {
          refundId: result.refundId,
          providerStatus: result.providerStatus,
        },
      });
    } else if (result.state === "reconciliation_required") {
      await openReconciliationCase(db, {
        caseKey: `refund-reconciliation:${orderId}`,
        type: "refund_failure",
        source: "stripe",
        severity: "critical",
        title: "Stripe refund requires operator reconciliation",
        summary:
          "Stripe did not return a succeeded refund state, so buyer confirmation and downstream money movement remain blocked pending review.",
        orderId,
        externalReference: result.refundId,
        amountCents: Math.round(result.amountRefunded * 100),
        details: {
          providerStatus: result.providerStatus,
        },
      });
    }
    return result;
  } catch (error) {
    if (error instanceof ShipmentCancellationError) {
      await db
        .update(shipments)
        .set({ lastError: error.message, updatedAt: new Date() })
        .where(eq(shipments.orderId, orderId));
    }
    await openReconciliationCase(db, {
      caseKey: `refund-failure:${orderId}`,
      type: "refund_failure",
      source: "stripe",
      severity: "critical",
      title: "Order refund failed",
      summary:
        error instanceof Error ? error.message : "Unknown refund failure",
      orderId,
      details: {
        requestedAmountCents: amountCents ?? null,
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
    });
    throw error;
  }
}

async function resolveOrderIdForStripeRefund(
  db: Database,
  refund: Pick<Stripe.Refund, "id" | "metadata" | "payment_intent">,
): Promise<{
  orderId: string | null;
  metadataOrderId: string | null;
  paymentIntentId: string | null;
  mismatchSummary?: string;
}> {
  const metadataOrderId =
    typeof refund.metadata?.orderId === "string" && refund.metadata.orderId.length > 0
      ? refund.metadata.orderId
      : null;
  const paymentIntentId =
    typeof refund.payment_intent === "string"
      ? refund.payment_intent
      : refund.payment_intent?.id ?? null;

  if (metadataOrderId) {
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, metadataOrderId),
      columns: {
        id: true,
        stripePaymentIntentId: true,
      },
    });
    if (!order) {
      return {
        orderId: null,
        metadataOrderId,
        paymentIntentId,
        mismatchSummary:
          "Stripe refund metadata references an order that no longer exists locally.",
      };
    }
    if (
      !paymentIntentId ||
      !order.stripePaymentIntentId ||
      order.stripePaymentIntentId !== paymentIntentId
    ) {
      return {
        orderId: null,
        metadataOrderId,
        paymentIntentId,
        mismatchSummary:
          "Stripe refund metadata.orderId does not match the order tied to this refund payment intent.",
      };
    }
    return {
      orderId: order.id,
      metadataOrderId,
      paymentIntentId,
    };
  }

  if (!paymentIntentId) {
    return {
      orderId: null,
      metadataOrderId,
      paymentIntentId: null,
    };
  }

  const order = await db.query.orders.findFirst({
    where: eq(orders.stripePaymentIntentId, paymentIntentId),
    columns: { id: true },
  });

  return {
    orderId: order?.id ?? null,
    metadataOrderId,
    paymentIntentId,
  };
}

async function readAuthoritativeRefundedAmountCents(
  refund: Pick<Stripe.Refund, "amount" | "charge" | "metadata">,
): Promise<number> {
  const charge =
    typeof refund.charge === "string"
      ? await stripe.charges.retrieve(refund.charge)
      : refund.charge;
  if (charge && Number.isFinite(charge.amount_refunded)) {
    return charge.amount_refunded;
  }

  const metadataCumulativeRefundCents = Number.parseInt(
    String(refund.metadata?.cumulativeRefundCents ?? ""),
    10,
  );
  if (Number.isFinite(metadataCumulativeRefundCents)) {
    return metadataCumulativeRefundCents;
  }

  return refund.amount;
}

export async function reconcileOrderRefundLifecycleFromStripe(params: {
  db: Database;
  refund: Stripe.Refund;
  reason?: string;
}): Promise<{
  orderId: string | null;
  state: OrderRefundState | "ignored";
  updated: boolean;
}> {
  const resolvedRefundOrder = await resolveOrderIdForStripeRefund(
    params.db,
    params.refund,
  );
  const orderId = resolvedRefundOrder.orderId;
  if (!orderId) {
    await openReconciliationCase(params.db, {
      caseKey: resolvedRefundOrder.mismatchSummary
        ? `refund-mismatch:${params.refund.id}`
        : `refund-unmatched:${params.refund.id}`,
      type: "payment_mismatch",
      source: "stripe",
      severity: "critical",
      title: resolvedRefundOrder.mismatchSummary
        ? "Stripe refund metadata does not match the stored payment intent"
        : "Stripe refund is not mapped to a local order",
      summary:
        resolvedRefundOrder.mismatchSummary ??
        "Stripe reported a refund lifecycle update that could not be matched to an order by metadata or payment intent.",
      externalReference: params.refund.id,
      amountCents: params.refund.amount,
      details: {
        metadataOrderId: resolvedRefundOrder.metadataOrderId,
        paymentIntentId: resolvedRefundOrder.paymentIntentId,
        providerStatus: normalizeStripeRefundStatus(params.refund.status),
      },
    });
    return { orderId: null, state: "ignored", updated: false };
  }

  const providerStatus = normalizeStripeRefundStatus(params.refund.status);
  const state = mapRefundStateFromStripeStatus(providerStatus);
  if (state === "succeeded") {
    const refundedAmountCents = await readAuthoritativeRefundedAmountCents(
      params.refund,
    );
    const reconciliation = await reconcileOrderRefundFromStripe({
      db: params.db,
      orderId,
      refundedAmountCents,
      stripeRefundId: params.refund.id,
      reason: params.reason,
    });
    return { orderId, state, updated: reconciliation.updated };
  }

  const updated = await params.db.transaction(async (tx) => {
    const order = await lockRefundOrder(tx, orderId);
    if (
      order.paymentStatus === "refunded" ||
      order.paymentStatus === "partially_refunded" ||
      order.paymentStatus === "reconciliation_required"
    ) {
      return false;
    }

    await persistRefundAttemptState({
      tx,
      order,
      stripeRefundId: params.refund.id,
      refundAmountCents: params.refund.amount,
      providerStatus,
      state,
      reason: params.reason,
    });
    return true;
  });

  if (state === "reconciliation_required") {
    await openReconciliationCase(params.db, {
      caseKey: `refund-reconciliation:${orderId}`,
      type: "refund_failure",
      source: "stripe",
      severity: "critical",
      title: "Stripe refund requires operator reconciliation",
      summary:
        "Stripe reported a non-succeeded refund state, so buyer confirmation and downstream refund effects remain blocked pending review.",
      orderId,
      externalReference: params.refund.id,
      amountCents: params.refund.amount,
      details: {
        providerStatus,
      },
    });
  }

  return { orderId, state, updated };
}

/** Reconcile refunds initiated outside the application (for example Dashboard). */
export async function reconcileOrderRefundFromStripe({
  db,
  orderId,
  refundedAmountCents,
  stripeRefundId,
  reason,
}: ReconcileOrderRefundParams): Promise<{
  updated: boolean;
  manualReviewRequired?: boolean;
  manualAllocationRequired?: boolean;
  manualReviewReason?: string;
}> {
  const result = await db.transaction(async (tx) => {
    const order = await lockRefundOrder(tx, orderId);
    const fullAmountCents = Math.round(Number(order.totalPrice) * 100);
    const alreadyRefundedCents = Math.round(
      Number(order.refundedAmount ?? 0) * 100,
    );
    const targetRefundedCents = Math.min(
      fullAmountCents,
      refundedAmountCents,
    );
    if (targetRefundedCents <= alreadyRefundedCents) {
      return { updated: false };
    }

    const refundDeltaCents = targetRefundedCents - alreadyRefundedCents;
    const isFullRefund = targetRefundedCents >= fullAmountCents;
    let manualReviewReason: string | null = null;
    let freightCancellationFailed = false;
    let transferReversalFailed = false;
    if (
      isFullRefund &&
      order.status !== "delivered" &&
      order.status !== "refunded"
    ) {
      try {
        await cancelPriority1ShipmentForOrder(order.id, tx);
      } catch (error) {
        freightCancellationFailed = true;
        manualReviewReason = `Stripe refund is recorded, but freight cancellation failed: ${
          error instanceof Error ? error.message : "Unknown cancellation error"
        }`;
      }
    }

    let reversal: {
      transferId?: string;
      reversalId?: string;
      reversedAmountCents: number;
      transferAmountCents?: number;
    } = {
      transferId: order.stripeTransferId ?? undefined,
      reversalId: order.stripeTransferReversalId ?? undefined,
      reversedAmountCents: Math.round(
        Number(order.transferReversedAmount) * 100,
      ),
    };
    try {
      const paymentIntent = await retrieveValidatedOrderPaymentIntent({
        order,
        fullAmountCents,
      });
      reversal = await reverseSeparateTransfer({
        order,
        fullAmountCents,
        cumulativeRecoveryCents: targetRefundedCents,
        expectedSourceChargeId: paymentIntent
          ? extractPaymentIntentSourceChargeId(paymentIntent)
          : undefined,
      });
    } catch (error) {
      transferReversalFailed = true;
      const reversalFailure = `Stripe refund is recorded, but seller transfer reversal failed: ${
        error instanceof Error ? error.message : "Unknown reversal error"
      }`;
      manualReviewReason = manualReviewReason
        ? `${manualReviewReason}; ${reversalFailure}`
        : reversalFailure;
    }
    if (!isFullRefund && reversal.transferAmountCents === undefined) {
      manualReviewReason = manualReviewReason
        ? `${manualReviewReason}; Stripe recorded a partial refund before seller payout. The remaining payout requires manual reconciliation.`
        : "Stripe recorded a partial refund before seller payout. The remaining payout requires manual reconciliation.";
    }
    const allocationAuditNote =
      Number(order.sellerFreightContribution) > 0 &&
      reversal.transferAmountCents !== undefined
        ? buildRefundAllocationAuditNote({
            previous: calculateRefundAllocationSnapshot({
              subtotalCents: Math.round(Number(order.subtotal) * 100),
              buyerFeeCents: Math.round(Number(order.buyerFee) * 100),
              buyerFreightChargeCents: Math.round(
                Number(order.buyerFreightCharge) * 100,
              ),
              sellerFeeCents: Math.round(Number(order.sellerFee) * 100),
              sellerStripeFeeCents: Math.round(
                Number(order.sellerStripeFee) * 100,
              ),
              sellerFreightContributionCents: Math.round(
                Number(order.sellerFreightContribution) * 100,
              ),
              totalChargeCents: fullAmountCents,
              sellerPayoutCents: reversal.transferAmountCents,
              cumulativeRefundCents: alreadyRefundedCents,
            }),
            current: calculateRefundAllocationSnapshot({
              subtotalCents: Math.round(Number(order.subtotal) * 100),
              buyerFeeCents: Math.round(Number(order.buyerFee) * 100),
              buyerFreightChargeCents: Math.round(
                Number(order.buyerFreightCharge) * 100,
              ),
              sellerFeeCents: Math.round(Number(order.sellerFee) * 100),
              sellerStripeFeeCents: Math.round(
                Number(order.sellerStripeFee) * 100,
              ),
              sellerFreightContributionCents: Math.round(
                Number(order.sellerFreightContribution) * 100,
              ),
              totalChargeCents: fullAmountCents,
              sellerPayoutCents: reversal.transferAmountCents,
              cumulativeRefundCents: targetRefundedCents,
            }),
          })
        : undefined;
    await persistRefundState({
      tx,
      order,
      cumulativeRefundCents: transferReversalFailed
        ? alreadyRefundedCents
        : targetRefundedCents,
      refundDeltaCents: transferReversalFailed ? 0 : refundDeltaCents,
      stripeRefundId: stripeRefundId ?? `external-${targetRefundedCents}`,
      reason,
      transferId: reversal.transferId,
      transferReversalId: reversal.reversalId,
      transferReversedAmountCents: reversal.reversedAmountCents,
      transferAmountCents: reversal.transferAmountCents,
      escrowStatusOverride:
        transferReversalFailed || (!isFullRefund && manualReviewReason)
          ? "disputed"
          : undefined,
      allowInventoryRelease: !freightCancellationFailed,
      allocationAuditNote,
    });

    if (manualReviewReason) {
      const reconciliationNote = `[Manual reconciliation required: ${manualReviewReason}]`;
      await tx
        .update(orders)
        .set({
          notes: sql`concat_ws(E'\n', nullif(${orders.notes}, ''), ${reconciliationNote})`,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      const adminUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"));
      if (adminUsers.length > 0) {
        await tx.insert(notifications).values(
          adminUsers.map((admin) => ({
            userId: admin.id,
            type: "system" as const,
            title: "Refund Fulfillment Reconciliation Required",
            message: `Order ${order.orderNumber}: ${manualReviewReason}`,
            data: { orderId: order.id },
            read: false,
          })),
        );
      }
    }

    return {
      updated: true,
      manualReviewRequired: Boolean(manualReviewReason),
      manualAllocationRequired: false,
      manualReviewReason: manualReviewReason ?? undefined,
    };
  });

  if (result.manualReviewRequired) {
    await openReconciliationCase(db, {
      caseKey: `refund-reconciliation:${orderId}`,
      type: "refund_failure",
      source: "stripe",
      severity: "critical",
      title: "Stripe refund requires fulfillment reconciliation",
      summary:
        result.manualReviewReason ??
        "Stripe refund state could not be fully reconciled.",
      orderId,
      externalReference: stripeRefundId ?? null,
      amountCents: refundedAmountCents,
      details: {
        manualAllocationRequired:
          result.manualAllocationRequired ?? false,
      },
    });
  } else if (result.updated) {
    await resolveReconciliationCaseByKey(db, {
      caseKey: `refund-reconciliation:${orderId}`,
      resolution:
        "Stripe refund, transfer recovery, freight state, and local order state are reconciled.",
      details: {
        stripeRefundId: stripeRefundId ?? null,
        refundedAmountCents,
      },
    });
  }

  return result;
}

/**
 * Recover funds from a seller transfer when Stripe opens a charge dispute.
 * The cumulative target includes prior refunds so refund and dispute events can
 * arrive in either order without over-reversing the transfer. A partial
 * seller-funded-freight recovery is recorded for manual allocation without an
 * automatic transfer reversal.
 */
export async function reverseOrderTransferForDispute(params: {
  db: Database;
  orderId: string;
  stripeDisputeId: string;
  disputedAmountCents: number;
}): Promise<{
  reversalId?: string;
  reversedAmountCents: number;
  manualReviewRequired?: boolean;
  manualAllocationRequired?: boolean;
  manualReviewReason?: string;
}> {
  return params.db.transaction(async (tx) => {
    const order = await lockRefundOrder(tx, params.orderId);
    const fullAmountCents = Math.round(Number(order.totalPrice) * 100);
    const refundedAmountCents = Math.round(
      Number(order.refundedAmount ?? 0) * 100,
    );
    const cumulativeRecoveryCents = Math.min(
      fullAmountCents,
      refundedAmountCents + Math.max(0, params.disputedAmountCents),
    );
    const manualAllocationRequired = requiresManualFreightAllocation({
      sellerFreightContribution: order.sellerFreightContribution,
      cumulativeRecoveryCents,
      fullAmountCents,
    });
    const manualReviewReasons: string[] = [];
    if (manualAllocationRequired) {
      manualReviewReasons.push(
        SELLER_FUNDED_FREIGHT_PARTIAL_RECOVERY_REASON,
      );
    }
    if (order.status !== "delivered" && order.status !== "refunded") {
      try {
        await cancelPriority1ShipmentForOrder(order.id, tx);
      } catch (error) {
        manualReviewReasons.push(
          `Freight cancellation failed: ${
            error instanceof Error ? error.message : "Unknown cancellation error"
          }`,
        );
      }
    }
    let reversal: {
      transferId?: string;
      reversalId?: string;
      reversedAmountCents: number;
      transferAmountCents?: number;
    } = {
      transferId: order.stripeTransferId ?? undefined,
      reversalId: order.stripeTransferReversalId ?? undefined,
      reversedAmountCents: Math.round(
        Number(order.transferReversedAmount) * 100,
      ),
    };
    if (!manualAllocationRequired) {
      try {
        const paymentIntent = await retrieveValidatedOrderPaymentIntent({
          order,
          fullAmountCents,
        });
        reversal = await reverseSeparateTransfer({
          order,
          fullAmountCents,
          cumulativeRecoveryCents,
          expectedSourceChargeId: paymentIntent
            ? extractPaymentIntentSourceChargeId(paymentIntent)
            : undefined,
        });
      } catch (error) {
        manualReviewReasons.push(
          `Seller transfer reversal failed: ${
            error instanceof Error ? error.message : "Unknown reversal error"
          }`,
        );
      }
    }
    const remainingSellerPayout =
      reversal.transferAmountCents === undefined
        ? Number(order.sellerPayout)
        : Math.max(
            0,
            (reversal.transferAmountCents - reversal.reversedAmountCents) / 100,
          );
    const auditNote = `[Stripe dispute ${params.stripeDisputeId}: $${(
      params.disputedAmountCents / 100
    ).toFixed(2)}; cumulative transfer recovery $${(
      reversal.reversedAmountCents / 100
    ).toFixed(2)}${reversal.reversalId ? `; reversal ${reversal.reversalId}` : ""}${
      manualReviewReasons.length > 0
        ? `; MANUAL REVIEW: ${manualReviewReasons.join("; ")}`
        : ""
    }]`;

    await tx
      .update(orders)
      .set({
        escrowStatus: "disputed",
        sellerPayout: remainingSellerPayout,
        stripeTransferId: reversal.transferId ?? order.stripeTransferId,
        stripeTransferReversalId:
          reversal.reversalId ?? order.stripeTransferReversalId,
        transferReversedAmount: reversal.reversedAmountCents / 100,
        notes: order.notes ? `${order.notes}\n${auditNote}` : auditNote,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    if (manualReviewReasons.length > 0) {
      const adminUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"));
      if (adminUsers.length > 0) {
        await tx.insert(notifications).values(
          adminUsers.map((admin) => ({
            userId: admin.id,
            type: "system" as const,
            title: "Dispute Reconciliation Required",
            message: `Order ${order.orderNumber}: ${manualReviewReasons.join("; ")}`,
            data: { orderId: order.id },
            read: false,
          })),
        );
      }
    }

    return {
      reversalId: reversal.reversalId,
      reversedAmountCents: reversal.reversedAmountCents,
      manualReviewRequired: manualReviewReasons.length > 0,
      manualAllocationRequired,
      manualReviewReason:
        manualReviewReasons.length > 0
          ? manualReviewReasons.join("; ")
          : undefined,
    };
  });
}
