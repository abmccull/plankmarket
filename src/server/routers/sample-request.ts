import {
  createTRPCRouter,
  buyerProcedure,
  protectedProcedure,
  sellerProcedure,
} from "../trpc";
import {
  listings,
  notifications,
  sampleRequests,
} from "../db/schema";
import {
  and,
  desc,
  eq,
  inArray,
  sql,
} from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  applySampleRequestAction,
  canActorAccessSampleAddress,
  getAllowedSampleRequestActions,
  type SampleRequestAction,
  type SampleRequestRole,
} from "@/lib/sample-requests";
import {
  createSampleRequestSchema,
  sampleRequestActionSchema,
} from "@/lib/validators/sample-request";
import { isListingVisibleToBuyers } from "@/lib/listing-freshness";
import {
  addRetentionDays,
  SAMPLE_REQUEST_PII_RETENTION_DAYS,
} from "@/lib/privacy-retention";
import { resolveSellingTerritoryEligibility } from "@/lib/selling-territory";

const OPEN_SAMPLE_REQUEST_STATUSES = [
  "requested",
  "approved",
  "shipped",
] as const;

type SampleRequestRecord = {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status:
    | "requested"
    | "approved"
    | "declined"
    | "cancelled"
    | "shipped"
    | "delivered";
  buyerMessage: string | null;
  shippingName: string;
  shippingAddress1: string;
  shippingAddress2: string | null;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  shippingPhone: string | null;
  buyerConsentedToShareAddressAt: Date | null;
  carrier: string | null;
  trackingNumber: string | null;
  approvedAt: Date | null;
  declinedAt: Date | null;
  cancelledAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  lastActionReason: string | null;
  auditLog: Array<Record<string, unknown>>;
  piiPurgedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  listing: {
    id: string;
    title: string;
    sellerId: string;
  };
};

function getActorRole(input: {
  viewerUserId: string;
  viewerRole: "buyer" | "seller" | "admin";
  request: {
    buyerId: string;
    sellerId: string;
  };
}): SampleRequestRole {
  if (input.viewerRole === "admin") {
    return "admin";
  }

  if (input.request.buyerId === input.viewerUserId) {
    return "buyer";
  }

  if (input.request.sellerId === input.viewerUserId) {
    return "seller";
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "You do not have access to this sample request",
  });
}

function serializeSampleRequest(
  request: SampleRequestRecord,
  actorRole: SampleRequestRole,
) {
  const isPurged = request.piiPurgedAt !== null;
  const canViewAddress = canActorAccessSampleAddress({
    actorRole,
    status: request.status,
    buyerConsentedToShareAddressAt: request.buyerConsentedToShareAddressAt,
  });

  return {
    id: request.id,
    listingId: request.listingId,
    listingTitle: request.listing.title,
    buyerId: request.buyerId,
    sellerId: request.sellerId,
    status: request.status,
    buyerMessage: request.buyerMessage,
    carrier: request.carrier,
    trackingNumber: request.trackingNumber,
    approvedAt: request.approvedAt,
    declinedAt: request.declinedAt,
    cancelledAt: request.cancelledAt,
    shippedAt: request.shippedAt,
    deliveredAt: request.deliveredAt,
    lastActionReason: request.lastActionReason,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    auditLog: (request.auditLog ?? []).map((auditEntry) => {
      const { actorId, ...entry } = auditEntry;
      void actorId;
      return entry;
    }),
    allowedActions: getAllowedSampleRequestActions({
      status: request.status,
      actorRole,
    }),
    shippingAddress:
      isPurged
        ? null
        : actorRole === "buyer" || canViewAddress
        ? {
            name: request.shippingName,
            address1: request.shippingAddress1,
            address2: request.shippingAddress2,
            city: request.shippingCity,
            state: request.shippingState,
            zip: request.shippingZip,
            phone: request.shippingPhone,
          }
        : null,
    shippingAddressShared:
      !isPurged && (actorRole === "buyer" || canViewAddress),
  };
}

