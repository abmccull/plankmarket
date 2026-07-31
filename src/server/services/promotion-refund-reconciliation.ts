import { and, eq } from "drizzle-orm";
import { stripe } from "@/lib/stripe";
import { db, type Database } from "@/server/db";
import { listingPromotions, listings } from "@/server/db/schema";
import {
  calculatePromotionCancellationRefundCents,
  calculateProratedPromotionRefundCents,
  getPromotionRefundIdempotencyKey,
  getPromotionRefundRetryAt,
} from "./promotion-refunds";
import { openReconciliationCase } from "./reconciliation-cases";

const MAX_PROMOTION_REFUND_ATTEMPTS = 8;
const MAX_ERROR_LENGTH = 2000;

class PromotionRefundReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromotionRefundReviewError";
  }
}

export class PromotionNotActiveError extends Error {
  constructor() {
    super("This promotion is not active");
    this.name = "PromotionNotActiveError";
  }
}

type PromotionRefundStatus =
  | "not_due"
  | "refund_pending"
  | "refunded"
  | "reconciliation_required";

export interface PromotionExpiryResult {
  promotionId: string;
  expired: boolean;
  refundStatus: PromotionRefundStatus;
  refundAmountCents: number;
  stripeRefundId?: string;
  error?: string;
}

function boundedError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown promotion refund error";
  return message.slice(0, MAX_ERROR_LENGTH);
}

function requiresManualEndDateReview(listing: {
  status: string;
  expiresAt: Date | null;
  soldAt: Date | null;
}): boolean {
  return (
    (listing.status === "sold" && !listing.soldAt) ||
    (listing.status === "expired" && !listing.expiresAt)
  );
}

/**
 * Atomically expires one promotion and records any refund obligation before a
 * provider call occurs. A later retry therefore cannot lose the obligation.
 */
