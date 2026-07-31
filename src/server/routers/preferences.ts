import {
  createTRPCRouter,
  protectedProcedure,
  sellerProcedure,
  strictSellerProcedure,
} from "../trpc";
import {
  sellerCommercialDefaultsSchema,
  upsertPreferencesSchema,
  type SellerCommercialDefaults,
} from "@/lib/validators/preferences";
import { userPreferences } from "../db/schema/user-preferences";
import {
  agentActions,
  listings,
  offers,
  orders,
  sampleRequests,
} from "../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { resolveSellerDefaultsListingUpdate } from "@/lib/seller-defaults-apply";
import type { db as applicationDb } from "../db";

const NEGOTIATION_WARNING_STATUSES = ["pending", "countered"] as const;
const ACTIVE_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
] as const;
const OPEN_SAMPLE_REQUEST_STATUSES = [
  "requested",
  "approved",
  "shipped",
] as const;

type QueryExecutor = Pick<typeof applicationDb, "select">;

type ActiveListingApplyPlan = {
  activeListingCount: number;
  eligibleListingCount: number;
  changedListingCount: number;
  unchangedListingCount: number;
  skippedAcceptedOfferListingCount: number;
  skippedAcceptedOfferCount: number;
  warnings: {
    pendingOrCounteredOfferCount: number;
    listingsWithPendingOrCounteredOffers: number;
    activeOrderCount: number;
    listingsWithActiveOrders: number;
    openSampleRequestCount: number;
    listingsWithOpenSampleRequests: number;
  };
  resolutions: ReturnType<typeof resolveSellerDefaultsListingUpdate>[];
};

function uniqueListingCount(
  rows: ReadonlyArray<{ listingId: string }>,
): number {
  return new Set(rows.map((row) => row.listingId)).size;
}

