import { createTRPCRouter, adminProcedure } from "../trpc";
import {
  users,
  listings,
  orders,
  notifications,
  platformSettings,
  shipments,
  shipmentStatusEnum,
  contentViolations,
  buyerRequests,
  buyerRequestResponses,
  offers,
  disputes,
} from "../db/schema";
import {
  desc,
  sql,
  eq,
  like,
  or,
  and,
  asc,
  notInArray,
  isNull,
  gte,
} from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { priority1 } from "@/server/services/priority1";
import { selectPriority1Shipment } from "@/server/services/priority1-selection";
import { inngest } from "@/lib/inngest/client";
import { buildListingCreatedEvent } from "@/lib/inngest/events";
import { sendVerificationApprovedEmail, sendVerificationRejectedEmail, sendRefundEmail } from "@/lib/email/send";
import { processOrderRefund } from "@/server/services/refund";
import { releaseReservedInventory } from "@/server/services/inventory-reservation";
import { cancelPriority1ShipmentForOrder } from "@/server/services/shipment-cancellation";
import { cancelUncapturedOrderPayment } from "@/server/services/payment-intent-cancellation";
import { openReconciliationCase } from "@/server/services/reconciliation-cases";
import {
  getShipmentIdentifier,
  mapPriority1ShipmentStatus,
  mergeTrackingEvents,
  shouldEmitProviderPickupEvent,
} from "@/server/services/shipping-workflow";
import {
  type VerificationStatus,
  verificationStateUpdate,
} from "@/server/services/verification-state";
import { calculateMarketplaceHealth } from "@/server/services/marketplace-health";
import { appendAuditEvent } from "@/server/services/audit-ledger";
import {
  parseMutablePlatformSetting,
  platformSettingUpdateInput,
} from "@/server/services/platform-settings-policy";
import { getConfiguredTaxPolicy } from "@/server/services/stripe-tax";
import { getTaxPolicyReadinessIssues } from "@/lib/tax-policy";

/**
 * Escapes special LIKE wildcards in user input to prevent unintended pattern matching
 */
function escapeLike(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as {
    code?: unknown;
    message?: unknown;
    cause?: unknown;
  };
  const code = typeof maybeError.code === "string" ? maybeError.code : "";
  const message =
    typeof maybeError.message === "string" ? maybeError.message : "";

  if (code === "42703") return true; // PostgreSQL undefined_column
  if (
    message.toLowerCase().includes("column") &&
    message.toLowerCase().includes("does not exist")
  ) {
    return true;
  }

  return isMissingColumnError(maybeError.cause);
}

/** Default platform settings */
const DEFAULT_SETTINGS: Record<string, unknown> = {
  buyerFeePercent: 5,
  sellerFeePercent: 5,
  listingExpiryDays: 90,
  maxPhotosPerListing: 20,
  platformName: "PlankMarket",
  supportEmail: "support@plankmarket.com",
  escrowReleaseDays: 3,
};