export async function prepareExpiredPromotionRefund(
  promotionId: string,
  now: Date,
  database: Database = db,
): Promise<PromotionExpiryResult | null> {
  return database.transaction(async (tx) => {
    const [promotion] = await tx
      .select()
      .from(listingPromotions)
      .where(eq(listingPromotions.id, promotionId))
      .for("update");
    if (!promotion) return null;

    const [listing] = await tx
      .select({
        id: listings.id,
        status: listings.status,
        expiresAt: listings.expiresAt,
        soldAt: listings.soldAt,
        promotionExpiresAt: listings.promotionExpiresAt,
      })
      .from(listings)
      .where(eq(listings.id, promotion.listingId))
      .for("update");

    const shouldExpire =
      promotion.isActive && promotion.expiresAt.getTime() < now.getTime();
    if (shouldExpire) {
      await tx
        .update(listingPromotions)
        .set({ isActive: false })
        .where(eq(listingPromotions.id, promotion.id));

      // Clear the denormalized fields only when they still represent this
      // promotion. Never erase a newer promotion installed concurrently.
      if (
        listing?.promotionExpiresAt?.getTime() ===
        promotion.expiresAt.getTime()
      ) {
        await tx
          .update(listings)
          .set({
            promotionTier: null,
            promotionExpiresAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(listings.id, listing.id),
              eq(listings.promotionExpiresAt, promotion.expiresAt),
            ),
          );
      }
    }

    if (promotion.paymentStatus === "refunded") {
      return {
        promotionId,
        expired: shouldExpire,
        refundStatus: "refunded",
        refundAmountCents: promotion.refundAmountCents ?? 0,
        stripeRefundId: promotion.stripeRefundId ?? undefined,
      };
    }
    if (promotion.paymentStatus === "reconciliation_required") {
      return {
        promotionId,
        expired: shouldExpire,
        refundStatus: "reconciliation_required",
        refundAmountCents: promotion.refundAmountCents ?? 0,
        error: promotion.refundLastError ?? undefined,
      };
    }
    if (!shouldExpire && promotion.paymentStatus !== "refund_pending") {
      return {
        promotionId,
        expired: false,
        refundStatus: "not_due",
        refundAmountCents: 0,
      };
    }

    if (!listing) {
      const error = "Listing is missing; promotion refund requires manual review";
      await tx
        .update(listingPromotions)
        .set({
          isActive: false,
          paymentStatus: "reconciliation_required",
          refundRequestedAt: promotion.refundRequestedAt ?? now,
          refundLastError: error,
          refundNextAttemptAt: null,
        })
        .where(eq(listingPromotions.id, promotion.id));
      return {
        promotionId,
        expired: shouldExpire,
        refundStatus: "reconciliation_required",
        refundAmountCents: promotion.refundAmountCents ?? 0,
        error,
      };
    }

    if (requiresManualEndDateReview(listing)) {
      const error =
        "Listing terminal status is missing its effective date; promotion refund requires manual review";
      await tx
        .update(listingPromotions)
        .set({
          paymentStatus: "reconciliation_required",
          refundRequestedAt: promotion.refundRequestedAt ?? now,
          refundLastError: error,
          refundNextAttemptAt: null,
        })
        .where(eq(listingPromotions.id, promotion.id));
      return {
        promotionId,
        expired: shouldExpire,
        refundStatus: "reconciliation_required",
        refundAmountCents: promotion.refundAmountCents ?? 0,
        error,
      };
    }

    const refundAmountCents =
      promotion.refundAmountCents ??
      calculateProratedPromotionRefundCents({
        pricePaid: promotion.pricePaid,
        startsAt: promotion.startsAt,
        promotionExpiresAt: promotion.expiresAt,
        listingStatus: listing.status,
        listingExpiresAt: listing.expiresAt,
        listingSoldAt: listing.soldAt,
      });
    if (refundAmountCents <= 0) {
      return {
        promotionId,
        expired: shouldExpire,
        refundStatus: "not_due",
        refundAmountCents: 0,
      };
    }

    const idempotencyKey =
      promotion.refundIdempotencyKey ??
      getPromotionRefundIdempotencyKey(promotion.id);
    if (!promotion.stripePaymentIntentId) {
      const error =
        "Promotion refund has no Stripe PaymentIntent; credit restoration requires manual reconciliation";
      await tx
        .update(listingPromotions)
        .set({
          paymentStatus: "reconciliation_required",
          refundAmountCents,
          refundIdempotencyKey: idempotencyKey,
          refundRequestedAt: promotion.refundRequestedAt ?? now,
          refundLastError: error,
          refundNextAttemptAt: null,
        })
        .where(eq(listingPromotions.id, promotion.id));
      return {
        promotionId,
        expired: shouldExpire,
        refundStatus: "reconciliation_required",
        refundAmountCents,
        error,
      };
    }

    await tx
      .update(listingPromotions)
      .set({
        paymentStatus: "refund_pending",
        refundAmountCents,
        refundIdempotencyKey: idempotencyKey,
        refundRequestedAt: promotion.refundRequestedAt ?? now,
        refundNextAttemptAt: promotion.refundNextAttemptAt ?? now,
        refundLastError: null,
      })
      .where(eq(listingPromotions.id, promotion.id));

    return {
      promotionId,
      expired: shouldExpire,
      refundStatus: "refund_pending",
      refundAmountCents,
    };
  });
}

/**
 * Deactivates a seller/admin-cancelled promotion and records the exact pro-rata
 * obligation before attempting Stripe. Authorization remains at the router;
 * expectedSellerId is rechecked under the row lock to prevent stale reads.
 */