async function buildActiveListingApplyPlan(input: {
  executor: QueryExecutor;
  sellerId: string;
  defaults: SellerCommercialDefaults;
  now: Date;
  lockRows?: boolean;
}): Promise<ActiveListingApplyPlan> {
  const listingQuery = input.executor
    .select({
      id: listings.id,
      askPricePerSqFt: listings.askPricePerSqFt,
      allowOffers: listings.allowOffers,
      fullLotOnly: listings.fullLotOnly,
      partialQuantityMarkupPercent: listings.partialQuantityMarkupPercent,
      automaticMarkdownEnabled: listings.automaticMarkdownEnabled,
      automaticMarkdownFloorPercent: listings.automaticMarkdownFloorPercent,
      automaticMarkdownIntervalDays: listings.automaticMarkdownIntervalDays,
      automaticMarkdownStartedAt: listings.automaticMarkdownStartedAt,
      automaticMarkdownCurrentStep: listings.automaticMarkdownCurrentStep,
      automaticMarkdownLastAppliedAt:
        listings.automaticMarkdownLastAppliedAt,
      pricingRulesVersion: listings.pricingRulesVersion,
      allowSampleRequests: listings.allowSampleRequests,
      territoryMode: listings.territoryMode,
      allowedDestinationStates: listings.allowedDestinationStates,
      freightPaymentMode: listings.freightPaymentMode,
      sellerFreightStates: listings.sellerFreightStates,
      freightDropCharge: listings.freightDropCharge,
    })
    .from(listings)
    .where(
      and(
        eq(listings.sellerId, input.sellerId),
        eq(listings.status, "active"),
      ),
    );
  const activeListings = input.lockRows
    ? await listingQuery.for("update")
    : await listingQuery;

  if (activeListings.length === 0) {
    return {
      activeListingCount: 0,
      eligibleListingCount: 0,
      changedListingCount: 0,
      unchangedListingCount: 0,
      skippedAcceptedOfferListingCount: 0,
      skippedAcceptedOfferCount: 0,
      warnings: {
        pendingOrCounteredOfferCount: 0,
        listingsWithPendingOrCounteredOffers: 0,
        activeOrderCount: 0,
        listingsWithActiveOrders: 0,
        openSampleRequestCount: 0,
        listingsWithOpenSampleRequests: 0,
      },
      resolutions: [],
    };
  }

  const activeListingIds = activeListings.map((listing) => listing.id);
  const offerQuery = input.executor
    .select({
      id: offers.id,
      listingId: offers.listingId,
      status: offers.status,
      orderId: offers.orderId,
    })
    .from(offers)
    .where(
      and(
        eq(offers.sellerId, input.sellerId),
        inArray(offers.listingId, activeListingIds),
        inArray(offers.status, [
          "pending",
          "countered",
          "accepted",
        ]),
      ),
    );
  // Lock every live negotiation row during the write path. A pending offer
  // cannot become accepted between the skip decision and the listing update.
  const liveOffers = input.lockRows
    ? await offerQuery.for("update")
    : await offerQuery;

  const acceptedAwaitingCheckout = liveOffers.filter(
    (offer) => offer.status === "accepted" && offer.orderId == null,
  );
  const skippedListingIds = new Set(
    acceptedAwaitingCheckout.map((offer) => offer.listingId),
  );
  const eligibleListings = activeListings.filter(
    (listing) => !skippedListingIds.has(listing.id),
  );
  const eligibleListingIds = new Set(
    eligibleListings.map((listing) => listing.id),
  );
  const pendingOrCounteredOffers = liveOffers.filter(
    (offer) =>
      eligibleListingIds.has(offer.listingId) &&
      NEGOTIATION_WARNING_STATUSES.includes(
        offer.status as (typeof NEGOTIATION_WARNING_STATUSES)[number],
      ),
  );

  const [activeOrders, openSampleRequests] =
    eligibleListingIds.size > 0
      ? await Promise.all([
          input.executor
            .select({ id: orders.id, listingId: orders.listingId })
            .from(orders)
            .where(
              and(
                eq(orders.sellerId, input.sellerId),
                inArray(orders.listingId, [...eligibleListingIds]),
                inArray(orders.status, ACTIVE_ORDER_STATUSES),
              ),
            ),
          input.executor
            .select({
              id: sampleRequests.id,
              listingId: sampleRequests.listingId,
            })
            .from(sampleRequests)
            .where(
              and(
                eq(sampleRequests.sellerId, input.sellerId),
                inArray(sampleRequests.listingId, [...eligibleListingIds]),
                inArray(
                  sampleRequests.status,
                  OPEN_SAMPLE_REQUEST_STATUSES,
                ),
              ),
            ),
        ])
      : [[], []];

  const resolutions = eligibleListings.map((listing) =>
    resolveSellerDefaultsListingUpdate({
      listing,
      defaults: input.defaults,
      now: input.now,
    }),
  );
  const changedListingCount = resolutions.filter(
    (resolution) => resolution.changed,
  ).length;

  return {
    activeListingCount: activeListings.length,
    eligibleListingCount: eligibleListings.length,
    changedListingCount,
    unchangedListingCount: resolutions.length - changedListingCount,
    skippedAcceptedOfferListingCount: skippedListingIds.size,
    skippedAcceptedOfferCount: acceptedAwaitingCheckout.length,
    warnings: {
      pendingOrCounteredOfferCount: pendingOrCounteredOffers.length,
      listingsWithPendingOrCounteredOffers: uniqueListingCount(
        pendingOrCounteredOffers,
      ),
      activeOrderCount: activeOrders.length,
      listingsWithActiveOrders: uniqueListingCount(activeOrders),
      openSampleRequestCount: openSampleRequests.length,
      listingsWithOpenSampleRequests:
        uniqueListingCount(openSampleRequests),
    },
    resolutions,
  };
}