export const adminRouter = createTRPCRouter({
  getTaxReadiness: adminProcedure.query(async ({ ctx }) => {
    const policy = getConfiguredTaxPolicy();
    const [listingReadiness] = await ctx.db
      .select({
        activeListings:
          sql<number>`count(*) filter (where ${listings.status} = 'active')::int`,
        verifiedTaxCodeListings:
          sql<number>`count(*) filter (where ${listings.status} = 'active' and ${listings.taxCodeStatus} = 'verified')::int`,
        unreadyTaxCodeListings:
          sql<number>`count(*) filter (where ${listings.status} = 'active' and ${listings.taxCodeStatus} <> 'verified')::int`,
      })
      .from(listings);

    const configurationIssues = getTaxPolicyReadinessIssues(policy);
    if (policy.mode === "disabled") {
      configurationIssues.push(
        "Production tax mode is disabled; production checkout preflight will fail.",
      );
    }
    if (policy.mode === "connected_account_liable") {
      configurationIssues.push(
        "Connected-account calculations are available only for certification; checkout transaction/reversal commitment is intentionally blocked.",
      );
    }

    return {
      policy,
      liabilityOwner:
        policy.mode === "platform_liable"
          ? ("platform" as const)
          : policy.mode === "connected_account_liable"
            ? ("connected_account" as const)
            : ("none" as const),
      checkoutImplementation:
        policy.mode === "platform_liable"
          ? ("implemented_requires_provider_certification" as const)
          : policy.mode === "connected_account_liable"
            ? ("calculation_only_checkout_blocked" as const)
            : ("disabled" as const),
      configurationIssues,
      listings: {
        active: listingReadiness?.activeListings ?? 0,
        verifiedTaxCode:
          listingReadiness?.verifiedTaxCodeListings ?? 0,
        unreadyTaxCode: listingReadiness?.unreadyTaxCodeListings ?? 0,
      },
    };
  }),

  // Get dashboard statistics
  getStats: adminProcedure.query(async ({ ctx }) => {
    // Get user counts
    const [{ totalUsers, buyerCount, sellerCount, pendingVerificationCount }] = await ctx.db
      .select({
        totalUsers: sql<number>`cast(count(*) as integer)`,
        buyerCount:
          sql<number>`cast(count(*) filter (where role = 'buyer') as integer)`,
        sellerCount:
          sql<number>`cast(count(*) filter (where role = 'seller') as integer)`,
        pendingVerificationCount:
          sql<number>`cast(count(*) filter (where verification_status = 'pending') as integer)`,
      })
      .from(users);

    // Get listing counts
    const [{ totalListings, activeListings }] = await ctx.db
      .select({
        totalListings: sql<number>`cast(count(*) as integer)`,
        activeListings:
          sql<number>`cast(count(*) filter (where status = 'active') as integer)`,
      })
      .from(listings);

    // Get order counts and gross merchandise value. This is buyer order value,
    // not platform revenue or cash available to the business.
    const [{ totalOrders, completedOrders, totalGmv, pendingGmv }] =
      await ctx.db
        .select({
          totalOrders: sql<number>`cast(count(*) as integer)`,
          completedOrders:
            sql<number>`cast(count(*) filter (where status = 'delivered') as integer)`,
          totalGmv: sql<number>`coalesce(sum(total_price), 0)`,
          pendingGmv:
            sql<number>`coalesce(sum(total_price) filter (where status IN ('pending', 'confirmed', 'processing', 'shipped')), 0)`,
        })
        .from(orders);

    return {
      users: {
        total: totalUsers,
        buyers: buyerCount,
        sellers: sellerCount,
        pendingVerifications: pendingVerificationCount,
      },
      listings: {
        total: totalListings,
        active: activeListings,
      },
      orders: {
        total: totalOrders,
        completed: completedOrders,
      },
      gmv: {
        total: totalGmv,
        pending: pendingGmv,
      },
    };
  }),

  // Database-backed marketplace liquidity and operating health.
  getMarketplaceHealth: adminProcedure.query(async ({ ctx }) => {
    const windowDays = 30;
    const periodStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    const firstRequestResponse = ctx.db
      .select({
        id: buyerRequests.id,
        createdAt: buyerRequests.createdAt,
        status: buyerRequests.status,
        firstResponseAt:
          sql<Date | null>`min(${buyerRequestResponses.createdAt})`.as(
            "first_response_at",
          ),
      })
      .from(buyerRequests)
      .leftJoin(
        buyerRequestResponses,
        eq(buyerRequestResponses.requestId, buyerRequests.id),
      )
      .where(gte(buyerRequests.createdAt, periodStart))
      .groupBy(
        buyerRequests.id,
        buyerRequests.createdAt,
        buyerRequests.status,
      )
      .as("request_first_response");

    const [
      [supply],
      [demand],
      [requestStats],
      [listingStats],
      [offerStats],
      [orderStats],
    ] = await Promise.all([
      ctx.db
        .select({
          count: sql<number>`count(*)::int`,
          totalSqFt: sql<number>`coalesce(sum(${listings.totalSqFt}), 0)::float`,
        })
        .from(listings)
        .where(eq(listings.status, "active")),
      ctx.db
        .select({
          count: sql<number>`count(*)::int`,
          minimumSqFt: sql<number>`coalesce(sum(${buyerRequests.minTotalSqFt}), 0)::float`,
        })
        .from(buyerRequests)
        .where(eq(buyerRequests.status, "open")),
      ctx.db
        .select({
          total: sql<number>`count(*)::int`,
          responded:
            sql<number>`count(${firstRequestResponse.firstResponseAt})::int`,
          matched:
            sql<number>`count(*) filter (where ${firstRequestResponse.status} = 'matched')::int`,
          averageHoursToResponse:
            sql<number | null>`avg(extract(epoch from (${firstRequestResponse.firstResponseAt} - ${firstRequestResponse.createdAt})) / 3600)::float`,
        })
        .from(firstRequestResponse),
      ctx.db
        .select({
          total: sql<number>`count(*)::int`,
          withOffers:
            sql<number>`count(*) filter (where ${listings.offerCount} > 0)::int`,
        })
        .from(listings)
        .where(gte(listings.createdAt, periodStart)),
      ctx.db
        .select({
          total: sql<number>`count(*)::int`,
          responded:
            sql<number>`count(*) filter (where ${offers.status} in ('accepted', 'rejected', 'countered'))::int`,
          averageHoursToResponse:
            sql<number | null>`(avg(extract(epoch from (${offers.updatedAt} - ${offers.createdAt})) / 3600) filter (where ${offers.status} in ('accepted', 'rejected', 'countered')))::float`,
        })
        .from(offers)
        .where(gte(offers.createdAt, periodStart)),
      ctx.db
        .select({
          paid:
            sql<number>`count(*) filter (where ${orders.paymentStatus} in ('succeeded', 'partially_refunded', 'refunded'))::int`,
          delivered:
            sql<number>`count(*) filter (where ${orders.paymentStatus} in ('succeeded', 'partially_refunded', 'refunded') and ${orders.status} = 'delivered')::int`,
          withIssues:
            sql<number>`count(*) filter (where ${orders.paymentStatus} in ('succeeded', 'partially_refunded', 'refunded') and (${orders.status} = 'refunded' or coalesce(${orders.refundedAmount}, 0) > 0 or ${disputes.id} is not null))::int`,
          averageHoursToPickup:
            sql<number | null>`(avg(extract(epoch from (${orders.shippedAt} - ${orders.confirmedAt})) / 3600) filter (where ${orders.paymentStatus} in ('succeeded', 'partially_refunded', 'refunded') and ${orders.confirmedAt} is not null and ${orders.shippedAt} is not null and ${orders.shippedAt} >= ${orders.confirmedAt}))::float`,
        })
        .from(orders)
        .leftJoin(disputes, eq(disputes.orderId, orders.id))
        .where(gte(orders.createdAt, periodStart)),
    ]);

    return calculateMarketplaceHealth({
      windowDays,
      activeListings: supply?.count ?? 0,
      activeSupplySqFt: Number(supply?.totalSqFt ?? 0),
      openBuyerRequests: demand?.count ?? 0,
      openDemandSqFt: Number(demand?.minimumSqFt ?? 0),
      requests: {
        total: requestStats?.total ?? 0,
        responded: requestStats?.responded ?? 0,
        matched: requestStats?.matched ?? 0,
        averageHoursToResponse:
          requestStats?.averageHoursToResponse ?? null,
      },
      listings: {
        total: listingStats?.total ?? 0,
        withOffers: listingStats?.withOffers ?? 0,
      },
      offers: {
        total: offerStats?.total ?? 0,
        responded: offerStats?.responded ?? 0,
        averageHoursToResponse: offerStats?.averageHoursToResponse ?? null,
      },
      orders: {
        paid: orderStats?.paid ?? 0,
        delivered: orderStats?.delivered ?? 0,
        withIssues: orderStats?.withIssues ?? 0,
        averageHoursToPickup: orderStats?.averageHoursToPickup ?? null,
      },
    });
  }),

  // Get paginated user list with filters
  getUsers: adminProcedure
    .input(
      z.object({
        query: z.string().optional(),
        role: z.enum(["buyer", "seller", "admin"]).optional(),
        verificationStatus: z
          .enum(["unverified", "pending", "verified", "rejected"])
          .optional(),
        active: z.boolean().optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      // Build where conditions
      const conditions = [];

      if (input.query) {
        const escapedQuery = escapeLike(input.query);
        conditions.push(
          or(
            like(users.name, `%${escapedQuery}%`),
            like(users.email, `%${escapedQuery}%`),
            like(users.businessName, `%${escapedQuery}%`)
          )
        );
      }

      if (input.role) {
        conditions.push(eq(users.role, input.role));
      }

      if (input.verificationStatus) {
        conditions.push(eq(users.verificationStatus, input.verificationStatus));
      }

      if (input.active !== undefined) {
        conditions.push(eq(users.active, input.active));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const usersList = await ctx.db.query.users.findMany({
        where: whereClause,
        orderBy: [desc(users.createdAt)],
        limit: input.limit,
        offset,
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(users)
        .where(whereClause);

      return {
        users: usersList.map((u) => ({
          ...u,
          einTaxId: u.einTaxId ? `**-***${u.einTaxId.slice(-4)}` : null,
        })),
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Get paginated listing list
  getListings: adminProcedure
    .input(
      z.object({
        query: z.string().optional(),
        status: z
          .enum(["draft", "active", "sold", "expired", "archived"])
          .optional(),
        sellerId: z.string().uuid().optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      // Build where conditions
      const conditions = [];

      if (input.query) {
        conditions.push(like(listings.title, `%${escapeLike(input.query)}%`));
      }

      if (input.status) {
        conditions.push(eq(listings.status, input.status));
      }

      if (input.sellerId) {
        conditions.push(eq(listings.sellerId, input.sellerId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const listingsList = await ctx.db.query.listings.findMany({
        where: whereClause,
        orderBy: [desc(listings.createdAt)],
        limit: input.limit,
        offset,
        with: {
          seller: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              email: true,
            },
          },
        },
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(listings)
        .where(whereClause);

      return {
        listings: listingsList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Get paginated order list
  getOrders: adminProcedure
    .input(
      z.object({
        orderNumber: z.string().optional(),
        status: z
          .enum([
            "pending",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
            "refunded",
          ])
          .optional(),
        buyerId: z.string().uuid().optional(),
        sellerId: z.string().uuid().optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      // Build where conditions
      const conditions = [];

      if (input.orderNumber) {
        conditions.push(like(orders.orderNumber, `%${escapeLike(input.orderNumber)}%`));
      }

      if (input.status) {
        conditions.push(eq(orders.status, input.status));
      }

      if (input.buyerId) {
        conditions.push(eq(orders.buyerId, input.buyerId));
      }

      if (input.sellerId) {
        conditions.push(eq(orders.sellerId, input.sellerId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const ordersList = await ctx.db.query.orders.findMany({
        where: whereClause,
        orderBy: [desc(orders.createdAt)],
        limit: input.limit,
        offset,
        columns: {
          id: true,
          orderNumber: true,
          paymentStatus: true,
          totalPrice: true,
          status: true,
          createdAt: true,
        },
        with: {
          buyer: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              email: true,
            },
          },
          seller: {
            columns: {
              id: true,
              name: true,
              businessName: true,
              email: true,
            },
          },
          listing: {
            columns: {
              id: true,
              title: true,
            },
          },
        },
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(orders)
        .where(whereClause);

      return {
        orders: ordersList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Get pending verification requests
  getPendingVerifications: adminProcedure.query(async ({ ctx }) => {
    const pendingUsers = await ctx.db.query.users.findMany({
      where: eq(users.verificationStatus, "pending"),
      orderBy: [asc(users.verificationRequestedAt)], // FIFO - oldest first
    });

    return pendingUsers.map((u) => ({
      ...u,
      einTaxId: u.einTaxId ? `**-***${u.einTaxId.slice(-4)}` : null,
    }));
  }),

  // Update verification status
  updateVerification: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        submissionId: z.string().uuid().nullable(),
        status: z.enum(["verified", "rejected"]),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the user
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (user.verificationStatus !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User verification is not pending",
        });
      }

      // Commit the authorization decision and its user-visible audit event
      // together. Draft listings remain drafts until the seller explicitly
      // publishes them through the normal photo/readiness checks.
      const updatedUser = await ctx.db.transaction(async (tx) => {
        const [updated] = await tx
          .update(users)
          .set({
            ...verificationStateUpdate(input.status),
            verificationNotes: input.notes,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(users.id, input.userId),
              eq(users.verificationStatus, "pending"),
              input.submissionId === null
                ? isNull(users.verificationSubmissionId)
                : eq(users.verificationSubmissionId, input.submissionId),
            ),
          )
          .returning();

        if (!updated) return null;

        await tx.insert(notifications).values({
          userId: input.userId,
          type: "system",
          title:
            input.status === "verified"
              ? "Account Verified"
              : "Verification Not Approved",
          message:
            input.status === "verified"
              ? "Your business has been verified. You now have full access to PlankMarket. Review and publish any draft listings when they are ready."
              : input.notes
                ? `Your verification request was not approved. Reason: ${input.notes}`
                : "Your verification request was not approved. Please contact support for more information.",
          read: false,
          data: {
            type: "verification_decision",
            submissionId: input.submissionId,
            status: input.status,
          },
        });

        return updated;
      });

      if (!updatedUser) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "This verification submission changed while you were reviewing it. Refresh and review the current submission.",
        });
      }

      // Email is a best-effort side effect after the durable decision commits.
      if (input.status === "verified") {
        // Await provider acceptance so serverless teardown cannot discard it.
        await sendVerificationApprovedEmail({
          to: user.email,
          name: user.name,
          role: user.role as "buyer" | "seller",
          idempotencyKey: `verification-approved-${input.submissionId}`,
        }).catch((err) => {
          console.error("Failed to send verification approved email:", err);
        });
      } else {
        // Await provider acceptance so serverless teardown cannot discard it.
        await sendVerificationRejectedEmail({
          to: user.email,
          name: user.name,
          reason: input.notes,
          role: user.role as "buyer" | "seller",
          idempotencyKey: `verification-rejected-${input.submissionId}`,
        }).catch((err) => {
          console.error("Failed to send verification rejected email:", err);
        });
      }

      return updatedUser;
    }),

  // Update user details
  updateUser: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(["buyer", "seller", "admin"]).optional(),
        active: z.boolean().optional(),
        verified: z.boolean().optional(),
        verificationStatus: z
          .enum(["unverified", "pending", "verified", "rejected"])
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Get the user
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Build update object
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (input.role !== undefined) {
        updateData.role = input.role;
      }

      if (input.active !== undefined) {
        updateData.active = input.active;
      }

      const requestedVerificationStatus: VerificationStatus | undefined =
        input.verificationStatus ??
        (input.verified === undefined
          ? undefined
          : input.verified
            ? "verified"
            : "unverified");
      if (requestedVerificationStatus) {
        Object.assign(
          updateData,
          verificationStateUpdate(requestedVerificationStatus),
        );
      }

      let previousAppMetadata: Record<string, unknown> | undefined;
      if (input.role !== undefined && input.role !== user.role) {
        const { createServiceClient } = await import("@/lib/supabase/server");
        const serviceClient = await createServiceClient();
        const { data: authData, error: getAuthUserError } =
          await serviceClient.auth.admin.getUserById(user.authId);
        if (getAuthUserError || !authData.user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not synchronize the user's authorization role.",
          });
        }
        previousAppMetadata = authData.user.app_metadata;
        const { error: metadataError } =
          await serviceClient.auth.admin.updateUserById(user.authId, {
            app_metadata: {
              ...previousAppMetadata,
              role: input.role,
            },
          });
        if (metadataError) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not synchronize the user's authorization role.",
          });
        }
      }

      let updatedUser;
      try {
        [updatedUser] = await ctx.db
          .update(users)
          .set(updateData)
          .where(eq(users.id, input.userId))
          .returning();
      } catch (error) {
        if (previousAppMetadata) {
          const { createServiceClient } = await import("@/lib/supabase/server");
          const serviceClient = await createServiceClient();
          await serviceClient.auth.admin
            .updateUserById(user.authId, {
              app_metadata: previousAppMetadata,
            })
            .catch((rollbackError) => {
              console.error("Failed to roll back Supabase role metadata", {
                userId: user.id,
                rollbackError,
              });
            });
        }
        throw error;
      }

      return updatedUser;
    }),

  // Get finance dashboard statistics
  getFinanceStats: adminProcedure.query(async ({ ctx }) => {
    const byStatusPromise = ctx.db
      .select({
        status: orders.status,
        count: sql<number>`cast(count(*) as integer)`,
        gmv: sql<number>`coalesce(sum(subtotal), 0)`,
      })
      .from(orders)
      .groupBy(orders.status);

    const escrowBreakdownPromise = ctx.db
      .select({
        escrowStatus: orders.escrowStatus,
        count: sql<number>`cast(count(*) as integer)`,
        total: sql<number>`coalesce(sum(total_price), 0)`,
      })
      .from(orders)
      .groupBy(orders.escrowStatus);

    const topSellersPromise = ctx.db
      .select({
        sellerId: orders.sellerId,
        sellerName: users.name,
        businessName: users.businessName,
        gmv: sql<number>`coalesce(sum(${orders.subtotal}), 0)`,
        orderCount: sql<number>`cast(count(*) as integer)`,
      })
      .from(orders)
      .innerJoin(users, eq(orders.sellerId, users.id))
      .groupBy(orders.sellerId, users.name, users.businessName)
      .orderBy(desc(sql`sum(${orders.subtotal})`))
      .limit(5);

    const recentOrdersPromise = ctx.db.query.orders.findMany({
      orderBy: [desc(orders.createdAt)],
      limit: 10,
      columns: {
        id: true,
        orderNumber: true,
        totalPrice: true,
        buyerFee: true,
        sellerFee: true,
        status: true,
        createdAt: true,
      },
      with: {
        buyer: {
          columns: { name: true, businessName: true },
        },
        seller: {
          columns: { name: true, businessName: true },
        },
      },
    });

    const [byStatus, escrowBreakdown, topSellers, recentOrders] =
      await Promise.all([
        byStatusPromise,
        escrowBreakdownPromise,
        topSellersPromise,
        recentOrdersPromise,
      ]);

    try {
      // New schema: seller/platform Stripe fee allocation fields exist.
      const [summary, monthlyTrend] = await Promise.all([
        ctx.db
          .select({
            totalGmv: sql<number>`coalesce(sum(subtotal), 0)`,
            totalBuyerFees: sql<number>`coalesce(sum(buyer_fee), 0)`,
            totalSellerFees: sql<number>`coalesce(sum(seller_fee), 0)`,
            totalSellerStripeFees:
              sql<number>`coalesce(sum(seller_stripe_fee), 0)`,
            totalPlatformStripeFees:
              sql<number>`coalesce(sum(platform_stripe_fee), 0)`,
            platformRevenue:
              sql<number>`coalesce(sum(buyer_fee), 0) + coalesce(sum(seller_fee), 0) + coalesce(sum(shipping_margin), 0)`,
            totalShippingMargin:
              sql<number>`coalesce(sum(shipping_margin), 0)`,
            totalPayouts: sql<number>`coalesce(sum(seller_payout), 0)`,
            totalFreightBooked:
              sql<number>`coalesce(sum(shipping_price), 0)`,
            totalBuyerFreightCharges:
              sql<number>`coalesce(sum(buyer_freight_charge), 0)`,
            totalSellerFreightContributions:
              sql<number>`coalesce(sum(seller_freight_contribution), 0)`,
            avgOrderValue: sql<number>`coalesce(avg(total_price), 0)`,
            orderCount: sql<number>`cast(count(*) as integer)`,
          })
          .from(orders),
        ctx.db
          .select({
            month: sql<string>`to_char(date_trunc('month', created_at), 'YYYY-MM')`,
            orderCount: sql<number>`cast(count(*) as integer)`,
            gmv: sql<number>`coalesce(sum(subtotal), 0)`,
            buyerFees: sql<number>`coalesce(sum(buyer_fee), 0)`,
            sellerFees: sql<number>`coalesce(sum(seller_fee), 0)`,
            sellerStripeFees: sql<number>`coalesce(sum(seller_stripe_fee), 0)`,
            platformStripeFees:
              sql<number>`coalesce(sum(platform_stripe_fee), 0)`,
          })
          .from(orders)
          .where(
            sql`created_at >= date_trunc('month', now()) - interval '11 months'`
          )
          .groupBy(sql`date_trunc('month', created_at)`)
          .orderBy(asc(sql`date_trunc('month', created_at)`)),
      ]);

      return {
        summary: summary[0],
        byStatus,
        monthlyTrend,
        escrowBreakdown,
        topSellers,
        recentOrders,
      };
    } catch (error) {
      if (!isMissingColumnError(error)) {
        throw error;
      }

      // Legacy schema fallback: allocate all processor cost to seller share.
      console.warn("Falling back to legacy finance stats query", { error });
      let summary;
      let monthlyTrend;
      try {
        [summary, monthlyTrend] = await Promise.all([
          ctx.db
            .select({
              totalGmv: sql<number>`coalesce(sum(subtotal), 0)`,
              totalBuyerFees: sql<number>`coalesce(sum(buyer_fee), 0)`,
              totalSellerFees: sql<number>`coalesce(sum(seller_fee), 0)`,
              totalSellerStripeFees:
                sql<number>`coalesce(sum(stripe_processing_fee), 0)`,
              totalPlatformStripeFees: sql<number>`0`,
              platformRevenue:
                sql<number>`coalesce(sum(buyer_fee), 0) + coalesce(sum(seller_fee), 0) + coalesce(sum(shipping_margin), 0)`,
              totalShippingMargin:
                sql<number>`coalesce(sum(shipping_margin), 0)`,
              totalPayouts: sql<number>`coalesce(sum(seller_payout), 0)`,
              totalFreightBooked:
                sql<number>`coalesce(sum(shipping_price), 0)`,
              totalBuyerFreightCharges:
                sql<number>`coalesce(sum(shipping_price), 0)`,
              totalSellerFreightContributions: sql<number>`0`,
              avgOrderValue: sql<number>`coalesce(avg(total_price), 0)`,
              orderCount: sql<number>`cast(count(*) as integer)`,
            })
            .from(orders),
          ctx.db
            .select({
              month: sql<string>`to_char(date_trunc('month', created_at), 'YYYY-MM')`,
              orderCount: sql<number>`cast(count(*) as integer)`,
              gmv: sql<number>`coalesce(sum(subtotal), 0)`,
              buyerFees: sql<number>`coalesce(sum(buyer_fee), 0)`,
              sellerFees: sql<number>`coalesce(sum(seller_fee), 0)`,
              sellerStripeFees:
                sql<number>`coalesce(sum(stripe_processing_fee), 0)`,
              platformStripeFees: sql<number>`0`,
            })
            .from(orders)
            .where(
              sql`created_at >= date_trunc('month', now()) - interval '11 months'`
            )
            .groupBy(sql`date_trunc('month', created_at)`)
            .orderBy(asc(sql`date_trunc('month', created_at)`)),
        ]);
      } catch (legacyError) {
        if (!isMissingColumnError(legacyError)) {
          throw legacyError;
        }

        // Very old schema fallback (before stripe_processing_fee existed).
        [summary, monthlyTrend] = await Promise.all([
          ctx.db
            .select({
              totalGmv: sql<number>`coalesce(sum(subtotal), 0)`,
              totalBuyerFees: sql<number>`coalesce(sum(buyer_fee), 0)`,
              totalSellerFees: sql<number>`coalesce(sum(seller_fee), 0)`,
              totalSellerStripeFees: sql<number>`0`,
              totalPlatformStripeFees: sql<number>`0`,
              platformRevenue:
                sql<number>`coalesce(sum(buyer_fee), 0) + coalesce(sum(seller_fee), 0) + coalesce(sum(shipping_margin), 0)`,
              totalShippingMargin:
                sql<number>`coalesce(sum(shipping_margin), 0)`,
              totalPayouts: sql<number>`coalesce(sum(seller_payout), 0)`,
              totalFreightBooked:
                sql<number>`coalesce(sum(shipping_price), 0)`,
              totalBuyerFreightCharges:
                sql<number>`coalesce(sum(shipping_price), 0)`,
              totalSellerFreightContributions: sql<number>`0`,
              avgOrderValue: sql<number>`coalesce(avg(total_price), 0)`,
              orderCount: sql<number>`cast(count(*) as integer)`,
            })
            .from(orders),
          ctx.db
            .select({
              month: sql<string>`to_char(date_trunc('month', created_at), 'YYYY-MM')`,
              orderCount: sql<number>`cast(count(*) as integer)`,
              gmv: sql<number>`coalesce(sum(subtotal), 0)`,
              buyerFees: sql<number>`coalesce(sum(buyer_fee), 0)`,
              sellerFees: sql<number>`coalesce(sum(seller_fee), 0)`,
              sellerStripeFees: sql<number>`0`,
              platformStripeFees: sql<number>`0`,
            })
            .from(orders)
            .where(
              sql`created_at >= date_trunc('month', now()) - interval '11 months'`
            )
            .groupBy(sql`date_trunc('month', created_at)`)
            .orderBy(asc(sql`date_trunc('month', created_at)`)),
        ]);
      }

      return {
        summary: summary[0],
        byStatus,
        monthlyTrend,
        escrowBreakdown,
        topSellers,
        recentOrders,
      };
    }
  }),

  // Get paginated finance transactions with filters
  getFinanceTransactions: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        status: z
          .enum([
            "pending",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
            "refunded",
          ])
          .optional(),
        escrowStatus: z.string().optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const conditions = [];

      if (input.search) {
        conditions.push(like(orders.orderNumber, `%${escapeLike(input.search)}%`));
      }

      if (input.status) {
        conditions.push(eq(orders.status, input.status));
      }

      if (input.escrowStatus) {
        conditions.push(eq(orders.escrowStatus, input.escrowStatus));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      let transactionsList: Array<{
        id: string;
        orderNumber: string;
        quantitySqFt: number;
        pricePerSqFt: number;
        subtotal: number;
        buyerFee: number;
        sellerFee: number;
        stripeProcessingFee: number;
        sellerStripeFee: number;
        platformStripeFee: number;
        shippingPrice: number | null;
        freightFundingMode:
          | "buyer_pays"
          | "seller_pays"
          | "seller_pays_selected_states";
        buyerFreightCharge: number;
        sellerFreightContribution: number;
        totalPrice: number;
        sellerPayout: number;
        status:
          | "pending"
          | "confirmed"
          | "processing"
          | "shipped"
          | "delivered"
          | "cancelled"
          | "refunded";
        escrowStatus: string;
        paymentStatus: string | null;
        createdAt: Date;
        buyer: { name: string; businessName: string | null };
        seller: { name: string; businessName: string | null };
        listing: { id: string; title: string };
      }> = [];

      try {
        transactionsList = await ctx.db.query.orders.findMany({
          where: whereClause,
          orderBy: [desc(orders.createdAt)],
          limit: input.limit,
          offset,
          columns: {
            id: true,
            orderNumber: true,
            quantitySqFt: true,
            pricePerSqFt: true,
            subtotal: true,
            buyerFee: true,
            sellerFee: true,
            stripeProcessingFee: true,
            sellerStripeFee: true,
            platformStripeFee: true,
            shippingPrice: true,
            freightFundingMode: true,
            buyerFreightCharge: true,
            sellerFreightContribution: true,
            totalPrice: true,
            sellerPayout: true,
            status: true,
            escrowStatus: true,
            paymentStatus: true,
            createdAt: true,
          },
          with: {
            buyer: {
              columns: { name: true, businessName: true },
            },
            seller: {
              columns: { name: true, businessName: true },
            },
            listing: {
              columns: { id: true, title: true },
            },
          },
        });
      } catch (error) {
        if (!isMissingColumnError(error)) {
          throw error;
        }

        console.warn("Falling back to legacy finance transactions query", {
          error,
        });
        try {
          const legacyTransactions = await ctx.db.query.orders.findMany({
            where: whereClause,
            orderBy: [desc(orders.createdAt)],
            limit: input.limit,
            offset,
            columns: {
              id: true,
              orderNumber: true,
              quantitySqFt: true,
              pricePerSqFt: true,
              subtotal: true,
              buyerFee: true,
              sellerFee: true,
              stripeProcessingFee: true,
              shippingPrice: true,
              totalPrice: true,
              sellerPayout: true,
              status: true,
              escrowStatus: true,
              paymentStatus: true,
              createdAt: true,
            },
            with: {
              buyer: {
                columns: { name: true, businessName: true },
              },
              seller: {
                columns: { name: true, businessName: true },
              },
              listing: {
                columns: { id: true, title: true },
              },
            },
          });

          transactionsList = legacyTransactions.map((tx) => ({
            ...tx,
            sellerStripeFee: tx.stripeProcessingFee,
            platformStripeFee: 0,
            freightFundingMode: "buyer_pays" as const,
            buyerFreightCharge: tx.shippingPrice ?? 0,
            sellerFreightContribution: 0,
          }));
        } catch (legacyError) {
          if (!isMissingColumnError(legacyError)) {
            throw legacyError;
          }

          const veryLegacyTransactions = await ctx.db.query.orders.findMany({
            where: whereClause,
            orderBy: [desc(orders.createdAt)],
            limit: input.limit,
            offset,
            columns: {
              id: true,
              orderNumber: true,
              quantitySqFt: true,
              pricePerSqFt: true,
              subtotal: true,
              buyerFee: true,
              sellerFee: true,
              shippingPrice: true,
              totalPrice: true,
              sellerPayout: true,
              status: true,
              escrowStatus: true,
              paymentStatus: true,
              createdAt: true,
            },
            with: {
              buyer: {
                columns: { name: true, businessName: true },
              },
              seller: {
                columns: { name: true, businessName: true },
              },
              listing: {
                columns: { id: true, title: true },
              },
            },
          });

          transactionsList = veryLegacyTransactions.map((tx) => ({
            ...tx,
            stripeProcessingFee: 0,
            sellerStripeFee: 0,
            platformStripeFee: 0,
            freightFundingMode: "buyer_pays" as const,
            buyerFreightCharge: tx.shippingPrice ?? 0,
            sellerFreightContribution: 0,
          }));
        }
      }

      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(orders)
        .where(whereClause);

      return {
        transactions: transactionsList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // ==========================================
  // Moderation Actions
  // ==========================================

  // Flag a listing (set to archived with moderation note)
  setListingTaxCode: adminProcedure
    .input(
      z.discriminatedUnion("action", [
        z.object({
          action: z.literal("verify"),
          listingId: z.string().uuid(),
          taxCode: z.string().trim().regex(/^txcd_\d+$/),
        }),
        z.object({
          action: z.literal("clear"),
          listingId: z.string().uuid(),
          reason: z.string().trim().min(10).max(500),
        }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [listing] = await tx
          .select({
            id: listings.id,
            title: listings.title,
            stripeTaxCode: listings.stripeTaxCode,
            taxCodeStatus: listings.taxCodeStatus,
          })
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .for("update");
        if (!listing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found",
          });
        }

        const now = new Date();
        const next =
          input.action === "verify"
            ? {
                stripeTaxCode: input.taxCode,
                taxCodeStatus: "verified" as const,
                taxCodeVerifiedAt: now,
                taxCodeVerifiedBy: ctx.user.id,
              }
            : {
                stripeTaxCode: null,
                taxCodeStatus: "unassigned" as const,
                taxCodeVerifiedAt: null,
                taxCodeVerifiedBy: null,
              };
        const [updated] = await tx
          .update(listings)
          .set({ ...next, updatedAt: now })
          .where(eq(listings.id, listing.id))
          .returning({
            id: listings.id,
            stripeTaxCode: listings.stripeTaxCode,
            taxCodeStatus: listings.taxCodeStatus,
            taxCodeVerifiedAt: listings.taxCodeVerifiedAt,
            taxCodeVerifiedBy: listings.taxCodeVerifiedBy,
          });

        await appendAuditEvent(tx, {
          actorType: "admin",
          actorId: ctx.user.id,
          action:
            input.action === "verify"
              ? "listing.tax_code_verified"
              : "listing.tax_code_cleared",
          entityType: "listing",
          entityId: listing.id,
          summary:
            input.action === "verify"
              ? `Verified Stripe Tax code for ${listing.title}.`
              : `Cleared Stripe Tax code for ${listing.title}.`,
          metadata: {
            previousCode: listing.stripeTaxCode,
            previousStatus: listing.taxCodeStatus,
            nextCode: updated?.stripeTaxCode ?? null,
            nextStatus: updated?.taxCodeStatus ?? null,
            ...(input.action === "clear" ? { reason: input.reason } : {}),
          },
        });

        return updated;
      });
    }),

  // Flag a listing (set to archived with moderation note)
  flagListing: adminProcedure
    .input(
      z.object({
        listingId: z.string().uuid(),
        reason: z.string().min(1, "Reason is required").max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.listingId),
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      if (listing.status === "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Listing is already archived/flagged",
        });
      }

      await ctx.db
        .update(listings)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(listings.id, input.listingId));

      // Notify the seller
      await ctx.db.insert(notifications).values({
        userId: listing.sellerId,
        type: "system",
        title: "Listing Flagged by Admin",
        message: `Your listing "${listing.title}" has been flagged and removed from the marketplace. Reason: ${input.reason}`,
        data: { listingId: listing.id },
        read: false,
      });

      return { success: true };
    }),

  // Unflag a listing (restore to active)
  unflagListing: adminProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.listingId),
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      if (listing.status !== "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Listing is not currently archived/flagged",
        });
      }

      const restoredAt = new Date();
      await ctx.db
        .update(listings)
        .set({
          status: "active",
          publishedAt: restoredAt,
          updatedAt: restoredAt,
        })
        .where(eq(listings.id, input.listingId));

      // Notify the seller
      await ctx.db.insert(notifications).values({
        userId: listing.sellerId,
        type: "system",
        title: "Listing Restored",
        message: `Your listing "${listing.title}" has been reviewed and restored to the marketplace.`,
        data: { listingId: listing.id },
        read: false,
      });

      try {
        const event = buildListingCreatedEvent({
          listingId: listing.id,
          sellerId: listing.sellerId,
        });
        await inngest.send({
          ...event,
          id: `listing-restored:${listing.id}:${restoredAt.getTime()}`,
        });
      } catch {
        // Daily/weekly digests still discover the refreshed publishedAt value;
        // an instant-alert provider failure must not undo the admin decision.
        console.error("Failed to enqueue restored listing alert", {
          listingId: listing.id,
          sellerId: listing.sellerId,
        });
      }

      return { success: true };
    }),

  // Suspend a user
  suspendUser: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        reason: z.string().min(1, "Reason is required").max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (user.role === "admin") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot suspend an admin user",
        });
      }

      if (!user.active) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is already suspended",
        });
      }

      await ctx.db
        .update(users)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      // Notify the user
      await ctx.db.insert(notifications).values({
        userId: input.userId,
        type: "system",
        title: "Account Suspended",
        message: `Your account has been suspended. Reason: ${input.reason}. Please contact support for more information.`,
        read: false,
      });

      return { success: true };
    }),

  // Unsuspend a user
  unsuspendUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (user.active) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is not currently suspended",
        });
      }

      await ctx.db
        .update(users)
        .set({ active: true, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      // Notify the user
      await ctx.db.insert(notifications).values({
        userId: input.userId,
        type: "system",
        title: "Account Reinstated",
        message: "Your account has been reinstated. You can now access PlankMarket again.",
        read: false,
      });

      return { success: true };
    }),

  // Force cancel an order
  forceCancelOrder: adminProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
        reason: z.string().min(1, "Reason is required").max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
        columns: {
          id: true,
          orderNumber: true,
          buyerId: true,
          sellerId: true,
          stripePaymentIntentId: true,
          paymentStatus: true,
          status: true,
          escrowStatus: true,
          totalPrice: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      const terminalStatuses = ["cancelled", "refunded", "delivered"];
      if (terminalStatuses.includes(order.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot cancel an order with status "${order.status}"`,
        });
      }

      const refundedPaidOrder = Boolean(
        order.stripePaymentIntentId &&
          (order.paymentStatus === "succeeded" ||
            order.paymentStatus === "partially_refunded"),
      );
      const refundResult = refundedPaidOrder
        ? await processOrderRefund({
            db: ctx.db,
            orderId: input.orderId,
            reason: `Admin force-cancel: ${input.reason}`,
          })
        : null;
      if (!refundedPaidOrder) {
        await cancelUncapturedOrderPayment({
          orderId: order.id,
          paymentIntentId: order.stripePaymentIntentId,
          expectedAmountCents: Math.round(Number(order.totalPrice) * 100),
        });
        await cancelPriority1ShipmentForOrder(input.orderId);
      }

      const adminAuditNote = refundedPaidOrder
        ? refundResult?.state === "succeeded"
          ? `[Admin force-cancel completed as full refund: ${input.reason}]`
          : refundResult?.state === "refund_pending"
            ? `[Admin force-cancel queued refund pending Stripe confirmation: ${input.reason}]`
            : `[Admin force-cancel queued refund for reconciliation review: ${input.reason}]`
        : `[Admin force-cancelled unpaid order: ${input.reason}]`;
      await ctx.db
        .update(orders)
        .set({
          ...(refundedPaidOrder
            ? {}
            : {
                status: "cancelled" as const,
                cancelledAt: new Date(),
                ...(order.escrowStatus === "held"
                  ? { escrowStatus: "refunded" }
                  : {}),
              }),
          notes: sql`concat_ws(E'\n', nullif(${orders.notes}, ''), ${adminAuditNote})`,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, input.orderId));

      if (
        !refundedPaidOrder &&
        ["pending", "confirmed", "processing"].includes(order.status)
      ) {
        await releaseReservedInventory({
          db: ctx.db,
          orderId: input.orderId,
          reason: "admin_force_cancelled_before_shipment",
        });
      }

      // Full refunds already create durable buyer/seller refund notifications.
      if (!refundedPaidOrder) {
        await ctx.db.insert(notifications).values([
          {
            userId: order.buyerId,
            type: "system" as const,
            title: "Order Cancelled by Admin",
            message: `Order ${order.orderNumber} has been cancelled by an administrator. Reason: ${input.reason}`,
            data: { orderId: order.id },
            read: false,
          },
          {
            userId: order.sellerId,
            type: "system" as const,
            title: "Order Cancelled by Admin",
            message: `Order ${order.orderNumber} has been cancelled by an administrator. Reason: ${input.reason}`,
            data: { orderId: order.id },
            read: false,
          },
        ]);
      }

      return {
        success: true,
        refundState: refundResult?.state ?? null,
        providerStatus: refundResult?.providerStatus ?? null,
      };
    }),

  // Refund an order (full or partial)
  refundOrder: adminProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
        amountCents: z.number().int().positive().optional(),
        reason: z.string().min(1, "Reason is required").max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
        columns: {
          id: true,
          orderNumber: true,
        },
        with: {
          buyer: { columns: { email: true, name: true } },
          seller: { columns: { email: true, name: true } },
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      const result = await processOrderRefund({
        db: ctx.db,
        orderId: input.orderId,
        amountCents: input.amountCents,
        reason: input.reason,
      });

      const refundAmountFormatted = `$${result.amountRefunded.toFixed(2)}`;
      if (result.state === "succeeded") {
        // Await both provider submissions so serverless teardown cannot discard
        // them. Stable Resend keys make a retried admin request harmless.
        const emailResults = await Promise.allSettled([
          sendRefundEmail({
            to: order.buyer.email,
            name: order.buyer.name,
            recipientRole: "buyer",
            orderNumber: order.orderNumber,
            refundAmount: refundAmountFormatted,
            reason: input.reason,
            orderId: order.id,
            idempotencyKey: `refund-buyer-${result.refundId}`,
          }),
          sendRefundEmail({
            to: order.seller.email,
            name: order.seller.name,
            recipientRole: "seller",
            orderNumber: order.orderNumber,
            refundAmount: refundAmountFormatted,
            reason: input.reason,
            orderId: order.id,
            idempotencyKey: `refund-seller-${result.refundId}`,
          }),
        ]);
        emailResults.forEach((emailResult, index) => {
          if (emailResult.status === "rejected") {
            console.error(
              `Failed to send ${index === 0 ? "buyer" : "seller"} refund email:`,
              emailResult.reason,
            );
          }
        });
      }

      return {
        success: true,
        refundId: result.refundId,
        amountRefunded: result.amountRefunded,
        refundState: result.state,
        providerStatus: result.providerStatus,
      };
    }),

  // Retry a failed escrow transfer
  retryTransfer: adminProcedure
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.db.query.orders.findFirst({
        where: eq(orders.id, input.orderId),
        columns: {
          id: true,
          escrowStatus: true,
          transferFailedAt: true,
          shippedAt: true,
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found",
        });
      }

      if (!order.transferFailedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This order does not have a failed transfer",
        });
      }

      if (order.escrowStatus !== "held") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot retry transfer — escrow status is "${order.escrowStatus}"`,
        });
      }

      if (!order.shippedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot retry transfer without provider pickup evidence",
        });
      }

      // Re-fire the order/picked-up Inngest event
      await inngest.send({
        id: `retry-order-payout-${order.id}-${order.transferFailedAt.getTime()}`,
        name: "order/picked-up",
        data: {
          orderId: order.id,
          pickedUpAt: order.shippedAt.toISOString(),
          pickupConfirmed: true,
          source: "priority1",
        },
      });

      // The payout worker clears the failure marker only after a validated
      // transfer is persisted. Enqueue acceptance alone is not payout success.
      return { success: true, queued: true };
    }),

  // Get orders with failed transfers
  getFailedTransfers: adminProcedure.query(async ({ ctx }) => {
    const failedOrders = await ctx.db.query.orders.findMany({
      where: and(
        sql`${orders.transferFailedAt} IS NOT NULL`,
        eq(orders.escrowStatus, "held")
      ),
      orderBy: [desc(orders.transferFailedAt)],
      columns: {
        id: true,
        orderNumber: true,
        sellerPayout: true,
        escrowStatus: true,
        transferFailedAt: true,
        transferError: true,
      },
      with: {
        seller: {
          columns: { id: true, name: true, businessName: true },
        },
      },
    });

    return failedOrders;
  }),

  // ==========================================
  // Platform Settings
  // ==========================================

  // Get all settings as a key-value map
  getSettings: adminProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db
      .select()
      .from(platformSettings);

    // Merge defaults with stored values
    const settingsMap: Record<string, unknown> = { ...DEFAULT_SETTINGS };
    for (const setting of settings) {
      settingsMap[setting.key] = setting.value;
    }

    return settingsMap;
  }),

  // Update a single setting (upsert)
  updateSetting: adminProcedure
    .input(platformSettingUpdateInput)
    .mutation(async ({ ctx, input }) => {
      const value = parseMutablePlatformSetting(input.key, input.value);

      await ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ value: platformSettings.value })
          .from(platformSettings)
          .where(eq(platformSettings.key, input.key))
          .for("update");

        await tx
          .insert(platformSettings)
          .values({
            key: input.key,
            value,
            updatedAt: new Date(),
            updatedBy: ctx.user.id,
          })
          .onConflictDoUpdate({
            target: platformSettings.key,
            set: {
              value,
              updatedAt: new Date(),
              updatedBy: ctx.user.id,
            },
          });

        await appendAuditEvent(tx, {
          actorType: "admin",
          actorId: ctx.user.id,
          action: "platform_setting.updated",
          entityType: "platform_setting",
          entityId: input.key,
          summary: `Updated platform setting ${input.key}.`,
          metadata: {
            previousValue: existing?.value ?? null,
            nextValue: value,
          },
        });
      });

      return { success: true };
    }),

  // Batch update settings
  updateSettings: adminProcedure
    .input(
      z
        .array(platformSettingUpdateInput)
        .min(1)
        .max(10)
        .superRefine((updates, ctx) => {
          const keys = updates.map((update) => update.key);
          if (new Set(keys).size !== keys.length) {
            ctx.addIssue({
              code: "custom",
              message: "Each platform setting may be updated only once per request.",
            });
          }
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const parsedUpdates = input.map(({ key, value }) => ({
        key,
        value: parseMutablePlatformSetting(key, value),
      }));

      await ctx.db.transaction(async (tx) => {
        for (const { key, value } of parsedUpdates) {
          const [existing] = await tx
            .select({ value: platformSettings.value })
            .from(platformSettings)
            .where(eq(platformSettings.key, key))
            .for("update");

          await tx
            .insert(platformSettings)
            .values({
              key,
              value,
              updatedAt: new Date(),
              updatedBy: ctx.user.id,
            })
            .onConflictDoUpdate({
              target: platformSettings.key,
              set: {
                value,
                updatedAt: new Date(),
                updatedBy: ctx.user.id,
              },
            });

          await appendAuditEvent(tx, {
            actorType: "admin",
            actorId: ctx.user.id,
            action: "platform_setting.updated",
            entityType: "platform_setting",
            entityId: key,
            summary: `Updated platform setting ${key}.`,
            metadata: {
              previousValue: existing?.value ?? null,
              nextValue: value,
            },
          });
        }
      });

      return { success: true, count: parsedUpdates.length };
    }),

  // ==========================================
  // Priority1 Shipment Management
  // ==========================================

  // Get paginated shipments with filters
  getShipments: adminProcedure
    .input(
      z.object({
        status: z.enum(shipmentStatusEnum.enumValues).optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const conditions = [];

      if (input.status) {
        conditions.push(eq(shipments.status, input.status));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const shipmentsList = await ctx.db.query.shipments.findMany({
        where: whereClause,
        orderBy: [desc(shipments.createdAt)],
        limit: input.limit,
        offset,
        with: {
          order: {
            columns: {
              id: true,
              orderNumber: true,
              buyerId: true,
              sellerId: true,
              carrierRate: true,
              shippingPrice: true,
              freightFundingMode: true,
              buyerFreightCharge: true,
              sellerFreightContribution: true,
              shippingMargin: true,
            },
          },
        },
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(shipments)
        .where(whereClause);

      return {
        items: shipmentsList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Re-poll shipment status from Priority1
  repollShipment: adminProcedure
    .input(
      z.object({
        shipmentId: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const shipment = await ctx.db.query.shipments.findFirst({
        where: eq(shipments.id, input.shipmentId),
        with: {
          order: {
            columns: {
              id: true,
              orderNumber: true,
              status: true,
              shippedAt: true,
              deliveredAt: true,
              trackingNumber: true,
            },
          },
        },
      });

      if (!shipment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Shipment not found",
        });
      }

      // Get status from Priority1
      const statusResponse = await priority1.getStatus({
        identifierType: "CUSTOMER_REFERENCE",
        identifierValue: shipment.order.orderNumber,
      });

      const providerDryRun = priority1.isDryRun();
      let p1Shipment;
      try {
        p1Shipment = selectPriority1Shipment(
          statusResponse,
          providerDryRun ? null : shipment.priority1ShipmentId,
        );
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Priority1 shipment identity is ambiguous",
          cause: error,
        });
      }
      if (!p1Shipment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No tracking information found from Priority1",
        });
      }

      const statusUpdate = mapPriority1ShipmentStatus(
        shipment.status,
        p1Shipment,
      );
      const terminalOrder = ["cancelled", "refunded"].includes(
        shipment.order.status,
      );
      const statusProNumber = getShipmentIdentifier(
        p1Shipment.shipmentIdentifiers,
        "PRO",
      );
      const statusBolNumber = getShipmentIdentifier(
        p1Shipment.shipmentIdentifiers,
        "BILL_OF_LADING",
      );
      const proNumber = shipment.proNumber || statusProNumber || null;
      const bolNumber = shipment.bolNumber || statusBolNumber || null;
      const trackingNumber =
        shipment.order.trackingNumber || proNumber || bolNumber || null;
      const pickupAt = statusUpdate.pickupConfirmedAt ?? new Date();
      const deliveredAt = statusUpdate.deliveredAt ?? new Date();

      const needsPickupEvent = shouldEmitProviderPickupEvent({
        statusUpdate,
        orderStatus: shipment.order.status,
        shippedAt: shipment.order.shippedAt,
        dryRun: providerDryRun,
      });

      if (statusUpdate.mappedStatus === "cancelled") {
        await openReconciliationCase(ctx.db, {
          caseKey: `shipment-provider-cancelled:${shipment.orderId}`,
          type: "shipment_ambiguity",
          source: "priority1",
          severity: "high",
          title: "Priority1 shipment is cancelled",
          summary:
            "Priority1 reports the shipment as cancelled; order requires reconciliation.",
          orderId: shipment.orderId,
          externalReference:
            shipment.priority1ShipmentId ?? String(p1Shipment.id),
          details: {
            shipmentId: shipment.id,
            orderNumber: shipment.order.orderNumber,
            priority1ShipmentId: String(p1Shipment.id),
            proNumber,
            bolNumber,
          },
        });
      }

      // Commit live-provider evidence before the payout event can execute.
      const [updatedShipment] = await ctx.db
        .update(shipments)
        .set({
          status: statusUpdate.mappedStatus,
          trackingEvents: mergeTrackingEvents(
            shipment.trackingEvents,
            statusUpdate.trackingEvents,
          ),
          carrierScac: p1Shipment.carrierCode || shipment.carrierScac,
          carrierName: p1Shipment.carrierName || shipment.carrierName,
          priority1ShipmentId: String(p1Shipment.id),
          proNumber: proNumber ?? shipment.proNumber,
          bolNumber: bolNumber ?? shipment.bolNumber,
          isDryRun: providerDryRun,
          deliveredAt: statusUpdate.delivered
            ? deliveredAt
            : shipment.deliveredAt,
          lastError:
            statusUpdate.mappedStatus === "cancelled"
              ? "Priority1 shipment is cancelled; order requires reconciliation"
              : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(shipments.id, input.shipmentId),
            notInArray(shipments.status, ["cancelled"]),
            isNull(shipments.cancellationRequestedAt),
            isNull(shipments.cancellationClaimToken),
          ),
        )
        .returning();

      if (!updatedShipment) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Shipment was cancelled or cancellation-claimed before admin sync could persist Priority1 evidence",
        });
      }

      if (
        trackingNumber &&
        trackingNumber !== shipment.order.trackingNumber
      ) {
        await ctx.db
          .update(orders)
          .set({
            trackingNumber,
            ...(p1Shipment.carrierName
              ? { carrier: p1Shipment.carrierName }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, shipment.orderId));
      }

      if (needsPickupEvent) {
        await inngest.send({
          id: `priority1-pickup-${shipment.id}`,
          name: "order/picked-up",
          data: {
            orderId: shipment.orderId,
            pickedUpAt: pickupAt.toISOString(),
            pickupConfirmed: true,
            source: "priority1",
          },
        });
      }

      if (
        statusUpdate.pickupConfirmed &&
        statusUpdate.mappedStatus !== "cancelled" &&
        !terminalOrder
      ) {
        await ctx.db
          .update(orders)
          .set({
            status: statusUpdate.delivered ? "delivered" : "shipped",
            shippedAt: shipment.order.shippedAt ?? pickupAt,
            deliveredAt: statusUpdate.delivered
              ? deliveredAt
              : shipment.order.deliveredAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(orders.id, shipment.orderId),
              notInArray(orders.status, ["cancelled", "refunded"]),
            ),
          );
      }

      return updatedShipment;
    }),

  // Get shipping aggregate statistics
  getShippingStats: adminProcedure.query(async ({ ctx }) => {
    // Get shipment counts
    const [shipmentCounts] = await ctx.db
      .select({
        totalShipments: sql<number>`cast(count(*) as integer)`,
        activeShipments: sql<number>`cast(count(*) filter (where status IN ('dispatched', 'in_transit', 'out_for_delivery')) as integer)`,
      })
      .from(shipments);

    // Get revenue totals from orders with shipments (join to ensure they have shipping)
    const [revenueTotals] = await ctx.db
      .select({
        totalFreightBooked:
          sql<number>`coalesce(sum(${orders.shippingPrice}), 0)`,
        totalBuyerFreightCharges:
          sql<number>`coalesce(sum(${orders.buyerFreightCharge}), 0)`,
        totalSellerFreightContributions:
          sql<number>`coalesce(sum(${orders.sellerFreightContribution}), 0)`,
        totalMargin: sql<number>`coalesce(sum(${orders.shippingMargin}), 0)`,
      })
      .from(orders)
      .innerJoin(shipments, eq(shipments.orderId, orders.id));

    return {
      totalShipments: shipmentCounts.totalShipments,
      activeShipments: shipmentCounts.activeShipments,
      totalFreightBooked: revenueTotals.totalFreightBooked,
      totalBuyerFreightCharges: revenueTotals.totalBuyerFreightCharges,
      totalSellerFreightContributions:
        revenueTotals.totalSellerFreightContributions,
      totalMargin: revenueTotals.totalMargin,
    };
  }),

  // ==========================================
  // Content Moderation
  // ==========================================

  // Get content violations with pagination
  getContentViolations: adminProcedure
    .input(
      z.object({
        reviewed: z.boolean().optional(),
        userId: z.string().uuid().optional(),
        contentType: z.string().optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const conditions = [];
      if (input.reviewed !== undefined) {
        conditions.push(eq(contentViolations.reviewed, input.reviewed));
      }
      if (input.userId) {
        conditions.push(eq(contentViolations.userId, input.userId));
      }
      if (input.contentType) {
        conditions.push(eq(contentViolations.contentType, input.contentType));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const violationsList = await ctx.db.query.contentViolations.findMany({
        where: whereClause,
        orderBy: [desc(contentViolations.createdAt)],
        limit: input.limit,
        offset,
        with: {
          user: {
            columns: {
              id: true,
              name: true,
              email: true,
              businessName: true,
              role: true,
            },
          },
        },
      });

      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(contentViolations)
        .where(whereClause);

      return {
        violations: violationsList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Review a content violation
  reviewContentViolation: adminProcedure
    .input(
      z.object({
        violationId: z.string().uuid(),
        falsePositive: z.boolean(),
        adminNotes: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const violation = await ctx.db.query.contentViolations.findFirst({
        where: eq(contentViolations.id, input.violationId),
      });

      if (!violation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Violation not found",
        });
      }

      const [updated] = await ctx.db
        .update(contentViolations)
        .set({
          reviewed: true,
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
          falsePositive: input.falsePositive,
          adminNotes: input.adminNotes,
        })
        .where(eq(contentViolations.id, input.violationId))
        .returning();

      return updated;
    }),
});
