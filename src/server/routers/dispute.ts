import { TRPCError } from "@trpc/server";
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { inngest } from "@/lib/inngest/client";
import {
  disputeEvidence,
  disputeMessages,
  disputes,
  media,
  orders,
  reconciliationCases,
  shipments,
} from "@/server/db/schema";
import { hasPersistedProviderPickupEvidence } from "@/server/services/payout-eligibility";
import { openReconciliationCase } from "@/server/services/reconciliation-cases";
import { processOrderRefund } from "@/server/services/refund";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
  strictProtectedProcedure,
} from "../trpc";

export const BUYER_CLAIM_WINDOW_MS = 48 * 60 * 60 * 1000;

const ACTIVE_DISPUTE_STATUSES = ["open", "under_review"] as const;
const TERMINAL_DISPUTE_STATUSES = [
  "resolved_buyer",
  "resolved_seller",
  "closed",
] as const;

const disputeStatusSchema = z.enum([
  ...ACTIVE_DISPUTE_STATUSES,
  ...TERMINAL_DISPUTE_STATUSES,
]);
const disputeReasonCodeSchema = z.enum([
  "freight_damage",
  "quantity_shortage",
  "wrong_item",
  "quality_mismatch",
  "condition_mismatch",
  "missing_documentation",
  "other",
]);
const evidenceTypeSchema = z.enum([
  "photo",
  "bol",
  "delivery_receipt",
  "invoice",
  "correspondence",
  "other",
]);

const REASON_LABELS: Record<
  z.infer<typeof disputeReasonCodeSchema>,
  string
> = {
  freight_damage: "Freight damage",
  quantity_shortage: "Quantity shortage",
  wrong_item: "Wrong material received",
  quality_mismatch: "Quality does not match the listing",
  condition_mismatch: "Condition does not match the listing",
  missing_documentation: "Missing delivery or product documentation",
  other: "Other order issue",
};

const evidenceInputSchema = z
  .array(
    z.object({
      mediaId: z.string().uuid(),
      evidenceType: evidenceTypeSchema,
      description: z.string().trim().max(500).optional(),
    }),
  )
  .min(1)
  .max(10)
  .superRefine((items, ctx) => {
    const ids = new Set(items.map((item) => item.mediaId));
    if (ids.size !== items.length) {
      ctx.addIssue({
        code: "custom",
        message: "Each evidence upload can only be attached once",
      });
    }
  });

function isTerminalDisputeStatus(status: string): boolean {
  return TERMINAL_DISPUTE_STATUSES.includes(
    status as (typeof TERMINAL_DISPUTE_STATUSES)[number],
  );
}

function getDeliveryTime(params: {
  orderDeliveredAt: Date | null;
  shipmentDeliveredAt: Date | null;
}): Date | null {
  return params.shipmentDeliveredAt ?? params.orderDeliveredAt;
}