function publicApplySummary(plan: ActiveListingApplyPlan) {
  const { resolutions: _resolutions, ...summary } = plan;
  void _resolutions;
  return summary;
}

/**
 * Buyer preference fields used for profile completion scoring.
 */
const BUYER_CORE_FIELDS: Array<keyof typeof userPreferences.$inferSelect> = [
  "preferredZip",
  "preferredRadiusMiles",
  "preferredMaterialTypes",
  "priceMaxPerSqFt",
  "preferredShippingMode",
  "urgency",
];

/**
 * Seller preference fields used for profile completion scoring.
 */
const SELLER_CORE_FIELDS: Array<keyof typeof userPreferences.$inferSelect> = [
  "originZip",
  "shipCapable",
  "typicalMaterialTypes",
  "minLotSqFt",
  "preferredBuyerRadiusMiles",
  "pricingStyle",
  "leadTimeDaysMin",
];

/**
 * Returns a list of fields that are filled (non-null, non-empty) from a preferences record.
 */
function getFilledFields(
  prefs: typeof userPreferences.$inferSelect,
  fields: Array<keyof typeof userPreferences.$inferSelect>
): Array<keyof typeof userPreferences.$inferSelect> {
  return fields.filter((field) => {
    const value = prefs[field];
    if (value === null || value === undefined) return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  });
}

