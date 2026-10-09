import { listingPalletMinimumSchema } from "@/lib/validators/listing";
import { advanceListingDraftSchema, listingDraftReferenceSchema, saveListingDraftSchema } from "@/lib/validators/listing-draft";
import { advanceListingFormDraft, assertDraftSeller, consumeListingFormDraft, getListingFormDraft, prepareListingDraftPublication, saveListingFormDraft } from "@/server/services/listing-form-drafts";
import { getReusableProductDetails } from "@/lib/marketplace/reusable-listing-product";
import { normalizeCsvWearLayer } from "@/lib/csv/wear-layer";
import { publicProductPhotoWhere } from "@/server/services/listing-media";
import {
  createTRPCRouter,
  publicReadProcedure,
  protectedProcedure,
  sellerProcedure,
  adminProcedure,
  strictAdminProcedure,
} from "../trpc";
import {
  listingCreationSchema,
  listingPalletDimensionsSchema,
  listingFormUpdateSchema,
  listingFilterSchema,
  MAX_PUBLIC_LISTING_RESULT_WINDOW,
  csvListingTransportSchema,
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
import {
  eq,
  and,
  sql,
  gte,
  lte,
  inArray,
  desc,
  asc,
  ilike,
  or,
  isNull,
} from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import zipcodes from "zipcodes";
import { saveListingMedia } from "@/server/services/listing-media";
import { resolveListingWarehouseSelection } from "@/server/services/listing-warehouse-selection";
import { createHash } from "node:crypto";
import { importRequests } from "@/server/db/schema/import-requests";
import { priority1 } from "@/server/services/priority1";
import { redis } from "@/lib/redis/client";
import { slugify } from "@/lib/utils";
import { getFreightDefaults } from "@/lib/constants/freight-defaults";
import { isPro } from "@/lib/pro";
import { LISTING_CONFIRMATION_WARNING_DAYS } from "@/lib/listing-freshness";
import { deriveListingTrustFields } from "@/lib/listing-trust";
import {
  assertListingCapacity,
  lockListingQuota,
  recordListingPublication,
  tryEnqueueListingPublications,
  publishDraftListings,
  reconfirmListing,
} from "@/server/services/listing-publication";
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
import {
  getDirectPurchaseLotValueSql,
  getDirectPurchaseUnitPriceSql,
} from "@/server/db/expressions/listing-pricing";
import { getMinimumAvailableStockSql, getNoKnownQuantityConflictSql } from "@/server/db/expressions/listing-quantity-fit";
import { appendAuditEvent } from "@/server/services/audit-ledger";
import {
  buildPublicReadCacheKey,
  readPublicReadCache,
  writePublicReadCache,
} from "@/server/services/public-read-cache";

import {
  sellerSpecificationProvenance,
  specificationReviewInvalidated,
} from "@/lib/product-specifications";

type PublicListingDto = ReturnType<typeof toPublicListingCard>;
type PublicListingBrowseResponse = {
  items: Array<PublicListingDto & { isPromoted: boolean }>;
  total: number;
  totalIsExact: boolean;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
  locationLabel: string | null;
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
  ctx: { db: Pick<typeof import("../db").db, "query"> },
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
  getSpecificationReview: adminProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.listingId),
        with: {
          media: {
            columns: { id: true, url: true, fileName: true },
            orderBy: (m, { asc }) => [asc(m.sortOrder)],
          },
        },
      });
      if (!listing)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      return listing;
    }),
  reviewSpecifications: strictAdminProcedure
    .input(
      z.object({
        listingId: z.string().uuid(),
        evidenceMediaId: z.string().uuid(),
        expectedUpdatedAt: z.coerce.date(),
        reviewNote: z.string().trim().min(10).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [listing] = await tx
          .select()
          .from(listings)
          .where(eq(listings.id, input.listingId))
          .for("update");
        if (!listing)
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found",
          });
        if (listing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Specifications changed. Reload and review the current listing.",
          });
        const evidence = await tx.query.media.findFirst({
          where: and(
            eq(media.id, input.evidenceMediaId),
            eq(media.listingId, listing.id),
            eq(media.uploaderId, listing.sellerId),
          ),
        });
        if (!evidence)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Choose an attached listing image showing the manufacturer's specifications.",
          });
        const now = new Date();
        const [reviewed] = await tx
          .update(listings)
          .set({
            specificationProvenance: "evidence_reviewed",
            specificationEvidenceId: evidence.id,
            specificationReviewedAt: now,
            specificationReviewedBy: ctx.user.id,
            updatedAt: now,
          })
          .where(eq(listings.id, listing.id))
          .returning();
        await appendAuditEvent(tx, {
          actorType: "admin",
          actorId: ctx.user.id,
          action: "listing.specifications_reviewed",
          entityType: "listing",
          entityId: listing.id,
          summary: "Product specifications reviewed against attached evidence",
          metadata: {
            evidenceMediaId: evidence.id,
            reviewNote: input.reviewNote,
            waterResistance: listing.waterResistance,
            previousProvenance: listing.specificationProvenance,
          },
        });
        return reviewed;
      }),
    ),

  // Incomplete account forms are private preparation, not inventory or publication.
  getFormDraft: protectedProcedure
    .input(z.object({ id: z.string().uuid().optional() }).strict().default({}))
    .query(({ ctx, input }) => getListingFormDraft(ctx.db, ctx.user.id, input.id)),
  saveFormDraft: protectedProcedure
    .input(saveListingDraftSchema)
    .mutation(({ ctx, input }) => saveListingFormDraft(ctx.db, ctx.user.id, input)),
  advanceFormDraft: protectedProcedure
    .input(advanceListingDraftSchema)
    .mutation(({ ctx, input }) => advanceListingFormDraft(ctx.db, ctx.user.id, input)),

  getReusablePallets: protectedProcedure
    .input(z.object({ expectedOwnerId: z.string().uuid(), page: z.number().int().min(1).max(100_000).default(1) }).strict())
    .query(async ({ ctx, input }) => {
      if (input.expectedOwnerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Your account changed. Reopen pallet dimensions." });
      await assertDraftSeller(ctx.db, ctx.user.id);
      const rows = await ctx.db.select({ id: listings.id, title: listings.title, palletLength: listings.palletLength, palletWidth: listings.palletWidth, palletHeight: listings.palletHeight })
        .from(listings).where(and(eq(listings.sellerId, ctx.user.id),
          sql`${listings.palletLength} > 0 and ${listings.palletLength} <= 120`,
          sql`${listings.palletWidth} > 0 and ${listings.palletWidth} <= 120`,
          sql`${listings.palletHeight} > 0 and ${listings.palletHeight} <= 120`))
        .orderBy(desc(listings.createdAt), desc(listings.id)).limit(13).offset((input.page - 1) * 12);
      return { ownerId: ctx.user.id, page: input.page, hasMore: rows.length > 12,
        items: rows.slice(0, 12).flatMap(({ id, title, ...dimensions }) => {
          const checked = listingPalletDimensionsSchema.safeParse(dimensions);
          return checked.success ? [{ id, title, dimensions: checked.data }] : [];
        }),
      };
    }),

  getReusableProducts: protectedProcedure
    .input(z.object({
      expectedOwnerId: z.string().uuid(), query: z.string().trim().max(120).optional(),
      page: z.number().int().min(1).max(100_000).default(1),
      limit: z.number().int().min(1).max(24).default(12),
    }).strict())
    .query(async ({ ctx, input }) => {
      if (input.expectedOwnerId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Your account changed. Reopen previous products for the current seller." });
      await assertDraftSeller(ctx.db, ctx.user.id);
      const conditions = [eq(listings.sellerId, ctx.user.id)];
      if (input.query) {
        const pattern = `%${input.query.replace(/[\\%_]/g, "\\$&")}%`;
        conditions.push(or(ilike(listings.title, pattern), ilike(listings.brand, pattern), ilike(listings.modelNumber, pattern))!);
      }
      const rows = await ctx.db.select({
        id: listings.id, title: listings.title, status: listings.status,
        materialType: listings.materialType, species: listings.species, finish: listings.finish, grade: listings.grade,
        color: listings.color, colorFamily: listings.colorFamily, thickness: listings.thickness, width: listings.width,
        length: listings.length, wearLayer: listings.wearLayer, brand: listings.brand, modelNumber: listings.modelNumber,
        sqFtPerBox: listings.sqFtPerBox, installationMethod: listings.installationMethod,
        waterResistance: listings.waterResistance, certifications: listings.certifications,
      }).from(listings).where(and(...conditions)).orderBy(desc(listings.createdAt), desc(listings.id))
        .limit(input.limit + 1).offset((input.page - 1) * input.limit);
      return { ownerId: ctx.user.id, page: input.page, hasMore: rows.length > input.limit,
        items: rows.slice(0, input.limit).map(({ id, title, status, ...product }) => ({ id, title, status, ...getReusableProductDetails(product) })),
      };
    }),

  // Create a new listing. The intersection preserves all full-form refinements.
  create: sellerProcedure
    .input(listingCreationSchema.and(z.object({ accountDraft: listingDraftReferenceSchema.optional() })))
    .mutation(async ({ ctx, input }) => {
      const {
        accountDraft,
        mediaIds,
        automaticMarkdownStartedAt,
        automaticMarkdownCurrentStep,
        automaticMarkdownLastAppliedAt,
        pricingRulesVersion,
        warehouseRevision,
        ...listingData
      } = input;
      void automaticMarkdownStartedAt;
      void automaticMarkdownCurrentStep;
      void automaticMarkdownLastAppliedAt;
      void pricingRulesVersion;
      const { listing, trustedListing, isReplay } = await ctx.db.transaction(
        async (tx) => {
          await lockListingQuota(tx, ctx.user.id);
          const draftPublication = accountDraft
            ? await prepareListingDraftPublication(tx, ctx.user.id, accountDraft, input)
            : null;
          if (draftPublication?.receipt) {
            return { listing: draftPublication.receipt, trustedListing: draftPublication.receipt, isReplay: true };
          }
          const pickup = await resolveListingWarehouseSelection(tx, ctx.user.id, { ...listingData, warehouseRevision });
          const sellerDefaults = await getSellerListingDefaultsForUser(
            { db: tx },
            ctx.user.id,
          );
          const sellingRuleFields = resolveValidatedSellingRuleFields(
            {
              fullLotOnly: listingData.fullLotOnly,
              partialQuantityMarkupPercent:
                listingData.partialQuantityMarkupPercent,
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
              if (!listingData.locationCity)
                listingData.locationCity = zipInfo.city;
              if (!listingData.locationState)
                listingData.locationState = zipInfo.state;
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
          await assertListingCapacity(tx, ctx.user.id, 1);
          const [listing] = await tx
            .insert(listings)
            .values({
              ...listingData,
              specificationProvenance:
                sellerSpecificationProvenance(listingData),
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
              ...pickup,
              expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), // 90 days
            })
            .returning();

          // Generate and update slug (title + first 6 chars of UUID for uniqueness)
          const slug = `${slugify(input.title)}-${listing.id.slice(0, 6)}`;
          await tx
            .update(listings)
            .set({ slug })
            .where(eq(listings.id, listing.id));

          const photoCount = await saveListingMedia(
            tx,
            listing,
            mediaIds ?? [],
          );

          const [trustedListing] = await tx
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

          await recordListingPublication(tx, ctx.user.id, listing.id, null);
          if (draftPublication) {
            await consumeListingFormDraft(tx, draftPublication.draft, listing.id, draftPublication.publicationFingerprint);
          }
          return { listing, trustedListing, isReplay: false };
        },
      );

      // Only call Priority1 for freight class if seller didn't provide one
      if (
        !isReplay &&
        !listingData.freightClass &&
        listingData.palletWeight &&
        listingData.palletLength &&
        listingData.palletWidth &&
        listingData.palletHeight
      ) {
        priority1
          .getSuggestedClass({
            totalWeight: listingData.palletWeight,
            length: listingData.palletLength,
            width: listingData.palletWidth,
            height: listingData.palletHeight,
            units: 1,
          })
          .then(async (result) => {
            await ctx.db
              .update(listings)
              .set({
                freightClass: result.suggestedClass,
                updatedAt: new Date(),
              })
              .where(eq(listings.id, listing.id));
          })
          .catch(() => {
            // Non-fatal: listing still saved without freight class
          });
      }

      await tryEnqueueListingPublications(ctx.db, [listing.id]);

      return trustedListing ?? listing;
    }),

  // Bulk create listings from CSV data
  bulkCreate: sellerProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        rows: z.array(csvListingTransportSchema).min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // CSV bulk import is a Pro-only feature
      if (!isPro(ctx.user)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "CSV bulk import is a Pro feature. Upgrade to Pro to import listings from spreadsheets.",
        });
      }

      const batchId = crypto.randomUUID();
      const sellerDefaults = await getSellerListingDefaultsForUser(
        ctx,
        ctx.user.id,
      );

      const fingerprint = createHash("sha256")
        .update(JSON.stringify(input.rows))
        .digest("hex");
      let createdListings: (typeof listings.$inferSelect)[] = [];
      const result = await ctx.db.transaction(async (tx) => {
        const [claim] = await tx
          .insert(importRequests)
          .values({
            sellerId: ctx.user.id,
            requestId: input.requestId,
            fingerprint,
          })
          .onConflictDoNothing()
          .returning();
        if (!claim) {
          const [existing] = await tx
            .select()
            .from(importRequests)
            .where(
              and(
                eq(importRequests.sellerId, ctx.user.id),
                eq(importRequests.requestId, input.requestId),
              ),
            )
            .for("update");
          if (!existing || existing.fingerprint !== fingerprint)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "This import request was already used for different data. Start a new import.",
            });
          if (!existing.response)
            throw new TRPCError({
              code: "CONFLICT",
              message:
                "The import is still processing. Retry this request shortly.",
            });
          return existing.response;
        }
        // Completed replay has returned above. New ambiguous imports fail before
        // any listing insert; throwing also rolls back the import-request claim.
        for (const row of input.rows) {
          const packaging = listingPalletMinimumSchema.safeParse(row);
          if (!packaging.success) throw new TRPCError({ code: "BAD_REQUEST", message: packaging.error.issues.map(issue => issue.message).join(" ") });
          resolveValidatedSellingRuleFields(row, sellerDefaults);
          try {
            normalizeCsvWearLayer(row.wearLayer, row.wearLayerUnit, row.materialType);
          } catch (error) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: error instanceof Error ? error.message : "Check the CSV wear-layer value and unit.",
            });
          }
        }
        const results = [];
        const confirmedAt = new Date();

        for (const sourceRow of input.rows) {
          // Preserve source value/unit in the replay fingerprint; store only mm.
          const { wearLayerUnit, ...row } = sourceRow;
          row.wearLayer = normalizeCsvWearLayer(row.wearLayer, wearLayerUnit, row.materialType)?.millimeters;
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
          const freightClass =
            row.freightClass ?? freightDefaults?.freightClass;
          const sellingRuleFields = resolveValidatedSellingRuleFields(
            {
              fullLotOnly: row.fullLotOnly,
              partialQuantityMarkupPercent: row.partialQuantityMarkupPercent,
              automaticMarkdownEnabled: row.automaticMarkdownEnabled,
              automaticMarkdownFloorPercent: row.automaticMarkdownFloorPercent,
              automaticMarkdownIntervalDays: row.automaticMarkdownIntervalDays,
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
              specificationProvenance: sellerSpecificationProvenance(row),
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
              specificationProvenance: sellerSpecificationProvenance(row),
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

        createdListings = results;
        const response = {
          batchId,
          count: results.length,
          listings: results.map((listing) => ({
            id: listing.id,
            title: listing.title,
            modelNumber: listing.modelNumber,
            materialType: listing.materialType,
            totalSqFt: listing.totalSqFt,
            askPricePerSqFt: listing.askPricePerSqFt,
          })),
        };
        await tx.insert(notifications).values({
          userId: ctx.user.id,
          type: "system",
          title: "Bulk Upload Complete",
          message: `${results.length} draft listings created from CSV upload`,
          data: { batchId, count: results.length },
        });
        await tx
          .update(importRequests)
          .set({ response })
          .where(eq(importRequests.id, claim.id));
        return response;
      });
      // Fire-and-forget freight class calculations (only for rows without a freight class)
      for (const row of input.rows) {
        const rowFreightClass =
          row.freightClass ??
          getFreightDefaults(row.materialType)?.freightClass;
        if (
          !rowFreightClass &&
          row.palletWeight &&
          row.palletLength &&
          row.palletWidth &&
          row.palletHeight
        ) {
          const listing = createdListings.find((l) => l.title === row.title);
          if (listing) {
            priority1
              .getSuggestedClass({
                totalWeight: row.palletWeight,
                length: row.palletLength,
                width: row.palletWidth,
                height: row.palletHeight,
                units: 1,
              })
              .then(async (result) => {
                await ctx.db
                  .update(listings)
                  .set({
                    freightClass: result.suggestedClass,
                    updatedAt: new Date(),
                  })
                  .where(eq(listings.id, listing.id));
              })
              .catch(() => {});
          }
        }
      }

      return result;
    }),

  publishBulk: sellerProcedure
    .input(
      z.object({
        listingIds: z.array(z.string().uuid()).min(1).max(100),
        expectedUpdatedAt: z
          .record(z.string().uuid(), z.coerce.date())
          .optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      publishDraftListings(
        ctx.db,
        ctx.user.id,
        input.listingIds,
        input.expectedUpdatedAt,
      ),
    ),

  // Update an existing listing
  update: sellerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: listingFormUpdateSchema,
        appendMedia: z.boolean().optional(),
      }),
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
      const updatedLocation =
        updateData.locationZip !== undefined
          ? zipcodes.lookup(updateData.locationZip)
          : undefined;
      const now = new Date();
      const { existing, updated } = await ctx.db.transaction(async (tx) => {
        // Listing checkout locks this same row before reserving inventory. Keeping
        // the quantity guard and update under the lock prevents a seller edit
        // from racing an in-flight reservation.
        const [lockedListing] = await tx
          .select()
          .from(listings)
          .where(
            and(eq(listings.id, input.id), eq(listings.sellerId, ctx.user.id)),
          )
          .for("update");

        if (!lockedListing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "Listing not found or you do not have permission to edit it",
          });
        }

        if (
          lockedListing.warehouseId &&
          ["locationCity", "locationState", "locationZip"].some(
            (key) =>
              hasOwnKey(updateData, key) &&
              updateData[key as keyof typeof updateData] !==
                lockedListing[key as keyof typeof lockedListing],
          )
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Change pickup location from Warehouses so shipping quotes stay consistent.",
          });
        }

        if (["moq", "moqUnit", "sqFtPerBox", "boxesPerPallet"].some(key => hasOwnKey(updateData, key))) {
          const packaging = listingPalletMinimumSchema.safeParse({ ...lockedListing, ...updateData });
          if (!packaging.success) throw new TRPCError({ code: "BAD_REQUEST", message: packaging.error.issues.map(issue => issue.message).join(" ") });
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
                  updateData.automaticMarkdownFloorPercent !== undefined
                    ? updateData.automaticMarkdownFloorPercent
                    : (lockedListing.automaticMarkdownFloorPercent ?? null),
                automaticMarkdownIntervalDays:
                  updateData.automaticMarkdownIntervalDays !== undefined
                    ? updateData.automaticMarkdownIntervalDays
                    : (lockedListing.automaticMarkdownIntervalDays ?? null),
              },
              now,
            })
          : {};

        if (sellingRuleUpdateTouched) {
          const mergedRules = listingSellingRulesSchema.safeParse({
            ...lockedListing,
            ...updateData,
            ...markdownFields,
          });
          if (!mergedRules.success) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: mergedRules.error.issues
                .map((issue) => issue.message)
                .join(" "),
            });
          }
        }

        const [nextListing] = await tx
          .update(listings)
          .set({
            ...updateData,
            ...(specificationReviewInvalidated(lockedListing, updateData) ||
            (mediaIds !== undefined && !input.appendMedia &&
              lockedListing.specificationEvidenceId !== null &&
              !mediaIds.includes(lockedListing.specificationEvidenceId))
              ? {
                  specificationProvenance: sellerSpecificationProvenance({
                    ...lockedListing,
                    ...updateData,
                  }),
                  specificationEvidenceId: null,
                  specificationReviewedAt: null,
                  specificationReviewedBy: null,
                }
              : {}),
            // Keep discovery coordinates attached to the current inventory ZIP.
            // Unknown ZIPs must clear the old point, never retain another location.
            ...(updateData.locationZip !== undefined
              ? {
                  locationLat: updatedLocation?.latitude ?? null,
                  locationLng: updatedLocation?.longitude ?? null,
                }
              : {}),
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
            and(eq(listings.id, input.id), eq(listings.sellerId, ctx.user.id)),
          )
          .returning();

        if (!nextListing) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Listing changed while it was being updated. Please retry.",
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

        const photoCount = await saveListingMedia(tx, nextListing, mediaIds, input.appendMedia);
        const [trustedListing] = await tx
          .update(listings)
          .set(deriveListingTrustFields({ ...nextListing, photoCount }, now))
          .where(eq(listings.id, input.id))
          .returning();
        return {
          existing: lockedListing,
          updated: trustedListing ?? nextListing,
        };
      });
      const trustedListing = updated;

      // Only call Priority1 for freight class if seller didn't provide one in this update
      // and the listing doesn't already have a seller-provided freight class
      const hasFreightClass =
        updateData.freightClass ||
        (updated?.freightClass &&
          !updateData.palletWeight &&
          !updateData.palletLength &&
          !updateData.palletWidth &&
          !updateData.palletHeight);
      if (
        !hasFreightClass &&
        (updateData.palletWeight ||
          updateData.palletLength ||
          updateData.palletWidth ||
          updateData.palletHeight)
      ) {
        const currentValues = {
          palletWeight: updateData.palletWeight ?? existing.palletWeight,
          palletLength: updateData.palletLength ?? existing.palletLength,
          palletWidth: updateData.palletWidth ?? existing.palletWidth,
          palletHeight: updateData.palletHeight ?? existing.palletHeight,
        };

        if (
          currentValues.palletWeight &&
          currentValues.palletLength &&
          currentValues.palletWidth &&
          currentValues.palletHeight
        ) {
          priority1
            .getSuggestedClass({
              totalWeight: currentValues.palletWeight,
              length: currentValues.palletLength,
              width: currentValues.palletWidth,
              height: currentValues.palletHeight,
              units: 1,
            })
            .then(async (result) => {
              await ctx.db
                .update(listings)
                .set({
                  freightClass: result.suggestedClass,
                  updatedAt: new Date(),
                })
                .where(eq(listings.id, input.id));
            })
            .catch(() => {
              // Non-fatal: listing still updated without freight class
            });
        }
      }

      return trustedListing;
    }),

  reconfirm: sellerProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        expectedUpdatedAt: z.coerce.date().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      reconfirmListing(ctx.db, ctx.user.id, input.id, input.expectedUpdatedAt),
    ),

  // Delete (archive) a listing
  delete: sellerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: listings.id })
          .from(listings)
          .where(
            and(eq(listings.id, input.id), eq(listings.sellerId, ctx.user.id)),
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
              inArray(orders.status, [...UNRELEASED_INVENTORY_ORDER_STATUSES]),
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
            and(eq(listings.id, input.id), eq(listings.sellerId, ctx.user.id)),
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
            where: publicProductPhotoWhere,
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
            where: publicProductPhotoWhere,
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
      const cached =
        await readPublicReadCache<PublicListingBrowseResponse>(
          anonymousCacheKey,
        );
      if (cached) return cached;

      const publicNow = new Date();
      const conditions = [publicActiveListingWhere(publicNow, ctx.user)];
      const directPurchaseUnitPrice = getDirectPurchaseUnitPriceSql();
      const directPurchaseLotValue = getDirectPurchaseLotValueSql();

      // Match tokens across product fields, including the manufacturer's model.
      // Keep each predicate index-friendly and escape SQL LIKE metacharacters.
      if (input.query?.trim()) {
        const tokens = [
          ...new Set(input.query.trim().toLowerCase().split(/\s+/)),
        ];
        for (const token of tokens) {
          const escaped = token.replace(/[\\%_]/g, "\\$&");
          conditions.push(
            or(
              ilike(listings.searchDocument, `%${escaped}%`),
              ilike(listings.modelNumber, `%${escaped}%`),
            )!,
          );
        }
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

      // The final filter option is explicitly labelled 9 inches or wider.
      if (input.width && input.width.length > 0) {
        const widthConditions = input.width.map((w) =>
          w === 9
            ? gte(listings.width, 9)
            : and(gte(listings.width, w - 0.1), lte(listings.width, w + 0.1)),
        );
        conditions.push(or(...widthConditions)!);
      }

      // Allow rounding from mm to hundredths of an inch, not adjacent sizes.
      if (input.thickness && input.thickness.length > 0) {
        const thicknessConditions = input.thickness.map((t) =>
          and(
            gte(listings.thickness, t - 0.005),
            lte(listings.thickness, t + 0.005),
          ),
        );
        conditions.push(or(...thicknessConditions)!);
      }

      // Wear layer multi-select (match within ±0.02mm tolerance)
      if (input.wearLayer && input.wearLayer.length > 0) {
        const wearConditions = input.wearLayer.map((w) =>
          and(
            gte(listings.wearLayer, w - 0.02),
            lte(listings.wearLayer, w + 0.02),
          ),
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
        conditions.push(getMinimumAvailableStockSql(input.minLotSize));
      }
      if (input.hideQuantityConflicts && input.minLotSize !== undefined) {
        conditions.push(getNoKnownQuantityConflictSql(input.minLotSize));
      }
      if (input.maxLotSize !== undefined) {
        conditions.push(lte(listings.totalSqFt, input.maxLotSize));
      }

      // Familiar marketplace confidence filters, backed by the same fields
      // used to construct the public listing evidence DTO.
      if (input.waterproofRequired === true) {
        conditions.push(
          sql`${listings.waterResistance} = 'waterproof' AND ${listings.specificationProvenance} = 'evidence_reviewed' AND ${listings.specificationReviewedAt} IS NOT NULL AND ${listings.specificationEvidenceId} IS NOT NULL`,
        );
      }
      if (input.sellerVerified !== undefined) {
        // Relational where clauses remap Column tokens to the listings alias.
        // Keep inner seller identifiers in their own scope; only the correlated
        // outer sellerId should follow the relation's alias.
        conditions.push(sql<boolean>`(
          exists (
            select 1
            from ${users} as "confidence_seller"
            where "confidence_seller"."id" = ${listings.sellerId}
              and "confidence_seller"."verification_status" = 'verified'
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
            from ${users} as "freight_seller"
            where "freight_seller"."id" = ${listings.sellerId}
              and nullif(btrim("freight_seller"."business_address"), '') is not null
              and nullif(btrim("freight_seller"."phone"), '') is not null
          )
        ) = ${input.freightReady}`);
      }

      if (input.fullLotOnly !== undefined) {
        conditions.push(eq(listings.fullLotOnly, input.fullLotOnly));
      }

      // Resolve origin independently: nearest ordering also works nationwide.
      let buyerLat: number | undefined;
      let buyerLng: number | undefined;
      const zipInfo = input.buyerZip
        ? zipcodes.lookup(input.buyerZip)
        : undefined;
      if (zipInfo) {
        buyerLat = zipInfo.latitude;
        buyerLng = zipInfo.longitude;
        if (input.maxDistance && input.maxDistance > 0) {
          conditions.push(
            ...getListingBoundingBoxConditions(
              { latitude: buyerLat, longitude: buyerLng },
              input.maxDistance,
            ),
          );
          conditions.push(
            sql`(${getListingDistanceMilesSql(buyerLat, buyerLng)}) <= ${input.maxDistance}`,
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
        END`,
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

      // Explicit buyer sorting takes precedence over paid placement.
      const orderByClause =
        input.sort === "proximity"
          ? [userSort, promotionBoost, asc(listings.id)]
          : [promotionBoost, userSort, asc(listings.id)];

      const where = and(...conditions);
      const offset = (input.page - 1) * input.limit;

      const withClause = {
        media: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          orderBy: (media: any, { asc }: any) => [asc(media.sortOrder)],
          limit: 1,
          columns: publicMediaColumns,
          where: publicProductPhotoWhere,
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
      const total = Math.min(boundedCount, MAX_PUBLIC_LISTING_RESULT_WINDOW);

      const response: PublicListingBrowseResponse = {
        items: interleaved,
        total,
        totalIsExact,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        hasMore: offset + interleaved.length < total,
        locationLabel: zipInfo ? `${zipInfo.city}, ${zipInfo.state}` : null,
      };
      await writePublicReadCache(anonymousCacheKey, response, 20);
      return response;
    }),

  // Get seller's own listings
  getMyListings: sellerProcedure
    .input(
      z.object({
        query: z.string().trim().max(120).optional(),
        needsConfirmation: z.boolean().optional(),
        status: z
          .enum(["draft", "active", "sold", "expired", "archived"])
          .optional(),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions = [eq(listings.sellerId, ctx.user.id)];

      if (input.status) {
        conditions.push(eq(listings.status, input.status));
      }

      if (input.query) {
        const escaped = input.query.replace(/[\\%_]/g, "\\$&");
        const pattern = `%${escaped}%`;
        conditions.push(
          or(
            ilike(listings.title, pattern),
            ilike(listings.brand, pattern),
            ilike(listings.modelNumber, pattern),
          )!,
        );
      }
      if (input.needsConfirmation) {
        const warningAt = new Date(
          Date.now() + LISTING_CONFIRMATION_WARNING_DAYS * 24 * 60 * 60 * 1000,
        );
        conditions.push(eq(listings.status, "active"));
        conditions.push(
          or(
            isNull(listings.lastConfirmedAt),
            isNull(listings.confirmationDueAt),
            lte(listings.confirmationDueAt, warningAt),
          )!,
        );
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
          orderBy: [desc(listings.createdAt), desc(listings.id)],
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
        ownerId: ctx.user.id,
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
    .input(
      z
        .object({ limit: z.number().int().positive().max(12).default(6) })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 6;
      const anonymousCacheKey = ctx.user
        ? null
        : buildPublicReadCacheKey("listing-trending", { limit });
      const cached =
        await readPublicReadCache<PublicListingDto[]>(anonymousCacheKey);
      if (cached) return cached;

      const items = await ctx.db.query.listings.findMany({
        where: publicActiveListingWhere(new Date(), ctx.user),
        columns: publicListingCardColumns,
        with: {
          media: {
            columns: publicMediaColumns,
            where: publicProductPhotoWhere,
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
