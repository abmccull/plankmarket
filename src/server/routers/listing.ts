import {
  createTRPCRouter,
  publicReadProcedure,
  sellerProcedure,
} from "../trpc";
import {
  listingFormSchema,
  listingFormUpdateSchema,
  listingFilterSchema,
  MAX_PUBLIC_LISTING_RESULT_WINDOW,
  csvListingRowSchema,
  listingSellingRulesSchema,
} from "@/lib/validators/listing";
import {
  listings,
  media,
  notifications,
  orders,
  users,
  userPreferences,
} from "../db/schema";
import { eq, and, sql, gte, lte, inArray, desc, asc, ilike, or, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import zipcodes from "zipcodes";
import { priority1 } from "@/server/services/priority1";
import { redis } from "@/lib/redis/client";
import { slugify } from "@/lib/utils";
import { getFreightDefaults } from "@/lib/constants/freight-defaults";
import { isPro, FREE_LIMITS } from "@/lib/pro";
import { deriveListingTrustFields } from "@/lib/listing-trust";
import {
  applyUserPreferenceDefaultsToListing,
  getSellerListingPreferenceDefaults,
  PRICING_RULES_VERSION,
  resolveAutomaticMarkdownPersistence,
} from "@/lib/selling-rules";
import { toSellerPurchaseConfig } from "@/lib/seller-purchase-config";
import {
  publicListingColumns,
  publicListingCardColumns,
  publicMediaColumns,
  publicSellerColumns,
  toPublicListing,
  toPublicListingCard,
} from "@/server/security/public-data";
import {
  getListingBoundingBoxConditions,
  getListingDistanceMilesSql,
} from "@/server/db/expressions/listing-geo";
import {
  assertListingVisibleToViewer,
  publicActiveListingWhere,
} from "@/server/security/listing-visibility";
import { inngest } from "@/lib/inngest/client";
import { buildListingCreatedEvent } from "@/lib/inngest/events";
import {
  getDirectPurchaseLotValueSql,
  getDirectPurchaseUnitPriceSql,
} from "@/server/db/expressions/listing-pricing";
import { appendAuditEvent } from "@/server/services/audit-ledger";
import {
  buildPublicReadCacheKey,
  readPublicReadCache,
  writePublicReadCache,
} from "@/server/services/public-read-cache";

type PublicListingDto = ReturnType<typeof toPublicListingCard>;
type PublicListingBrowseResponse = {
  items: Array<PublicListingDto & { isPromoted: boolean }>;
  total: number;
  totalIsExact: boolean;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
};

const LISTING_SELLING_RULE_FIELD_KEYS = [
  "fullLotOnly",
  "partialQuantityMarkupPercent",
  "automaticMarkdownEnabled",
  "automaticMarkdownFloorPercent",
  "automaticMarkdownIntervalDays",
  "allowSampleRequests",
  "territoryMode",
  "allowedDestinationStates",
  "freightPaymentMode",
  "sellerFreightStates",
  "freightDropCharge",
] as const;

const UNRELEASED_INVENTORY_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "cancelled",
] as const;

function hasOwnKey<T extends object>(
  value: T,
  key: PropertyKey,
): key is keyof T {
  return Object.prototype.hasOwnProperty.call(value, key);
}

async function getSellerListingDefaultsForUser(
  ctx: { db: typeof import("../db").db },
  userId: string,
) {
  const existing = await ctx.db.query.userPreferences.findFirst({
    where: eq(userPreferences.userId, userId),
  });

  return getSellerListingPreferenceDefaults(existing);
}

function formatSellingRuleValidationMessage(
  issues: { path: PropertyKey[]; message: string }[],
) {
  return issues
    .map((issue) => {
      const field = issue.path[0];
      return typeof field === "string"
        ? `${field}: ${issue.message}`
        : issue.message;
    })
    .join("; ");
}