async function getRequestById(ctx: {
  db: typeof import("../db").db;
}, requestId: string) {
  return ctx.db.query.sampleRequests.findFirst({
    where: eq(sampleRequests.id, requestId),
    with: {
      listing: {
        columns: {
          id: true,
          title: true,
          sellerId: true,
        },
      },
    },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

async function listBuyerRequests(ctx: {
  db: typeof import("../db").db;
}, buyerId: string) {
  return ctx.db.query.sampleRequests.findMany({
    where: eq(sampleRequests.buyerId, buyerId),
    orderBy: [desc(sampleRequests.createdAt)],
    with: {
      listing: {
        columns: {
          id: true,
          title: true,
          sellerId: true,
        },
      },
    },
  });
}

async function listSellerRequests(ctx: {
  db: typeof import("../db").db;
}, sellerId: string) {
  return ctx.db.query.sampleRequests.findMany({
    where: eq(sampleRequests.sellerId, sellerId),
    orderBy: [desc(sampleRequests.createdAt)],
    with: {
      listing: {
        columns: {
          id: true,
          title: true,
          sellerId: true,
        },
      },
    },
  });
}

function territoryFailureMessage(
  territoryDecision: ReturnType<typeof resolveSellingTerritoryEligibility>,
): string {
  return territoryDecision.reason === "destination_blocked"
    ? `This seller is not currently sending samples to ${territoryDecision.normalizedDestinationState}.`
    : "This listing's territory settings are incomplete for the selected destination.";
}

export const sampleRequestRouter = createTRPCRouter({
  create: buyerProcedure
    .input(createSampleRequestSchema)
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.listingId),
        columns: {
          id: true,
          title: true,
          sellerId: true,
          status: true,
          allowSampleRequests: true,
          confirmationDueAt: true,
          lastConfirmedAt: true,
          territoryMode: true,
          allowedDestinationStates: true,
        },
      });

      if (!listing || !isListingVisibleToBuyers(listing)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      if (!listing.allowSampleRequests) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This listing is not accepting sample requests",
        });
      }

      if (listing.sellerId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot request a sample from your own listing",
        });
      }

      const territoryDecision = resolveSellingTerritoryEligibility({
        destinationState: input.shippingState,
        mode: listing.territoryMode,
        allowedStates: listing.allowedDestinationStates,
      });
      if (!territoryDecision.eligible) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: territoryFailureMessage(territoryDecision),
        });
      }

      const now = new Date();
      const auditEntry = {
        action: "request",
        actorRole: "buyer",
        fromStatus: "requested",
        toStatus: "requested",
        reason: input.buyerMessage?.trim() || "Buyer requested a sample",
        occurredAt: now,
        idempotent: false,
        actorId: ctx.user.id,
      };

      try {
        return await ctx.db.transaction(async (tx) => {
          const existing = await tx.query.sampleRequests.findFirst({
            where: and(
              eq(sampleRequests.listingId, input.listingId),
              eq(sampleRequests.buyerId, ctx.user.id),
              inArray(sampleRequests.status, [...OPEN_SAMPLE_REQUEST_STATUSES]),
            ),
            with: {
              listing: {
                columns: {
                  id: true,
                  title: true,
                  sellerId: true,
                },
              },
            },
          });

          if (existing) {
            return {
              created: false,
              request: serializeSampleRequest(existing, "buyer"),
            };
          }

          const [created] = await tx
            .insert(sampleRequests)
            .values({
              listingId: input.listingId,
              buyerId: ctx.user.id,
              sellerId: listing.sellerId,
              status: "requested",
              buyerMessage: input.buyerMessage?.trim() || null,
              shippingName: input.shippingName.trim(),
              shippingAddress1: input.shippingAddress1.trim(),
              shippingAddress2: input.shippingAddress2?.trim() || null,
              shippingCity: input.shippingCity.trim(),
              shippingState: input.shippingState,
              shippingZip: input.shippingZip,
              shippingPhone: input.shippingPhone?.trim() || null,
              buyerConsentedToShareAddressAt: now,
              lastActionReason: auditEntry.reason,
              auditLog: [auditEntry],
            })
            .returning();

          await tx.insert(notifications).values({
            userId: listing.sellerId,
            type: "system",
            title: "New sample request",
            message: `A buyer requested a sample for "${listing.title}".`,
            data: {
              type: "sample_request_created",
              sampleRequestId: created.id,
              listingId: listing.id,
            },
          });

          const createdWithListing = {
            ...created,
            listing: {
              id: listing.id,
              title: listing.title,
              sellerId: listing.sellerId,
            },
          };

          return {
            created: true,
            request: serializeSampleRequest(createdWithListing, "buyer"),
          };
        });
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }

        const existing = await ctx.db.query.sampleRequests.findFirst({
          where: and(
            eq(sampleRequests.listingId, input.listingId),
            eq(sampleRequests.buyerId, ctx.user.id),
            inArray(sampleRequests.status, [...OPEN_SAMPLE_REQUEST_STATUSES]),
          ),
          with: {
            listing: {
              columns: {
                id: true,
                title: true,
                sellerId: true,
              },
            },
          },
        });

        if (!existing) {
          throw error;
        }

        return {
          created: false,
          request: serializeSampleRequest(existing, "buyer"),
        };
      }
    }),

  getMyRequests: buyerProcedure.query(async ({ ctx }) => {
    const items = await listBuyerRequests(ctx, ctx.user.id);
    return items.map((item) => serializeSampleRequest(item, "buyer"));
  }),

  getSellerRequests: sellerProcedure.query(async ({ ctx }) => {
    const items = await listSellerRequests(ctx, ctx.user.id);
    return items.map((item) => serializeSampleRequest(item, "seller"));
  }),

  getById: protectedProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const request = await getRequestById(ctx, input.requestId);

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sample request not found",
        });
      }

      const actorRole = getActorRole({
        viewerUserId: ctx.user.id,
        viewerRole: ctx.user.role,
        request,
      });

      return serializeSampleRequest(request, actorRole);
    }),

  act: protectedProcedure
    .input(sampleRequestActionSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [lockedRequest] = await tx
          .select()
          .from(sampleRequests)
          .where(eq(sampleRequests.id, input.requestId))
          .for("update");

        if (!lockedRequest) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Sample request not found",
          });
        }

        const [listing] = await tx
          .select({
            id: listings.id,
            title: listings.title,
            sellerId: listings.sellerId,
          })
          .from(listings)
          .where(eq(listings.id, lockedRequest.listingId));

        if (!listing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found",
          });
        }

        const request = {
          ...lockedRequest,
          listing,
        };

        const actorRole = getActorRole({
          viewerUserId: ctx.user.id,
          viewerRole: ctx.user.role,
          request,
        });

        const occurredAt = new Date();
        const transition = applySampleRequestAction({
          state: {
            status: request.status,
            buyerConsentedToShareAddressAt:
              request.buyerConsentedToShareAddressAt,
          },
          actorRole,
          action: input.action as SampleRequestAction,
          reason: input.reason,
          occurredAt,
        });

        const auditLog = [
          ...(request.auditLog ?? []),
          {
            ...transition.audit,
            actorId: ctx.user.id,
            carrier: input.action === "ship" ? input.carrier ?? null : null,
            trackingNumber:
              input.action === "ship" ? input.trackingNumber ?? null : null,
          },
        ];

        const updatePayload: Record<string, unknown> = {
          status: transition.status,
          lastActionReason: transition.audit.reason,
          auditLog: sql`${JSON.stringify(auditLog)}::jsonb`,
          updatedAt: occurredAt,
        };

        if (transition.kind === "transition") {
          if (input.action === "approve") {
            updatePayload.approvedAt = occurredAt;
          } else if (input.action === "decline") {
            updatePayload.declinedAt = occurredAt;
            updatePayload.retentionPurgeAfter = addRetentionDays(
              occurredAt,
              SAMPLE_REQUEST_PII_RETENTION_DAYS,
            );
          } else if (input.action === "cancel") {
            updatePayload.cancelledAt = occurredAt;
            updatePayload.retentionPurgeAfter = addRetentionDays(
              occurredAt,
              SAMPLE_REQUEST_PII_RETENTION_DAYS,
            );
          } else if (input.action === "ship") {
            updatePayload.shippedAt = occurredAt;
            updatePayload.carrier = input.carrier?.trim() || null;
            updatePayload.trackingNumber = input.trackingNumber?.trim() || null;
          } else if (input.action === "deliver") {
            updatePayload.deliveredAt = occurredAt;
            updatePayload.retentionPurgeAfter = addRetentionDays(
              occurredAt,
              SAMPLE_REQUEST_PII_RETENTION_DAYS,
            );
          }
        }

        const [updated] = await tx
          .update(sampleRequests)
          .set(updatePayload)
          .where(eq(sampleRequests.id, request.id))
          .returning();

        if (transition.kind === "transition") {
          const counterpartUserId =
            actorRole === "buyer" ? request.sellerId : request.buyerId;
          const notificationTitle =
            input.action === "approve"
              ? "Sample request approved"
              : input.action === "decline"
                ? "Sample request declined"
                : input.action === "cancel"
                  ? "Sample request cancelled"
                  : input.action === "ship"
                    ? "Sample shipped"
                    : "Sample delivered";
          const notificationMessage =
            input.action === "approve"
              ? `Your sample request for "${request.listing.title}" was approved.`
              : input.action === "decline"
                ? `Your sample request for "${request.listing.title}" was declined.`
                : input.action === "cancel"
                  ? `The sample request for "${request.listing.title}" was cancelled.`
                  : input.action === "ship"
                    ? `A sample for "${request.listing.title}" was marked as shipped.`
                    : `The sample for "${request.listing.title}" was marked as delivered.`;

          await tx.insert(notifications).values({
            userId: counterpartUserId,
            type: "system",
            title: notificationTitle,
            message: notificationMessage,
            data: {
              type: "sample_request_updated",
              sampleRequestId: request.id,
              listingId: request.listingId,
              action: input.action,
            },
          });
        }

        const updatedWithListing = {
          ...updated,
          listing: request.listing,
        };

        return {
          result: transition,
          request: serializeSampleRequest(updatedWithListing, actorRole),
        };
      });
    }),
});