export const preferencesRouter = createTRPCRouter({
  /**
   * Upsert the current user's preferences. Role is validated against the user's
   * actual profile role — input role must match. Uses onConflictDoUpdate on userId.
   */
  upsert: protectedProcedure
    .input(upsertPreferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const userRole = ctx.user.role;

      // Validate that the role in input matches the user's actual role.
      // Admins may set either role.
      if (userRole !== "admin" && input.role !== userRole) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You can only set ${userRole} preferences (your account role is ${userRole})`,
        });
      }

      const now = new Date();

      // Build the upsert payload from input, spreading role-specific fields.
      // Explicitly clear dependent seller fields when their parent option is
      // disabled so saved defaults can never retain a contradictory hidden
      // state from an earlier form submission.
      const { role, ...inputRoleFields } = input;
      const roleFields: Record<string, unknown> = { ...inputRoleFields };
      if (role === "seller") {
        if (roleFields.canSplitLots === false) {
          roleFields.partialQuantityMarkupPercent = null;
        }
        if (roleFields.automaticMarkdownEnabled === false) {
          roleFields.automaticMarkdownFloorPercent = null;
          roleFields.automaticMarkdownIntervalDays = null;
        }
        if (roleFields.sellingTerritoryMode === "unrestricted") {
          roleFields.allowedDestinationStates = [];
        }
        if (roleFields.freightPaymentMode === "buyer_pays") {
          roleFields.sellerFreightStates = [];
          roleFields.freightDropCharge = null;
        }
      }

      // Determine whether the profile should be considered complete
      // by checking if enough core fields are filled after this upsert.
      const coreFields =
        role === "buyer" ? BUYER_CORE_FIELDS : SELLER_CORE_FIELDS;
      const COMPLETION_THRESHOLD = Math.ceil(coreFields.length * 0.7); // 70% filled

      // Count how many of the core fields will be filled post-upsert
      const filledCount = coreFields.filter((field) => {
        const key = field as keyof typeof roleFields;
        const value = roleFields[key as string];
        if (value === undefined || value === null) return false;
        if (Array.isArray(value) && value.length === 0) return false;
        return true;
      }).length;

      const profileComplete = filledCount >= COMPLETION_THRESHOLD;

      const [result] = await ctx.db
        .insert(userPreferences)
        .values({
          userId: ctx.user.id,
          role,
          ...roleFields,
          profileComplete,
          completedAt: profileComplete ? now : null,
          updatedAt: now,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: {
            ...roleFields,
            profileComplete,
            completedAt: profileComplete ? now : null,
            updatedAt: now,
          },
        })
        .returning();

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save preferences",
        });
      }

      return result;
    }),

  /**
   * Read-only preview for the seller's explicit "apply to active listings"
   * choice. The default Save path never calls this and remains future-listing
   * only.
   */
  previewActiveListingDefaultsApply: sellerProcedure
    .input(sellerCommercialDefaultsSchema)
    .query(async ({ ctx, input }) => {
      try {
        const plan = await buildActiveListingApplyPlan({
          executor: ctx.db,
          sellerId: ctx.user.id,
          defaults: input,
          now: new Date(),
        });
        return publicApplySummary(plan);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "These defaults do not form a valid listing pricing and selling-rule bundle.",
            cause: error,
          });
        }
        throw error;
      }
    }),

  /**
   * Explicit, confirmed fan-out of the complete commercial default bundle.
   * Active rows and live negotiations are locked and all writes plus per-row
   * audit entries commit in one database transaction.
   */
  applySellerDefaultsToActiveListings: strictSellerProcedure
    .input(
      z.object({
        defaults: sellerCommercialDefaultsSchema,
        confirmed: z.literal(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();

      try {
        const plan = await ctx.db.transaction(async (tx) => {
          const lockedPlan = await buildActiveListingApplyPlan({
            executor: tx,
            sellerId: ctx.user.id,
            defaults: input.defaults,
            now,
            lockRows: true,
          });

          for (const resolution of lockedPlan.resolutions) {
            if (!resolution.changed) continue;

            const [updated] = await tx
              .update(listings)
              .set({
                ...resolution.update,
                updatedAt: now,
              })
              .where(
                and(
                  eq(listings.id, resolution.listingId),
                  eq(listings.sellerId, ctx.user.id),
                  eq(listings.status, "active"),
                ),
              )
              .returning({ id: listings.id });

            if (!updated) {
              throw new TRPCError({
                code: "CONFLICT",
                message:
                  "An active listing changed while defaults were being applied. No listings were updated.",
              });
            }

            await tx.insert(agentActions).values({
              userId: ctx.user.id,
              actionType: "seller_defaults_applied",
              relatedId: resolution.listingId,
              details: {
                source: "seller_preferences",
                appliedAt: now.toISOString(),
                before: resolution.before,
                after: resolution.after,
              },
            });
          }

          return lockedPlan;
        });

        return publicApplySummary(plan);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "These defaults do not form a valid listing pricing and selling-rule bundle. No listings were updated.",
            cause: error,
          });
        }
        throw error;
      }
    }),

  /**
   * Get the current user's preferences record, or null if not yet set.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await ctx.db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, ctx.user.id),
    });

    return prefs ?? null;
  }),

  /**
   * Returns a completion status breakdown for the user's preferences.
   * Shows how many core fields are filled, total fields, percentage, and which are missing.
   */
  getCompletionStatus: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await ctx.db.query.userPreferences.findFirst({
      where: eq(userPreferences.userId, ctx.user.id),
    });

    if (!prefs) {
      const role = ctx.user.role === "seller" ? "seller" : "buyer";
      const coreFields = role === "buyer" ? BUYER_CORE_FIELDS : SELLER_CORE_FIELDS;
      return {
        filledCount: 0,
        totalFields: coreFields.length,
        completionPercent: 0,
        missingFields: coreFields as string[],
        profileComplete: false,
      };
    }

    const coreFields =
      prefs.role === "buyer" ? BUYER_CORE_FIELDS : SELLER_CORE_FIELDS;

    const filledFields = getFilledFields(prefs, coreFields);
    const missingFields = coreFields.filter(
      (f) => !filledFields.includes(f)
    );

    return {
      filledCount: filledFields.length,
      totalFields: coreFields.length,
      completionPercent: Math.round(
        (filledFields.length / coreFields.length) * 100
      ),
      missingFields: missingFields as string[],
      profileComplete: prefs.profileComplete,
    };
  }),
});