export async function prepareCancelledPromotionRefund(params: {
  promotionId: string;
  cancelledAt: Date;
  expectedSellerId?: string;
  database?: Database;
}): Promise<PromotionExpiryResult | null> {
  const database = params.database ?? db;
  return database.transaction(async (tx) => {
    const [promotion] = await tx
      .select()
      .from(listingPromotions)
      .where(eq(listingPromotions.id, params.promotionId))
      .for("update");
    if (
      !promotion ||
      (params.expectedSellerId &&
        promotion.sellerId !== params.expectedSellerId)
    ) {
      return null;
    }
    if (!promotion.isActive) {
      if (!promotion.cancelledAt) throw new PromotionNotActiveError();
      const refundStatus: PromotionRefundStatus =
        promotion.paymentStatus === "refunded"
          ? "refunded"
          : promotion.paymentStatus === "refund_pending"
            ? "refund_pending"
            : promotion.paymentStatus === "reconciliation_required"
              ? "reconciliation_required"
              : "not_due";
      return {
        promotionId: promotion.id,
        expired: false,
        refundStatus,
        refundAmountCents: promotion.refundAmountCents ?? 0,
        stripeRefundId: promotion.stripeRefundId ?? undefined,
        error: promotion.refundLastError ?? undefined,
      };
    }

    const [listing] = await tx
      .select({
        id: listings.id,
        promotionExpiresAt: listings.promotionExpiresAt,
      })
      .from(listings)
      .where(eq(listings.id, promotion.listingId))
      .for("update");

    await tx
      .update(listingPromotions)
      .set({
        isActive: false,
        cancelledAt: params.cancelledAt,
      })
      .where(eq(listingPromotions.id, promotion.id));

    if (
      listing?.promotionExpiresAt?.getTime() ===
      promotion.expiresAt.getTime()
    ) {
      await tx
        .update(listings)
        .set({
          promotionTier: null,
          promotionExpiresAt: null,
          updatedAt: params.cancelledAt,
        })
        .where(
          and(
            eq(listings.id, listing.id),
            eq(listings.promotionExpiresAt, promotion.expiresAt),
          ),
        );
    }

    if (
      promotion.paymentStatus === "refunded" ||
      promotion.paymentStatus === "reconciliation_required"
    ) {
      return {
        promotionId: promotion.id,
        expired: false,
        refundStatus:
          promotion.paymentStatus === "refunded"
            ? "refunded"
            : "reconciliation_required",
        refundAmountCents: promotion.refundAmountCents ?? 0,
        stripeRefundId: promotion.stripeRefundId ?? undefined,
        error: promotion.refundLastError ?? undefined,
      };
    }

    const refundAmountCents =
      promotion.refundAmountCents ??
      calculatePromotionCancellationRefundCents({
        pricePaid: promotion.pricePaid,
        startsAt: promotion.startsAt,
        promotionExpiresAt: promotion.expiresAt,
        cancelledAt: params.cancelledAt,
      });
    if (refundAmountCents <= 0) {
      return {
        promotionId: promotion.id,
        expired: false,
        refundStatus: "not_due",
        refundAmountCents: 0,
      };
    }

    const idempotencyKey =
      promotion.refundIdempotencyKey ??
      getPromotionRefundIdempotencyKey(promotion.id);
    if (!promotion.stripePaymentIntentId) {
      const error =
        "Promotion refund has no Stripe PaymentIntent; credit restoration requires manual reconciliation";
      await tx
        .update(listingPromotions)
        .set({
          paymentStatus: "reconciliation_required",
          refundAmountCents,
          refundIdempotencyKey: idempotencyKey,
          refundRequestedAt: promotion.refundRequestedAt ?? params.cancelledAt,
          refundLastError: error,
          refundNextAttemptAt: null,
        })
        .where(eq(listingPromotions.id, promotion.id));
      return {
        promotionId: promotion.id,
        expired: false,
        refundStatus: "reconciliation_required",
        refundAmountCents,
        error,
      };
    }

    await tx
      .update(listingPromotions)
      .set({
        paymentStatus: "refund_pending",
        refundAmountCents,
        refundIdempotencyKey: idempotencyKey,
        refundRequestedAt: promotion.refundRequestedAt ?? params.cancelledAt,
        refundNextAttemptAt: params.cancelledAt,
        refundLastError: null,
      })
      .where(eq(listingPromotions.id, promotion.id));

    return {
      promotionId: promotion.id,
      expired: false,
      refundStatus: "refund_pending",
      refundAmountCents,
    };
  });
}