export function evaluateBuyerClaimEligibility(params: {
  orderStatus: string;
  paymentStatus: string | null;
  deliveryOccurredAt: Date | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  if (params.orderStatus !== "delivered") {
    return {
      eligible: false as const,
      code: "not_delivered" as const,
      message: "Claims become available after carrier-confirmed delivery.",
      deliveryOccurredAt: params.deliveryOccurredAt,
      reportingDeadlineAt: null,
    };
  }
  if (
    params.paymentStatus !== "succeeded" &&
    params.paymentStatus !== "partially_refunded"
  ) {
    return {
      eligible: false as const,
      code: "not_paid" as const,
      message: "Only paid orders can enter the claims process.",
      deliveryOccurredAt: params.deliveryOccurredAt,
      reportingDeadlineAt: null,
    };
  }
  if (!params.deliveryOccurredAt) {
    return {
      eligible: false as const,
      code: "missing_delivery_evidence" as const,
      message:
        "Carrier delivery evidence is not available yet. Contact support if the shipment has arrived.",
      deliveryOccurredAt: null,
      reportingDeadlineAt: null,
    };
  }

  const reportingDeadlineAt = new Date(
    params.deliveryOccurredAt.getTime() + BUYER_CLAIM_WINDOW_MS,
  );
  if (now > reportingDeadlineAt) {
    return {
      eligible: false as const,
      code: "window_expired" as const,
      message:
        "The 48-hour reporting window has closed. Support can review documented exceptions.",
      deliveryOccurredAt: params.deliveryOccurredAt,
      reportingDeadlineAt,
    };
  }
  return {
    eligible: true as const,
    code: "eligible" as const,
    message: "This delivered order is eligible for a buyer claim.",
    deliveryOccurredAt: params.deliveryOccurredAt,
    reportingDeadlineAt,
  };
}

export const disputeRouter = createTRPCRouter({
  getOrderClaimState: protectedProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: and(
          eq(orders.id, input.orderId),
          ctx.user.role === "admin"
            ? undefined
            : or(
                eq(orders.buyerId, ctx.user.id),
                eq(orders.sellerId, ctx.user.id),
              ),
        ),
        columns: {
          id: true,
          buyerId: true,
          sellerId: true,
          status: true,
          paymentStatus: true,
          deliveredAt: true,
        },
        with: {
          shipment: {
            columns: {
              deliveredAt: true,
              bolUrl: true,
              deliveryReceiptUrl: true,
            },
          },
          dispute: {
            with: {
              evidence: {
                with: {
                  media: {
                    columns: {
                      id: true,
                      url: true,
                      fileName: true,
                      mimeType: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      const deliveryOccurredAt = getDeliveryTime({
        orderDeliveredAt: order.deliveredAt,
        shipmentDeliveredAt: order.shipment?.deliveredAt ?? null,
      });
      return {
        ...evaluateBuyerClaimEligibility({
          orderStatus: order.status,
          paymentStatus: order.paymentStatus,
          deliveryOccurredAt,
        }),
        existingDispute: order.dispute ?? null,
        carrierDocuments: {
          bolUrl: order.shipment?.bolUrl ?? null,
          deliveryReceiptUrl: order.shipment?.deliveryReceiptUrl ?? null,
        },
        canCreate:
          !order.dispute &&
          (ctx.user.role === "admin" || order.buyerId === ctx.user.id),
      };
    }),

  create: strictProtectedProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
        reasonCode: disputeReasonCodeSchema,
        description: z.string().trim().min(20).max(5000),
        damageVisibleAtDelivery: z.boolean().optional(),
        bolDamageNoted: z.boolean().optional(),
        bolNotes: z.string().trim().max(2000).optional(),
        reportingWindowOverrideReason: z
          .string()
          .trim()
          .min(10)
          .max(2000)
          .optional(),
        evidence: evidenceInputSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "buyer" && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the buyer or an administrator can open an order claim",
        });
      }
      if (
        ctx.user.role !== "admin" &&
        input.reportingWindowOverrideReason !== undefined
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only an administrator can override the reporting window",
        });
      }

      const hasPhoto = input.evidence.some(
        (item) => item.evidenceType === "photo",
      );
      if (!hasPhoto) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one issue photo is required",
        });
      }
      if (
        input.reasonCode === "freight_damage" &&
        input.damageVisibleAtDelivery === true &&
        (!input.bolDamageNoted ||
          !input.evidence.some((item) =>
            ["bol", "delivery_receipt"].includes(item.evidenceType),
          ))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Visible freight damage requires confirmation that it was noted on the delivery receipt and a copy of that document",
        });
      }

      return ctx.db.transaction(async (tx) => {
        const [order] = await tx
          .select({
            id: orders.id,
            buyerId: orders.buyerId,
            sellerId: orders.sellerId,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
            deliveredAt: orders.deliveredAt,
          })
          .from(orders)
          .where(eq(orders.id, input.orderId))
          .for("update");
        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }
        if (ctx.user.role !== "admin" && order.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only open a claim for your own purchase",
          });
        }

        const [shipment] = await tx
          .select({ deliveredAt: shipments.deliveredAt })
          .from(shipments)
          .where(eq(shipments.orderId, input.orderId))
          .limit(1);
        const deliveryOccurredAt = getDeliveryTime({
          orderDeliveredAt: order.deliveredAt,
          shipmentDeliveredAt: shipment?.deliveredAt ?? null,
        });
        const now = new Date();
        const eligibility = evaluateBuyerClaimEligibility({
          orderStatus: order.status,
          paymentStatus: order.paymentStatus,
          deliveryOccurredAt,
          now,
        });
        const adminOverride =
          ctx.user.role === "admin" &&
          Boolean(input.reportingWindowOverrideReason);
        if (!eligibility.eligible && !adminOverride) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: eligibility.message,
          });
        }
        if (
          adminOverride &&
          (order.status !== "delivered" ||
            !["succeeded", "partially_refunded"].includes(
              order.paymentStatus ?? "",
            ) ||
            !deliveryOccurredAt)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "An admin window override cannot bypass paid-order and delivery evidence requirements",
          });
        }

        const [existingDispute] = await tx
          .select({ id: disputes.id })
          .from(disputes)
          .where(eq(disputes.orderId, input.orderId))
          .limit(1);
        if (existingDispute) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A claim already exists for this order",
          });
        }

        const mediaIds = input.evidence.map((item) => item.mediaId);
        const uploadedEvidence = await tx
          .select({
            id: media.id,
            uploaderId: media.uploaderId,
            listingId: media.listingId,
            buyerRequestId: media.buyerRequestId,
            mimeType: media.mimeType,
          })
          .from(media)
          .where(
            and(
              inArray(media.id, mediaIds),
              eq(media.uploaderId, ctx.user.id),
              isNull(media.listingId),
              isNull(media.buyerRequestId),
            ),
          )
          .for("update");
        if (
          uploadedEvidence.length !== mediaIds.length ||
          uploadedEvidence.some(
            (item) =>
              !item.mimeType ||
              (!item.mimeType.startsWith("image/") &&
                item.mimeType !== "application/pdf"),
          )
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "One or more evidence files are missing, unsupported, or do not belong to this account",
          });
        }

        const reportingDeadlineAt = deliveryOccurredAt
          ? new Date(deliveryOccurredAt.getTime() + BUYER_CLAIM_WINDOW_MS)
          : null;
        const reportedLate = Boolean(
          reportingDeadlineAt && now > reportingDeadlineAt,
        );
        const [created] = await tx
          .insert(disputes)
          .values({
            orderId: input.orderId,
            initiatorId: ctx.user.id,
            reason: REASON_LABELS[input.reasonCode],
            reasonCode: input.reasonCode,
            source: ctx.user.role === "admin" ? "admin" : "buyer",
            description: input.description,
            deliveryOccurredAt,
            reportingDeadlineAt,
            reportingWindowOverrideReason:
              input.reportingWindowOverrideReason ?? null,
            reportedLate,
            damageVisibleAtDelivery:
              input.reasonCode === "freight_damage"
                ? (input.damageVisibleAtDelivery ?? false)
                : null,
            bolDamageNoted:
              input.reasonCode === "freight_damage"
                ? (input.bolDamageNoted ?? false)
                : null,
            bolNotes: input.bolNotes ?? null,
          })
          .returning();
        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The claim could not be created",
          });
        }

        const evidenceById = new Map(
          input.evidence.map((item) => [item.mediaId, item]),
        );
        await tx.insert(disputeEvidence).values(
          uploadedEvidence.map((item) => {
            const evidence = evidenceById.get(item.id)!;
            return {
              disputeId: created.id,
              mediaId: item.id,
              uploaderId: ctx.user.id,
              evidenceType: evidence.evidenceType,
              description: evidence.description ?? null,
            };
          }),
        );

        return created;
      });
    }),

  addEvidence: strictProtectedProcedure
    .input(
      z.object({
        disputeId: z.string().uuid(),
        evidence: evidenceInputSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [dispute] = await tx
          .select({
            id: disputes.id,
            orderId: disputes.orderId,
            status: disputes.status,
          })
          .from(disputes)
          .where(eq(disputes.id, input.disputeId))
          .for("update");
        if (!dispute) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Claim not found",
          });
        }

        const [order] = await tx
          .select({
            buyerId: orders.buyerId,
            sellerId: orders.sellerId,
          })
          .from(orders)
          .where(eq(orders.id, dispute.orderId))
          .limit(1);
        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }
        if (
          order.buyerId !== ctx.user.id &&
          order.sellerId !== ctx.user.id &&
          ctx.user.role !== "admin"
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not authorized to add evidence to this claim",
          });
        }
        if (isTerminalDisputeStatus(dispute.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Evidence cannot be added after the claim is closed",
          });
        }

        const mediaIds = input.evidence.map((item) => item.mediaId);
        const uploadedEvidence = await tx
          .select({
            id: media.id,
            mimeType: media.mimeType,
          })
          .from(media)
          .where(
            and(
              inArray(media.id, mediaIds),
              eq(media.uploaderId, ctx.user.id),
              isNull(media.listingId),
              isNull(media.buyerRequestId),
            ),
          )
          .for("update");
        if (
          uploadedEvidence.length !== mediaIds.length ||
          uploadedEvidence.some(
            (item) =>
              !item.mimeType ||
              (!item.mimeType.startsWith("image/") &&
                item.mimeType !== "application/pdf"),
          )
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Evidence files are missing, unsupported, or not yours",
          });
        }

        const evidenceById = new Map(
          input.evidence.map((item) => [item.mediaId, item]),
        );
        const attached = await tx
          .insert(disputeEvidence)
          .values(
            uploadedEvidence.map((item) => ({
              disputeId: dispute.id,
              mediaId: item.id,
              uploaderId: ctx.user.id,
              evidenceType: evidenceById.get(item.id)!.evidenceType,
              description:
                evidenceById.get(item.id)!.description ?? null,
            })),
          )
          .returning();
        await tx
          .update(disputes)
          .set({ updatedAt: new Date() })
          .where(eq(disputes.id, dispute.id));
        return attached;
      });
    }),

  addMessage: strictProtectedProcedure
    .input(
      z.object({
        disputeId: z.string().uuid(),
        message: z.string().trim().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [dispute] = await tx
          .select({
            id: disputes.id,
            orderId: disputes.orderId,
            status: disputes.status,
          })
          .from(disputes)
          .where(eq(disputes.id, input.disputeId))
          .for("update");
        if (!dispute) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Claim not found",
          });
        }

        const [order] = await tx
          .select({
            buyerId: orders.buyerId,
            sellerId: orders.sellerId,
          })
          .from(orders)
          .where(eq(orders.id, dispute.orderId))
          .limit(1);
        if (!order) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Order not found",
          });
        }
        if (
          order.buyerId !== ctx.user.id &&
          order.sellerId !== ctx.user.id &&
          ctx.user.role !== "admin"
        ) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not authorized to comment on this claim",
          });
        }
        if (isTerminalDisputeStatus(dispute.status)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This claim is closed",
          });
        }

        const [message] = await tx
          .insert(disputeMessages)
          .values({
            disputeId: input.disputeId,
            senderId: ctx.user.id,
            message: input.message,
          })
          .returning();
        await tx
          .update(disputes)
          .set({ updatedAt: new Date() })
          .where(eq(disputes.id, input.disputeId));
        return message;
      });
    }),

  getMyDisputes: protectedProcedure
    .input(
      z.object({
        status: disputeStatusSchema.optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userOrders = await ctx.db.query.orders.findMany({
        where: or(
          eq(orders.buyerId, ctx.user.id),
          eq(orders.sellerId, ctx.user.id),
        ),
        columns: { id: true },
      });
      const orderIds = userOrders.map((order) => order.id);
      if (orderIds.length === 0) {
        return {
          disputes: [],
          total: 0,
          page: input.page,
          limit: input.limit,
          totalPages: 0,
        };
      }

      const whereClause = and(
        inArray(disputes.orderId, orderIds),
        input.status ? eq(disputes.status, input.status) : undefined,
      );
      const offset = (input.page - 1) * input.limit;
      const [items, countRows] = await Promise.all([
        ctx.db.query.disputes.findMany({
          where: whereClause,
          orderBy: [desc(disputes.createdAt)],
          limit: input.limit,
          offset,
          with: {
            order: {
              columns: { id: true, orderNumber: true, status: true },
              with: {
                buyer: {
                  columns: { id: true, name: true, businessName: true },
                },
                seller: {
                  columns: { id: true, name: true, businessName: true },
                },
              },
            },
            initiator: {
              columns: { id: true, name: true, avatarUrl: true },
            },
            evidence: {
              columns: { id: true, evidenceType: true },
            },
          },
        }),
        ctx.db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(disputes)
          .where(whereClause),
      ]);
      const count = countRows[0]?.count ?? 0;
      return {
        disputes: items,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  getDispute: protectedProcedure
    .input(z.object({ disputeId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const dispute = await ctx.db.query.disputes.findFirst({
        where: eq(disputes.id, input.disputeId),
        with: {
          order: {
            with: {
              buyer: {
                columns: {
                  id: true,
                  name: true,
                  businessName: true,
                  avatarUrl: true,
                },
              },
              seller: {
                columns: {
                  id: true,
                  name: true,
                  businessName: true,
                  avatarUrl: true,
                },
              },
            },
          },
          initiator: {
            columns: { id: true, name: true, avatarUrl: true },
          },
          resolver: {
            columns: { id: true, name: true },
          },
          messages: {
            orderBy: [desc(disputeMessages.createdAt)],
            with: {
              sender: {
                columns: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                  role: true,
                },
              },
            },
          },
          evidence: {
            orderBy: [desc(disputeEvidence.createdAt)],
            with: {
              media: {
                columns: {
                  id: true,
                  url: true,
                  fileName: true,
                  mimeType: true,
                  fileSize: true,
                },
              },
              uploader: {
                columns: { id: true, name: true, role: true },
              },
            },
          },
        },
      });
      if (!dispute) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }
      if (
        dispute.order.buyerId !== ctx.user.id &&
        dispute.order.sellerId !== ctx.user.id &&
        ctx.user.role !== "admin"
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to view this claim",
        });
      }
      return dispute;
    }),

  getAllDisputes: adminProcedure
    .input(
      z.object({
        status: disputeStatusSchema.optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const whereClause = input.status
        ? eq(disputes.status, input.status)
        : undefined;
      const offset = (input.page - 1) * input.limit;
      const [items, countRows] = await Promise.all([
        ctx.db.query.disputes.findMany({
          where: whereClause,
          orderBy: [desc(disputes.createdAt)],
          limit: input.limit,
          offset,
          with: {
            order: {
              columns: {
                id: true,
                orderNumber: true,
                status: true,
                totalPrice: true,
                refundedAmount: true,
                paymentStatus: true,
                escrowStatus: true,
                deliveredAt: true,
              },
            },
            initiator: {
              columns: {
                id: true,
                name: true,
                businessName: true,
              },
            },
            evidence: {
              columns: { id: true, evidenceType: true },
            },
            reconciliationCases: {
              where: inArray(reconciliationCases.status, [
                "open",
                "in_progress",
                "waiting_external",
              ]),
              columns: { id: true, status: true, severity: true },
            },
          },
        }),
        ctx.db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(disputes)
          .where(whereClause),
      ]);
      const count = countRows[0]?.count ?? 0;
      return {
        disputes: items,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  resolve: adminProcedure
    .input(
      z.object({
        disputeId: z.string().uuid(),
        resolution: z.string().trim().min(10).max(5000),
        outcome: z.enum(["resolved_buyer", "resolved_seller", "closed"]),
        refundAmountCents: z.number().int().positive().optional(),
        confirmPartialSettlement: z.literal(true).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const dispute = await ctx.db.query.disputes.findFirst({
        where: eq(disputes.id, input.disputeId),
        with: { order: true },
      });
      if (!dispute) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }
      if (isTerminalDisputeStatus(dispute.status)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This claim has already been resolved",
        });
      }

      let refundedAmountCents = 0;
      if (input.outcome === "resolved_buyer") {
        if (
          !dispute.order.stripePaymentIntentId ||
          !["succeeded", "partially_refunded"].includes(
            dispute.order.paymentStatus ?? "",
          )
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "The remaining order payment is not refundable",
          });
        }
        const totalCents = Math.round(Number(dispute.order.totalPrice) * 100);
        const alreadyRefundedCents = Math.round(
          Number(dispute.order.refundedAmount ?? 0) * 100,
        );
        const remainingCents = totalCents - alreadyRefundedCents;
        if (remainingCents <= 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This order has already been fully refunded",
          });
        }
        refundedAmountCents = input.refundAmountCents ?? remainingCents;
        if (refundedAmountCents > remainingCents) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Refund cannot exceed the remaining ${remainingCents} cents`,
          });
        }
        if (
          refundedAmountCents < remainingCents &&
          input.confirmPartialSettlement !== true
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Confirm that this partial refund is the final settlement before closing the claim",
          });
        }

        try {
          await processOrderRefund({
            db: ctx.db,
            orderId: dispute.orderId,
            amountCents: refundedAmountCents,
            reason: `Claim resolved for buyer: ${input.resolution}`,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown refund error";
          await openReconciliationCase(ctx.db, {
            caseKey: `dispute-refund:${dispute.id}`,
            type: "dispute_resolution",
            source: "system",
            severity: "high",
            title: `Claim refund needs review: ${dispute.order.orderNumber}`,
            summary: "The claim remains open because its refund did not complete.",
            orderId: dispute.orderId,
            disputeId: dispute.id,
            amountCents: refundedAmountCents,
            actorId: ctx.user.id,
            details: {
              errorName:
                error instanceof Error ? error.name : "UnknownError",
              errorMessage,
              outcome: input.outcome,
            },
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "The refund did not complete. The claim remains open and a reconciliation case was created.",
          });
        }
      }

      const resolvedAt = new Date();
      const updated = await ctx.db.transaction(async (tx) => {
        await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.id, dispute.orderId))
          .for("update");
        const [current] = await tx
          .select({ status: disputes.status })
          .from(disputes)
          .where(eq(disputes.id, dispute.id))
          .for("update");
        if (!current || isTerminalDisputeStatus(current.status)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This claim was resolved by another request",
          });
        }
        const [resolved] = await tx
          .update(disputes)
          .set({
            status: input.outcome,
            resolution: input.resolution,
            resolvedBy: ctx.user.id,
            resolvedAt,
            resolvedRefundAmountCents:
              input.outcome === "resolved_buyer"
                ? refundedAmountCents
                : null,
            updatedAt: resolvedAt,
          })
          .where(
            and(
              eq(disputes.id, dispute.id),
              inArray(disputes.status, [...ACTIVE_DISPUTE_STATUSES]),
            ),
          )
          .returning();
        if (!resolved) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This claim changed before it could be resolved",
          });
        }
        return resolved;
      });

      let payoutRequeued = false;
      if (input.outcome === "resolved_seller") {
        const payoutState = await ctx.db
          .select({
            orderId: orders.id,
            orderNumber: orders.orderNumber,
            orderStatus: orders.status,
            paymentStatus: orders.paymentStatus,
            escrowStatus: orders.escrowStatus,
            selectedQuoteId: orders.selectedQuoteId,
            shipmentQuoteId: shipments.quoteId,
            priority1ShipmentId: shipments.priority1ShipmentId,
            shipmentStatus: shipments.status,
            shipmentIsDryRun: shipments.isDryRun,
            trackingEvents: shipments.trackingEvents,
            pickupDate: shipments.pickupDate,
          })
          .from(orders)
          .innerJoin(shipments, eq(shipments.orderId, orders.id))
          .where(eq(orders.id, dispute.orderId))
          .limit(1);
        const state = payoutState[0];
        const payoutEligible = Boolean(
          state &&
            state.paymentStatus === "succeeded" &&
            state.escrowStatus === "held" &&
            ["shipped", "delivered"].includes(state.orderStatus) &&
            hasPersistedProviderPickupEvidence({
              selectedQuoteId: state.selectedQuoteId,
              shipmentQuoteId: state.shipmentQuoteId,
              priority1ShipmentId: state.priority1ShipmentId,
              shipmentStatus: state.shipmentStatus,
              shipmentIsDryRun: state.shipmentIsDryRun,
              shipmentTrackingEvents: state.trackingEvents,
            }),
        );
        if (payoutEligible && state) {
          try {
            await inngest.send({
              id: `dispute-payout-requeue-${dispute.id}`,
              name: "order/picked-up",
              data: {
                orderId: state.orderId,
                pickedUpAt: (
                  state.pickupDate ??
                  dispute.order.shippedAt ??
                  resolvedAt
                ).toISOString(),
                pickupConfirmed: true,
                source: "priority1",
              },
            });
            payoutRequeued = true;
            await ctx.db
              .update(disputes)
              .set({ payoutRequeuedAt: new Date(), updatedAt: new Date() })
              .where(eq(disputes.id, dispute.id));
          } catch (error) {
            await openReconciliationCase(ctx.db, {
              caseKey: `dispute-payout-requeue:${dispute.id}`,
              type: "payout_failure",
              source: "inngest",
              severity: "high",
              title: `Seller payout requeue failed: ${state.orderNumber}`,
              summary:
                "The seller-favor claim resolution is saved, but the eligible payout event was not accepted.",
              orderId: dispute.orderId,
              disputeId: dispute.id,
              actorId: ctx.user.id,
              details: {
                errorName:
                  error instanceof Error ? error.name : "UnknownError",
              },
            });
          }
        }
      }

      return { dispute: updated, payoutRequeued };
    }),
});