function resolveValidatedSellingRuleFields(
  input: Parameters<typeof applyUserPreferenceDefaultsToListing>[0],
  sellerDefaults: Awaited<ReturnType<typeof getSellerListingDefaultsForUser>>,
) {
  const merged = applyUserPreferenceDefaultsToListing(input, sellerDefaults);
  const parsed = listingSellingRulesSchema.safeParse(merged);

  if (!parsed.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Saved seller commercial defaults conflict with this listing. ${formatSellingRuleValidationMessage(
        parsed.error.issues,
      )}`,
      cause: parsed.error,
    });
  }

  return parsed.data;
}

export const listingRouter = createTRPCRouter({
  // Create a new listing
  create: sellerProcedure
    .input(listingFormSchema)
    .mutation(async ({ ctx, input }) => {
      // Free-tier listing limit check
      if (!isPro(ctx.user)) {
        const [activeCount] = await ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(listings)
          .where(and(
            eq(listings.sellerId, ctx.user.id),
            eq(listings.status, "active"),
          ));
        if ((activeCount?.count ?? 0) >= FREE_LIMITS.activeListings) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Free accounts are limited to ${FREE_LIMITS.activeListings} active listings. Upgrade to Pro for unlimited listings.`,
          });
        }
      }

      const {
        mediaIds,
        automaticMarkdownStartedAt,
        automaticMarkdownCurrentStep,
        automaticMarkdownLastAppliedAt,
        pricingRulesVersion,
        ...listingData
      } = input;
      void automaticMarkdownStartedAt;
      void automaticMarkdownCurrentStep;
      void automaticMarkdownLastAppliedAt;
      void pricingRulesVersion;
      const sellerDefaults = await getSellerListingDefaultsForUser(
        ctx,
        ctx.user.id,
      );
      const sellingRuleFields = resolveValidatedSellingRuleFields(
        {
          fullLotOnly: listingData.fullLotOnly,
          partialQuantityMarkupPercent: listingData.partialQuantityMarkupPercent,
          automaticMarkdownEnabled: listingData.automaticMarkdownEnabled,
          automaticMarkdownFloorPercent:
            listingData.automaticMarkdownFloorPercent,
          automaticMarkdownIntervalDays:
            listingData.automaticMarkdownIntervalDays,
          allowSampleRequests: listingData.allowSampleRequests,
          territoryMode: listingData.territoryMode,
          allowedDestinationStates: listingData.allowedDestinationStates,
          freightPaymentMode: listingData.freightPaymentMode,
          sellerFreightStates: listingData.sellerFreightStates,
          freightDropCharge: listingData.freightDropCharge,
        },
        sellerDefaults,
      );

      // Geo-lookup from ZIP code + auto-derive city/state
      let locationLat: number | undefined;
      let locationLng: number | undefined;
      if (listingData.locationZip) {
        const zipInfo = zipcodes.lookup(listingData.locationZip);
        if (zipInfo) {
          locationLat = zipInfo.latitude;
          locationLng = zipInfo.longitude;
          if (!listingData.locationCity) listingData.locationCity = zipInfo.city;
          if (!listingData.locationState) listingData.locationState = zipInfo.state;
        }
      }
      const now = new Date();
      const markdownFields = resolveAutomaticMarkdownPersistence({
        next: {
          askPricePerSqFt: listingData.askPricePerSqFt,
          automaticMarkdownEnabled: sellingRuleFields.automaticMarkdownEnabled,
          automaticMarkdownFloorPercent:
            sellingRuleFields.automaticMarkdownFloorPercent,
          automaticMarkdownIntervalDays:
            sellingRuleFields.automaticMarkdownIntervalDays,
        },
        now,
      });
      const [listing] = await ctx.db
        .insert(listings)
        .values({
          ...listingData,
          ...sellingRuleFields,
          ...markdownFields,
          sellerId: ctx.user.id,
          status: "active",
          publishedAt: now,
          originalTotalSqFt: listingData.totalSqFt,
          originalAskPricePerSqFt: listingData.askPricePerSqFt,
          pricingRulesVersion: PRICING_RULES_VERSION,
          locationLat,
          locationLng,
          expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), // 90 days
        })
        .returning();

      // Generate and update slug (title + first 6 chars of UUID for uniqueness)
      const slug = `${slugify(input.title)}-${listing.id.slice(0, 6)}`;
      await ctx.db
        .update(listings)
        .set({ slug })
        .where(eq(listings.id, listing.id));

      // Link uploaded media to the listing (only unclaimed media)
      if (mediaIds && mediaIds.length > 0) {
        await ctx.db
          .update(media)
          .set({ listingId: listing.id })
          .where(
            and(
              inArray(media.id, mediaIds),
              isNull(media.listingId),
              isNull(media.buyerRequestId),
              eq(media.uploaderId, ctx.user.id),
            )
          );
      }

      const [photoCountResult] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(media)
        .where(eq(media.listingId, listing.id));
      const photoCount = photoCountResult?.count ?? 0;

      const [trustedListing] = await ctx.db
        .update(listings)
        .set(
          deriveListingTrustFields(
            {
              ...listing,
              photoCount,
            },
            now,
          ),
        )
        .where(eq(listings.id, listing.id))
        .returning();

      // Only call Priority1 for freight class if seller didn't provide one
      if (!listingData.freightClass && listingData.palletWeight && listingData.palletLength && listingData.palletWidth && listingData.palletHeight) {
        priority1.getSuggestedClass({
          totalWeight: listingData.palletWeight,
          length: listingData.palletLength,
          width: listingData.palletWidth,
          height: listingData.palletHeight,
          units: 1,
        }).then(async (result) => {
          await ctx.db
            .update(listings)
            .set({ freightClass: result.suggestedClass, updatedAt: new Date() })
            .where(eq(listings.id, listing.id));
        }).catch(() => {
          // Non-fatal: listing still saved without freight class
        });
      }

      try {
        await inngest.send(
          buildListingCreatedEvent({
            listingId: listing.id,
            sellerId: ctx.user.id,
          }),
        );
      } catch {
        console.error("Failed to enqueue listing/created event", {
          listingId: listing.id,
          sellerId: ctx.user.id,
        });
      }

      return trustedListing ?? listing;
    }),

  // Bulk create listings from CSV data
  bulkCreate: sellerProcedure
    .input(z.object({ rows: z.array(csvListingRowSchema).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // CSV bulk import is a Pro-only feature
      if (!isPro(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "CSV bulk import is a Pro feature. Upgrade to Pro to import listings from spreadsheets.",
        });
      }

      const batchId = crypto.randomUUID();
      const sellerDefaults = await getSellerListingDefaultsForUser(
        ctx,
        ctx.user.id,
      );

      const createdListings = await ctx.db.transaction(async (tx) => {
        const results = [];
        const confirmedAt = new Date();

        for (const row of input.rows) {
          let locationLat: number | undefined;
          let locationLng: number | undefined;
          if (row.locationZip) {
            const zipInfo = zipcodes.lookup(row.locationZip);
            if (zipInfo) {
              locationLat = zipInfo.latitude;
              locationLng = zipInfo.longitude;
              if (!row.locationCity) row.locationCity = zipInfo.city;
              if (!row.locationState) row.locationState = zipInfo.state;
            }
          }

          // Apply freight defaults from material type if not explicitly provided
          const freightDefaults = getFreightDefaults(row.materialType);
          const nmfcCode = row.nmfcCode ?? freightDefaults?.nmfcCode;
          const freightClass = row.freightClass ?? freightDefaults?.freightClass;
          const sellingRuleFields = resolveValidatedSellingRuleFields(
            {
              fullLotOnly: row.fullLotOnly,
              partialQuantityMarkupPercent:
                row.partialQuantityMarkupPercent,
              automaticMarkdownEnabled: row.automaticMarkdownEnabled,
              automaticMarkdownFloorPercent:
                row.automaticMarkdownFloorPercent,
              automaticMarkdownIntervalDays:
                row.automaticMarkdownIntervalDays,
              allowSampleRequests: row.allowSampleRequests,
              territoryMode: row.territoryMode,
              allowedDestinationStates: row.allowedDestinationStates,
              freightPaymentMode: row.freightPaymentMode,
              sellerFreightStates: row.sellerFreightStates,
              freightDropCharge: row.freightDropCharge,
            },
            sellerDefaults,
          );
          const markdownFields = resolveAutomaticMarkdownPersistence({
            next: {
              askPricePerSqFt: row.askPricePerSqFt,
              automaticMarkdownEnabled:
                sellingRuleFields.automaticMarkdownEnabled,
              automaticMarkdownFloorPercent:
                sellingRuleFields.automaticMarkdownFloorPercent,
              automaticMarkdownIntervalDays:
                sellingRuleFields.automaticMarkdownIntervalDays,
            },
            now: confirmedAt,
          });
          const trustFields = deriveListingTrustFields(
            {
              ...row,
              nmfcCode,
              freightClass,
              ...sellingRuleFields,
              ...markdownFields,
              sellerId: ctx.user.id,
              status: "draft",
              originalTotalSqFt: row.totalSqFt,
              locationLat,
              locationLng,
              allowOffers: true,
              certifications: [],
              photoCount: 0,
            },
            confirmedAt,
          );

          const [listing] = await tx
            .insert(listings)
            .values({
              ...row,
              nmfcCode,
              freightClass,
              ...sellingRuleFields,
              ...markdownFields,
              sellerId: ctx.user.id,
              status: "draft",
              originalTotalSqFt: row.totalSqFt,
              originalAskPricePerSqFt: row.askPricePerSqFt,
              locationLat,
              locationLng,
              allowOffers: true,
              pricingRulesVersion: PRICING_RULES_VERSION,
              certifications: [],
              ...trustFields,
              expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            })
            .returning();

          const slug = `${slugify(row.title)}-${listing.id.slice(0, 6)}`;
          await tx
            .update(listings)
            .set({ slug })
            .where(eq(listings.id, listing.id));

          results.push(listing);
        }

        return results;
      });

      // Fire-and-forget freight class calculations (only for rows without a freight class)
      for (const row of input.rows) {
        const rowFreightClass = row.freightClass ?? getFreightDefaults(row.materialType)?.freightClass;
        if (!rowFreightClass && row.palletWeight && row.palletLength && row.palletWidth && row.palletHeight) {
          const listing = createdListings.find((l) => l.title === row.title);
          if (listing) {
            priority1.getSuggestedClass({
              totalWeight: row.palletWeight,
              length: row.palletLength,
              width: row.palletWidth,
              height: row.palletHeight,
              units: 1,
            }).then(async (result) => {
              await ctx.db
                .update(listings)
                .set({ freightClass: result.suggestedClass, updatedAt: new Date() })
                .where(eq(listings.id, listing.id));
            }).catch(() => {});
          }
        }
      }

      // Create in-app notification
      await ctx.db.insert(notifications).values({
        userId: ctx.user.id,
        type: "system",
        title: "Bulk Upload Complete",
        message: `${createdListings.length} draft listing${createdListings.length !== 1 ? "s" : ""} created from CSV upload`,
        data: { batchId, count: createdListings.length },
      });

      return {
        batchId,
        listings: createdListings.map((l) => ({
          id: l.id,
          title: l.title,
          materialType: l.materialType,
          totalSqFt: l.totalSqFt,
          askPricePerSqFt: l.askPricePerSqFt,
        })),
        count: createdListings.length,
      };
    }),

  // Publish multiple draft listings that have photos
  publishBulk: sellerProcedure
    .input(z.object({ listingIds: z.array(z.string().uuid()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and draft status, and check for media
      const ownedListings = await ctx.db.query.listings.findMany({
        where: and(
          inArray(listings.id, input.listingIds),
          eq(listings.sellerId, ctx.user.id),
          eq(listings.status, "draft")
        ),
        with: {
          media: { columns: { id: true } },
        },
      });

      const publishable = ownedListings.filter((l) => l.media.length > 0);
      const skipped = ownedListings.filter((l) => l.media.length === 0);

      if (publishable.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No listings have photos to publish. Add photos before publishing.",
        });
      }

      // Free-tier listing limit check
      if (!isPro(ctx.user)) {
        const [activeCount] = await ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(listings)
          .where(and(
            eq(listings.sellerId, ctx.user.id),
            eq(listings.status, "active"),
          ));
        const currentActive = activeCount?.count ?? 0;
        if (currentActive + publishable.length > FREE_LIMITS.activeListings) {
          const canPublish = FREE_LIMITS.activeListings - currentActive;
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Free accounts are limited to ${FREE_LIMITS.activeListings} active listings. You can publish ${Math.max(0, canPublish)} more. Upgrade to Pro for unlimited.`,
          });
        }
      }

      const publishedIds = publishable.map((l) => l.id);
      const confirmedAt = new Date();
      await ctx.db.transaction(async (tx) => {
        for (const listing of publishable) {
          await tx
            .update(listings)
            .set({
              status: "active",
              publishedAt: confirmedAt,
              updatedAt: confirmedAt,
              ...deriveListingTrustFields(
                {
                  ...listing,
                  status: "active",
                  photoCount: listing.media.length,
                },
                confirmedAt,
              ),
            })
            .where(eq(listings.id, listing.id));
        }
      });

      try {
        await inngest.send(
          publishedIds.map((listingId) =>
            buildListingCreatedEvent({
              listingId,
              sellerId: ctx.user.id,
            }),
          ),
        );
      } catch {
        console.error("Failed to enqueue bulk listing/created events", {
          sellerId: ctx.user.id,
          listingCount: publishedIds.length,
        });
      }

      return {
        publishedCount: publishable.length,
        skippedCount: skipped.length,
        publishedIds,
      };
    }),

  // Update an existing listing
  update: sellerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: listingFormUpdateSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const {
        mediaIds,
        automaticMarkdownStartedAt,
        automaticMarkdownCurrentStep,
        automaticMarkdownLastAppliedAt,
        pricingRulesVersion,
        ...updateData
      } = input.data;
      void automaticMarkdownStartedAt;
      void automaticMarkdownCurrentStep;
      void automaticMarkdownLastAppliedAt;
      void pricingRulesVersion;
      const now = new Date();
      const { existing, updated } = await ctx.db.transaction(async (tx) => {
        // Listing checkout locks this same row before reserving inventory. Keeping
        // the quantity guard and update under the lock prevents a seller edit
        // from racing an in-flight reservation.
        const [lockedListing] = await tx
          .select()
          .from(listings)
          .where(
            and(
              eq(listings.id, input.id),
              eq(listings.sellerId, ctx.user.id),
            ),
          )
          .for("update");

        if (!lockedListing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found or you do not have permission to edit it",
          });
        }

        const quantityChanged =
          hasOwnKey(updateData, "totalSqFt") &&
          updateData.totalSqFt !== undefined &&
          Math.abs(updateData.totalSqFt - lockedListing.totalSqFt) > 0.0001;

        if (quantityChanged) {
          const [activeReservation] = await tx
            .select({ id: orders.id })
            .from(orders)
            .where(
              and(
                eq(orders.listingId, input.id),
                isNull(orders.inventoryReleasedAt),
                inArray(orders.status, [
                  ...UNRELEASED_INVENTORY_ORDER_STATUSES,
                ]),
              ),
            )
            .limit(1);

          if (activeReservation) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "Inventory quantity cannot be changed while an order is reserving this listing. Cancel or complete the order first.",
            });
          }
        }

        const sellingRuleUpdateTouched =
          hasOwnKey(updateData, "askPricePerSqFt") ||
          LISTING_SELLING_RULE_FIELD_KEYS.some((key) =>
            hasOwnKey(updateData, key),
          );
        const taxClassificationChanged =
          hasOwnKey(updateData, "materialType") &&
          updateData.materialType !== undefined &&
          updateData.materialType !== lockedListing.materialType;
        const invalidateVerifiedTaxCode =
          taxClassificationChanged &&
          lockedListing.taxCodeStatus === "verified";
        const markdownFields = sellingRuleUpdateTouched
          ? resolveAutomaticMarkdownPersistence({
              existing: lockedListing,
              next: {
                askPricePerSqFt:
                  updateData.askPricePerSqFt ?? lockedListing.askPricePerSqFt,
                automaticMarkdownEnabled:
                  updateData.automaticMarkdownEnabled ??
                  lockedListing.automaticMarkdownEnabled ??
                  false,
                automaticMarkdownFloorPercent:
                  updateData.automaticMarkdownFloorPercent ??
                  lockedListing.automaticMarkdownFloorPercent ??
                  null,
                automaticMarkdownIntervalDays:
                  updateData.automaticMarkdownIntervalDays ??
                  lockedListing.automaticMarkdownIntervalDays ??
                  null,
              },
              now,
            })
          : {};

        const [nextListing] = await tx
          .update(listings)
          .set({
            ...updateData,
            ...markdownFields,
            ...(sellingRuleUpdateTouched
              ? { pricingRulesVersion: PRICING_RULES_VERSION }
              : {}),
            ...(invalidateVerifiedTaxCode
              ? {
                  taxCodeStatus: "pending_review" as const,
                  taxCodeVerifiedAt: null,
                  taxCodeVerifiedBy: null,
                }
              : {}),
            updatedAt: now,
          })
          .where(
            and(
              eq(listings.id, input.id),
              eq(listings.sellerId, ctx.user.id),
            ),
          )
          .returning();

        if (!nextListing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Listing changed while it was being updated. Please retry.",
          });
        }

        if (invalidateVerifiedTaxCode) {
          await appendAuditEvent(tx, {
            actorType: "user",
            actorId: ctx.user.id,
            action: "listing.tax_code_review_required",
            entityType: "listing",
            entityId: lockedListing.id,
            summary:
              "A seller changed the listing material type; the prior tax-code approval now requires administrative review.",
            metadata: {
              previousMaterialType: lockedListing.materialType,
              nextMaterialType: nextListing.materialType,
              retainedTaxCode: lockedListing.stripeTaxCode,
              previousStatus: lockedListing.taxCodeStatus,
              nextStatus: nextListing.taxCodeStatus,
            },
          });
        }

        return { existing: lockedListing, updated: nextListing };
      });

      // Only claim unassigned uploads created by UploadThing's trusted callback
      // for this same account. Client-provided media UUIDs are not ownership.
      if (mediaIds && mediaIds.length > 0) {
        await ctx.db
          .update(media)
          .set({ listingId: input.id })
          .where(
            and(
              inArray(media.id, mediaIds),
              eq(media.uploaderId, ctx.user.id),
              isNull(media.listingId),
              isNull(media.buyerRequestId),
            ),
          );
      }

      const [photoCountResult] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(media)
        .where(eq(media.listingId, input.id));
      const photoCount = photoCountResult?.count ?? 0;

      const [trustedListing] = await ctx.db
        .update(listings)
        .set(
          deriveListingTrustFields(
            {
              ...updated,
              photoCount,
            },
            now,
          ),
        )
        .where(eq(listings.id, input.id))
        .returning();

      // Only call Priority1 for freight class if seller didn't provide one in this update
      // and the listing doesn't already have a seller-provided freight class
      const hasFreightClass = updateData.freightClass || (updated?.freightClass && !updateData.palletWeight && !updateData.palletLength && !updateData.palletWidth && !updateData.palletHeight);
      if (!hasFreightClass && (updateData.palletWeight || updateData.palletLength || updateData.palletWidth || updateData.palletHeight)) {
        const currentValues = {
          palletWeight: updateData.palletWeight ?? existing.palletWeight,
          palletLength: updateData.palletLength ?? existing.palletLength,
          palletWidth: updateData.palletWidth ?? existing.palletWidth,
          palletHeight: updateData.palletHeight ?? existing.palletHeight,
        };

        if (currentValues.palletWeight && currentValues.palletLength && currentValues.palletWidth && currentValues.palletHeight) {
          priority1.getSuggestedClass({
            totalWeight: currentValues.palletWeight,
            length: currentValues.palletLength,
            width: currentValues.palletWidth,
            height: currentValues.palletHeight,
            units: 1,
          }).then(async (result) => {
            await ctx.db
              .update(listings)
              .set({ freightClass: result.suggestedClass, updatedAt: new Date() })
              .where(eq(listings.id, input.id));
          }).catch(() => {
            // Non-fatal: listing still updated without freight class
          });
        }
      }

      return trustedListing;
    }),

  reconfirm: sellerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.listings.findFirst({
        where: and(
          eq(listings.id, input.id),
          eq(listings.sellerId, ctx.user.id),
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found or you do not have permission to edit it",
        });
      }

      if (existing.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only active listings can be reconfirmed",
        });
      }

      const [photoCountResult] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(media)
        .where(eq(media.listingId, input.id));
      const photoCount = photoCountResult?.count ?? 0;
      const confirmedAt = new Date();

      const [updated] = await ctx.db
        .update(listings)
        .set({
          updatedAt: confirmedAt,
          ...deriveListingTrustFields(
            {
              ...existing,
              photoCount,
            },
            confirmedAt,
          ),
        })
        .where(eq(listings.id, input.id))
        .returning();

      return updated;
    }),

  // Delete (archive) a listing
  delete: sellerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: listings.id })
          .from(listings)
          .where(
            and(
              eq(listings.id, input.id),
              eq(listings.sellerId, ctx.user.id),
            ),
          )
          .for("update");

        if (!existing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found",
          });
        }

        const [activeReservation] = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.listingId, input.id),
              isNull(orders.inventoryReleasedAt),
              inArray(orders.status, [
                ...UNRELEASED_INVENTORY_ORDER_STATUSES,
              ]),
            ),
          )
          .limit(1);

        if (activeReservation) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A listing cannot be archived while an order is reserving its inventory.",
          });
        }

        const [archived] = await tx
          .update(listings)
          .set({ status: "archived", updatedAt: new Date() })
          .where(
            and(
              eq(listings.id, input.id),
              eq(listings.sellerId, ctx.user.id),
            ),
          )
          .returning();

        return archived;
      });
    }),

  // Full listing data is only available to its owner (or an admin).
  getForEdit: sellerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: and(
          eq(listings.id, input.id),
          ctx.user.role === "admin"
            ? undefined
            : eq(listings.sellerId, ctx.user.id),
        ),
        with: {
          media: {
            orderBy: (media, { asc }) => [asc(media.sortOrder)],
          },
        },
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      return listing;
    }),

  // Get a single listing by ID (public)
  getById: publicReadProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.id),
        columns: publicListingColumns,
        with: {
          seller: {
            columns: publicSellerColumns,
          },
          media: {
            columns: publicMediaColumns,
            orderBy: (media, { asc }) => [asc(media.sortOrder)],
          },
        },
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      assertListingVisibleToViewer(listing, ctx.user);

      // Increment view count with Redis deduplication (fire-and-forget, non-fatal)
      (async () => {
        try {
          // Use authenticated user ID if available, otherwise use client IP
          const viewerIdentifier = ctx.authUser?.id ?? `ip:${ctx.clientIp}`;
          const viewKey = `listing-view:${input.id}:${viewerIdentifier}`;

          const reserved = await redis.set(viewKey, "1", {
            nx: true,
            ex: 3600,
          });
          if (reserved) {
            await ctx.db
              .update(listings)
              .set({ viewsCount: sql`${listings.viewsCount} + 1` })
              .where(eq(listings.id, input.id));
          }
        } catch {
          // Non-fatal: view count tracking failure should not break the listing view
          // Silently fail to ensure user experience is not affected
        }
      })();

      return toPublicListing(listing);
    }),

  // Get a single listing by slug (public)
  getBySlug: publicReadProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.slug, input.slug),
        columns: publicListingColumns,
        with: {
          seller: {
            columns: publicSellerColumns,
          },
          media: {
            columns: publicMediaColumns,
            orderBy: (media, { asc }) => [asc(media.sortOrder)],
          },
        },
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      assertListingVisibleToViewer(listing, ctx.user);

      // Increment view count with Redis deduplication (fire-and-forget, non-fatal)
      (async () => {
        try {
          // Use authenticated user ID if available, otherwise use client IP
          const viewerIdentifier = ctx.authUser?.id ?? `ip:${ctx.clientIp}`;
          const viewKey = `listing-view:${listing.id}:${viewerIdentifier}`;

          const reserved = await redis.set(viewKey, "1", {
            nx: true,
            ex: 3600,
          });
          if (reserved) {
            await ctx.db
              .update(listings)
              .set({ viewsCount: sql`${listings.viewsCount} + 1` })
              .where(eq(listings.id, listing.id));
          }
        } catch {
          // Non-fatal: view count tracking failure should not break the listing view
          // Silently fail to ensure user experience is not affected
        }
      })();

      return toPublicListing(listing);
    }),

  getPurchaseConfig: publicReadProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.listingId),
        columns: {
          id: true,
          sellerId: true,
          status: true,
          confirmationDueAt: true,
          lastConfirmedAt: true,
          fullLotOnly: true,
          partialQuantityMarkupPercent: true,
          allowSampleRequests: true,
          territoryMode: true,
          allowedDestinationStates: true,
        },
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      assertListingVisibleToViewer(listing, ctx.user);

      return toSellerPurchaseConfig({
        canSplitLots: !listing.fullLotOnly,
        partialQuantityMarkupPercent: listing.partialQuantityMarkupPercent,
        allowSampleRequests: listing.allowSampleRequests,
        sellingTerritoryMode: listing.territoryMode,
        allowedDestinationStates: listing.allowedDestinationStates,
      });
    }),

  // Search and filter listings (public)
  list: publicReadProcedure
    .input(listingFilterSchema)
    .query(async ({ ctx, input }) => {
      const anonymousCacheKey = ctx.user
        ? null
        : buildPublicReadCacheKey("listing-list", input);
      const cached = await readPublicReadCache<PublicListingBrowseResponse>(
        anonymousCacheKey,
      );
      if (cached) return cached;

      const publicNow = new Date();
      const conditions = [publicActiveListingWhere(publicNow, ctx.user)];
      const directPurchaseUnitPrice = getDirectPurchaseUnitPriceSql();
      const directPurchaseLotValue = getDirectPurchaseLotValueSql();

      // Text search (escape LIKE special characters to prevent wildcard injection)
      if (input.query) {
        const escapedQuery = input.query
          .replace(/\\/g, "\\\\")
          .replace(/%/g, "\\%")
          .replace(/_/g, "\\_");
        conditions.push(
          ilike(listings.searchDocument, `%${escapedQuery}%`),
        );
      }

      // Material type filter
      if (input.materialType && input.materialType.length > 0) {
        conditions.push(inArray(listings.materialType, input.materialType));
      }

      // Species filter
      if (input.species && input.species.length > 0) {
        conditions.push(inArray(listings.species, input.species));
      }

      // Color family filter
      if (input.colorFamily && input.colorFamily.length > 0) {
        conditions.push(inArray(listings.colorFamily, input.colorFamily));
      }

      // Finish type filter
      if (input.finishType && input.finishType.length > 0) {
        conditions.push(inArray(listings.finish, input.finishType));
      }

      // Width multi-select (match within ±0.1" tolerance)
      if (input.width && input.width.length > 0) {
        const widthConditions = input.width.map((w) =>
          and(gte(listings.width, w - 0.1), lte(listings.width, w + 0.1))
        );
        conditions.push(or(...widthConditions)!);
      }

      // Thickness multi-select (match within ±0.1" tolerance)
      if (input.thickness && input.thickness.length > 0) {
        const thicknessConditions = input.thickness.map((t) =>
          and(gte(listings.thickness, t - 0.1), lte(listings.thickness, t + 0.1))
        );
        conditions.push(or(...thicknessConditions)!);
      }

      // Wear layer multi-select (match within ±0.02mm tolerance)
      if (input.wearLayer && input.wearLayer.length > 0) {
        const wearConditions = input.wearLayer.map((w) =>
          and(gte(listings.wearLayer, w - 0.02), lte(listings.wearLayer, w + 0.02))
        );
        conditions.push(or(...wearConditions)!);
      }

      // Price range
      if (input.priceMin !== undefined) {
        conditions.push(gte(directPurchaseUnitPrice, input.priceMin));
      }
      if (input.priceMax !== undefined) {
        conditions.push(lte(directPurchaseUnitPrice, input.priceMax));
      }

      // Condition filter
      if (input.condition && input.condition.length > 0) {
        conditions.push(inArray(listings.condition, input.condition));
      }

      // Certification multi-select (match any selected certification)
      if (input.certifications && input.certifications.length > 0) {
        conditions.push(
          sql`coalesce(${listings.certifications}, '[]'::jsonb) ?| ${input.certifications}`,
        );
      }

      // State filter
      if (input.state && input.state.length > 0) {
        conditions.push(inArray(listings.locationState, input.state));
      }

      // Lot size range
      if (input.minLotSize !== undefined) {
        conditions.push(gte(listings.totalSqFt, input.minLotSize));
      }
      if (input.maxLotSize !== undefined) {
        conditions.push(lte(listings.totalSqFt, input.maxLotSize));
      }

      // Familiar marketplace confidence filters, backed by the same fields
      // used to construct the public listing evidence DTO.
      if (input.sellerVerified !== undefined) {
        conditions.push(sql<boolean>`(
          exists (
            select 1
            from ${users}
            where ${users.id} = ${listings.sellerId}
              and ${users.verificationStatus} = 'verified'
          )
        ) = ${input.sellerVerified}`);
      }

      if (input.freightReady !== undefined) {
        conditions.push(sql<boolean>`(
          ${listings.palletWeight} is not null
          and ${listings.palletLength} is not null
          and ${listings.palletWidth} is not null
          and ${listings.palletHeight} is not null
          and nullif(btrim(${listings.locationZip}), '') is not null
          and nullif(btrim(${listings.locationCity}), '') is not null
          and ${listings.locationState} is not null
          and nullif(btrim(${listings.freightClass}), '') is not null
          and ${listings.totalPallets} is not null
          and ${listings.sqFtPerBox} is not null
          and ${listings.boxesPerPallet} is not null
          and exists (
            select 1
            from ${users}
            where ${users.id} = ${listings.sellerId}
              and nullif(btrim(${users.businessAddress}), '') is not null
              and nullif(btrim(${users.phone}), '') is not null
          )
        ) = ${input.freightReady}`);
      }

      if (input.fullLotOnly !== undefined) {
        conditions.push(eq(listings.fullLotOnly, input.fullLotOnly));
      }

      // Distance filter (Haversine)
      let buyerLat: number | undefined;
      let buyerLng: number | undefined;
      if (input.buyerZip && input.maxDistance && input.maxDistance > 0) {
        const zipInfo = zipcodes.lookup(input.buyerZip);
        if (zipInfo) {
          buyerLat = zipInfo.latitude;
          buyerLng = zipInfo.longitude;
          conditions.push(
            ...getListingBoundingBoxConditions(
              { latitude: buyerLat, longitude: buyerLng },
              input.maxDistance,
            ),
          );
          conditions.push(
            sql`(${getListingDistanceMilesSql(buyerLat, buyerLng)}) <= ${input.maxDistance}`
          );
        }
      }

      // Promotion boost tiebreaker: promoted listings sort first
      const promotionBoost = desc(
        sql`CASE
          WHEN ${listings.promotionTier} IS NOT NULL AND ${listings.promotionExpiresAt} > NOW()
          THEN CASE ${listings.promotionTier}
            WHEN 'premium' THEN 3
            WHEN 'featured' THEN 2
            WHEN 'spotlight' THEN 1
            ELSE 0
          END
          ELSE 0
        END`
      );

      // Sort
      let userSort;
      switch (input.sort) {
        case "price_asc":
          userSort = asc(directPurchaseUnitPrice);
          break;
        case "price_desc":
          userSort = desc(directPurchaseUnitPrice);
          break;
        case "date_oldest":
          userSort = asc(listings.createdAt);
          break;
        case "lot_value_desc":
          userSort = desc(directPurchaseLotValue);
          break;
        case "lot_value_asc":
          userSort = asc(directPurchaseLotValue);
          break;
        case "popularity":
          userSort = desc(listings.viewsCount);
          break;
        case "proximity":
          if (buyerLat !== undefined && buyerLng !== undefined) {
            userSort = asc(getListingDistanceMilesSql(buyerLat, buyerLng));
          } else {
            userSort = desc(listings.createdAt);
          }
          break;
        case "date_newest":
        default:
          userSort = desc(listings.createdAt);
          break;
      }

      const orderByClause = [promotionBoost, userSort];

      const where = and(...conditions);
      const offset = (input.page - 1) * input.limit;

      const withClause = {
        media: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          orderBy: (media: any, { asc }: any) => [asc(media.sortOrder)],
          limit: 1,
          columns: publicMediaColumns,
        },
        seller: {
          columns: publicSellerColumns,
        },
      };

      const boundedCountSource = ctx.db
        .select({ id: listings.id })
        .from(listings)
        .where(where)
        .limit(MAX_PUBLIC_LISTING_RESULT_WINDOW + 1)
        .as("bounded_public_listing_count");

      const [items, countResult] = await Promise.all([
        ctx.db.query.listings.findMany({
          where,
          columns: publicListingCardColumns,
          with: withClause,
          orderBy: orderByClause,
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(boundedCountSource),
      ]);

      const promotionNow = new Date();
      const interleaved = items.map((item) => ({
        ...toPublicListingCard(item),
        isPromoted:
          item.promotionTier != null &&
          item.promotionExpiresAt != null &&
          item.promotionExpiresAt > promotionNow,
      }));

      const boundedCount = countResult[0]?.count ?? 0;
      const totalIsExact = boundedCount <= MAX_PUBLIC_LISTING_RESULT_WINDOW;
      const total = Math.min(
        boundedCount,
        MAX_PUBLIC_LISTING_RESULT_WINDOW,
      );

      const response: PublicListingBrowseResponse = {
        items: interleaved,
        total,
        totalIsExact,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        hasMore: offset + interleaved.length < total,
      };
      await writePublicReadCache(anonymousCacheKey, response, 20);
      return response;
    }),

  // Get seller's own listings
  getMyListings: sellerProcedure
    .input(
      z.object({
        status: z
          .enum(["draft", "active", "sold", "expired", "archived"])
          .optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(listings.sellerId, ctx.user.id)];

      if (input.status) {
        conditions.push(eq(listings.status, input.status));
      }

      const where = and(...conditions);
      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        ctx.db.query.listings.findMany({
          where,
          with: {
            media: {
              orderBy: (media, { asc }) => [asc(media.sortOrder)],
              limit: 1,
            },
          },
          orderBy: desc(listings.createdAt),
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(listings)
          .where(where),
      ]);

      const total = countResult[0]?.count ?? 0;

      return {
        items,
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        hasMore: offset + items.length < total,
      };
    }),

  // Get seller stats
  getSellerStats: sellerProcedure.query(async ({ ctx }) => {
    const stats = await ctx.db
      .select({
        status: listings.status,
        count: sql<number>`count(*)::int`,
        totalViews: sql<number>`coalesce(sum(${listings.viewsCount}), 0)::int`,
        totalSqFt: sql<number>`coalesce(sum(${listings.totalSqFt}), 0)::float`,
      })
      .from(listings)
      .where(eq(listings.sellerId, ctx.user.id))
      .groupBy(listings.status);

    return stats;
  }),

  // Get trending/popular listings (public)
  getTrending: publicReadProcedure
    .input(z.object({ limit: z.number().int().positive().max(12).default(6) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 6;
      const anonymousCacheKey = ctx.user
        ? null
        : buildPublicReadCacheKey("listing-trending", { limit });
      const cached = await readPublicReadCache<PublicListingDto[]>(
        anonymousCacheKey,
      );
      if (cached) return cached;

      const items = await ctx.db.query.listings.findMany({
        where: publicActiveListingWhere(new Date(), ctx.user),
        columns: publicListingCardColumns,
        with: {
          media: {
            columns: publicMediaColumns,
            orderBy: (media, { asc }) => [asc(media.sortOrder)],
            limit: 1,
          },
          seller: {
            columns: publicSellerColumns,
          },
        },
        orderBy: desc(listings.viewsCount),
        limit,
      });
      const response = items.map(toPublicListingCard);
      await writePublicReadCache(anonymousCacheKey, response, 30);
      return response;
    }),
});