/**
 * Reconciles a recorded Stripe refund obligation while holding the promotion
 * row lock. The Stripe idempotency key makes provider success plus a failed DB
 * commit safe to replay on the next cron run.
 */
export async function attemptPendingPromotionRefund(
  promotionId: string,
  now: Date,
  database: Database = db,
): Promise<PromotionExpiryResult | null> {
  return database.transaction(async (tx) => {
    const [promotion] = await tx
      .select()
      .from(listingPromotions)
      .where(eq(listingPromotions.id, promotionId))
      .for("update");
    if (!promotion) return null;
    if (promotion.paymentStatus === "refunded") {
      return {
        promotionId,
        expired: false,
        refundStatus: "refunded",
        refundAmountCents: promotion.refundAmountCents ?? 0,
        stripeRefundId: promotion.stripeRefundId ?? undefined,
      };
    }
    if (
      promotion.paymentStatus !== "refund_pending" ||
      (promotion.refundNextAttemptAt &&
        promotion.refundNextAttemptAt.getTime() > now.getTime())
    ) {
      return {
        promotionId,
        expired: false,
        refundStatus:
          promotion.paymentStatus === "reconciliation_required"
            ? "reconciliation_required"
            : promotion.paymentStatus === "refund_pending"
              ? "refund_pending"
            : "not_due",
        refundAmountCents: promotion.refundAmountCents ?? 0,
        error: promotion.refundLastError ?? undefined,
      };
    }

    const refundAmountCents = promotion.refundAmountCents ?? 0;
    const attemptCount = promotion.refundAttemptCount + 1;
    const idempotencyKey =
      promotion.refundIdempotencyKey ??
      getPromotionRefundIdempotencyKey(promotion.id);

    if (!promotion.stripePaymentIntentId || refundAmountCents <= 0) {
      const error =
        "Pending promotion refund is missing its PaymentIntent or amount";
      await tx
        .update(listingPromotions)
        .set({
          paymentStatus: "reconciliation_required",
          refundAttemptCount: attemptCount,
          refundLastAttemptAt: now,
          refundLastError: error,
          refundNextAttemptAt: null,
        })
        .where(eq(listingPromotions.id, promotion.id));
      return {
        promotionId,
        expired: false,
        refundStatus: "reconciliation_required",
        refundAmountCents,
        error,
      };
    }

    try {
      let refund;
      if (promotion.stripeRefundId) {
        refund = await stripe.refunds.retrieve(promotion.stripeRefundId);
      } else {
        const paymentIntent = await stripe.paymentIntents.retrieve(
          promotion.stripePaymentIntentId,
        );
        const metadataMatches =
          paymentIntent.metadata.type === "promotion" &&
          paymentIntent.metadata.listingId === promotion.listingId &&
          paymentIntent.metadata.sellerId === promotion.sellerId;
        const creditApplied = Number(paymentIntent.metadata.creditApplied);
        if (
          !metadataMatches ||
          !Number.isFinite(creditApplied) ||
          creditApplied !== 0 ||
          paymentIntent.currency.toLowerCase() !== "usd" ||
          paymentIntent.status !== "succeeded" ||
          paymentIntent.amount_received < refundAmountCents
        ) {
          throw new PromotionRefundReviewError(
            "Stored Stripe PaymentIntent cannot safely satisfy the promotion refund; payment identity, credit allocation, status, currency, or amount did not match",
          );
        }

        refund = await stripe.refunds.create(
          {
            payment_intent: promotion.stripePaymentIntentId,
            amount: refundAmountCents,
            metadata: {
              promotionId: promotion.id,
              listingId: promotion.listingId,
              reason: "listing_ended_before_promotion",
            },
          },
          { idempotencyKey },
        );
      }

      const refundPaymentIntent =
        typeof refund.payment_intent === "string"
          ? refund.payment_intent
          : refund.payment_intent?.id;
      if (
        refundPaymentIntent !== promotion.stripePaymentIntentId ||
        refund.amount !== refundAmountCents
      ) {
        throw new PromotionRefundReviewError(
          "Stripe refund identity or amount does not match the recorded promotion obligation",
        );
      }

      if (refund.status === "succeeded") {
        await tx
          .update(listingPromotions)
          .set({
            paymentStatus: "refunded",
            stripeRefundId: refund.id,
            refundIdempotencyKey: idempotencyKey,
            refundAttemptCount: attemptCount,
            refundLastAttemptAt: now,
            refundNextAttemptAt: null,
            refundLastError: null,
            refundedAt: now,
          })
          .where(eq(listingPromotions.id, promotion.id));
        return {
          promotionId,
          expired: false,
          refundStatus: "refunded",
          refundAmountCents,
          stripeRefundId: refund.id,
        };
      }

      const terminalFailure =
        refund.status === "failed" ||
        refund.status === "canceled" ||
        refund.status === "requires_action" ||
        attemptCount >= MAX_PROMOTION_REFUND_ATTEMPTS;
      const error = `Stripe refund ${refund.id} is ${refund.status ?? "unknown"}`;
      await tx
        .update(listingPromotions)
        .set({
          paymentStatus: terminalFailure
            ? "reconciliation_required"
            : "refund_pending",
          stripeRefundId: refund.id,
          refundIdempotencyKey: idempotencyKey,
          refundAttemptCount: attemptCount,
          refundLastAttemptAt: now,
          refundNextAttemptAt: terminalFailure
            ? null
            : getPromotionRefundRetryAt(attemptCount, now),
          refundLastError: error,
        })
        .where(eq(listingPromotions.id, promotion.id));
      return {
        promotionId,
        expired: false,
        refundStatus: terminalFailure
          ? "reconciliation_required"
          : "refund_pending",
        refundAmountCents,
        stripeRefundId: refund.id,
        error,
      };
    } catch (error) {
      const errorMessage = boundedError(error);
      const requiresReconciliation =
        error instanceof PromotionRefundReviewError ||
        attemptCount >= MAX_PROMOTION_REFUND_ATTEMPTS;
      await tx
        .update(listingPromotions)
        .set({
          paymentStatus: requiresReconciliation
            ? "reconciliation_required"
            : "refund_pending",
          refundIdempotencyKey: idempotencyKey,
          refundAttemptCount: attemptCount,
          refundLastAttemptAt: now,
          refundNextAttemptAt: requiresReconciliation
            ? null
            : getPromotionRefundRetryAt(attemptCount, now),
          refundLastError: errorMessage,
        })
        .where(eq(listingPromotions.id, promotion.id));
      return {
        promotionId,
        expired: false,
        refundStatus: requiresReconciliation
          ? "reconciliation_required"
          : "refund_pending",
        refundAmountCents,
        error: errorMessage,
      };
    }
  });
}

/**
 * Runs the provider attempt for a prepared obligation and guarantees any
 * terminal/manual state is visible in the operator reconciliation queue.
 */
export async function reconcilePromotionRefundResult(
  preparation: PromotionExpiryResult,
  now: Date,
  database: Database = db,
): Promise<PromotionExpiryResult> {
  const result =
    preparation.refundStatus === "refund_pending"
      ? ((await attemptPendingPromotionRefund(
          preparation.promotionId,
          now,
          database,
        )) ?? preparation)
      : preparation;

  if (result.refundStatus === "reconciliation_required") {
    await openReconciliationCase(database, {
      caseKey: `promotion-refund:${result.promotionId}`,
      type: "promotion_refund",
      source: result.stripeRefundId ? "stripe" : "system",
      severity: "high",
      title: "Promotion refund requires reconciliation",
      summary:
        result.error ??
        "Promotion refund could not be completed automatically",
      externalReference: result.stripeRefundId ?? result.promotionId,
      amountCents: result.refundAmountCents,
      details: {
        promotionId: result.promotionId,
        stripeRefundId: result.stripeRefundId ?? null,
        refundStatus: result.refundStatus,
      },
    });
  }

  return result;
}
