import {
  createTRPCRouter,
  buyerProcedure,
  sellerProcedure,
} from "../trpc";
import {
  createBuyerRequestSchema,
  updateBuyerRequestSchema,
  createResponseSchema,
  buyerRequestFilterSchema,
} from "@/lib/validators/buyer-request";
import {
  buyerRequests,
  buyerRequestResponses,
  notifications,
  media,
  conversations,
  listings,
} from "../db/schema";
import {
  and,
  eq,
  sql,
  desc,
  asc,
  inArray,
  isNull,
  isNotNull,
  ne,
  gt,
  gte,
} from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { resolveBuyerRequestListingMatch } from "@/server/services/buyer-request-listing-match";

/**
 * Maximum number of open requests a buyer may have at once.
 */
const MAX_OPEN_REQUESTS = 5;

/**
 * Number of days until a buyer request expires.
 */
const REQUEST_EXPIRY_DAYS = 30;

/**
 * Auto-generates a human-readable title from the request inputs.
 */
function generateRequestTitle(
  materialTypes: string[],
  minTotalSqFt: number,
  destinationZip: string
): string {
  const matLabel = materialTypes
    .map((m) => m.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" / ");
  return `${matLabel} — ${minTotalSqFt.toLocaleString()} sq ft to ${destinationZip}`;
}

export const buyerRequestRouter = createTRPCRouter({
  // ====================================================================
  // BUYER PROCEDURES
  // ====================================================================

  /**
   * Create a new buyer request.
   * Enforces a limit of MAX_OPEN_REQUESTS open requests per buyer.
   */
  create: buyerProcedure
    .input(createBuyerRequestSchema)
    .mutation(async ({ ctx, input }) => {
      // Enforce max open request limit
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(buyerRequests)
        .where(
          and(
            eq(buyerRequests.buyerId, ctx.user.id),
            eq(buyerRequests.status, "open")
          )
        );

      if (count >= MAX_OPEN_REQUESTS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You can have at most ${MAX_OPEN_REQUESTS} open requests at a time. Please close an existing request before creating a new one.`,
        });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + REQUEST_EXPIRY_DAYS);

      const title = generateRequestTitle(
        input.materialTypes,
        input.minTotalSqFt,
        input.destinationZip
      );

      const [request] = await ctx.db
        .insert(buyerRequests)
        .values({
          buyerId: ctx.user.id,
          title,
          materialTypes: input.materialTypes,
          minTotalSqFt: input.minTotalSqFt,
          maxTotalSqFt: input.maxTotalSqFt,
          priceMaxPerSqFt: input.priceMaxPerSqFt,
          priceMinPerSqFt: input.priceMinPerSqFt,
          destinationZip: input.destinationZip,
          pickupOk: input.pickupOk,
          pickupRadiusMiles: input.pickupRadiusMiles,
          shippingOk: input.shippingOk,
          specs: input.specs,
          notes: input.notes,
          urgency: input.urgency,
          expiresAt,
        })
        .returning();

      if (!request) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create request",
        });
      }

      // Link uploaded media to this request (only unclaimed media)
      if (input.mediaIds && input.mediaIds.length > 0) {
        await ctx.db
          .update(media)
          .set({ buyerRequestId: request.id })
          .where(
            and(
              inArray(media.id, input.mediaIds),
              isNull(media.buyerRequestId),
              isNull(media.listingId),
              eq(media.uploaderId, ctx.user.id),
            )
          );
      }

      return request;
    }),

  /**
   * Get the current buyer's requests, paginated, with response counts.
   */
  getMyRequests: buyerProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        ctx.db.query.buyerRequests.findMany({
          where: eq(buyerRequests.buyerId, ctx.user.id),
          orderBy: desc(buyerRequests.createdAt),
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(buyerRequests)
          .where(eq(buyerRequests.buyerId, ctx.user.id)),
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

  /**
   * Get a single request by ID.
   * Responses are only visible to the request's buyer.
   */
  getRequest: buyerProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const request = await ctx.db.query.buyerRequests.findFirst({
        where: eq(buyerRequests.id, input.requestId),
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Request not found",
        });
      }

      // Verify buyer owns this request
      if (request.buyerId !== ctx.user.id && ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this request",
        });
      }

      // Fetch responses and media
      const [responses, requestMedia] = await Promise.all([
        ctx.db.query.buyerRequestResponses.findMany({
          where: eq(buyerRequestResponses.requestId, input.requestId),
          orderBy: desc(buyerRequestResponses.createdAt),
        }),
        ctx.db.query.media.findMany({
          where: eq(media.buyerRequestId, input.requestId),
          orderBy: (media, { asc }) => [asc(media.sortOrder)],
        }),
      ]);

      return { ...request, responses, media: requestMedia };
    }),

  /**
   * Close a buyer request (sets status to 'closed').
   */
  close: buyerProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.query.buyerRequests.findFirst({
        where: eq(buyerRequests.id, input.requestId),
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Request not found",
        });
      }

      if (request.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only close your own requests",
        });
      }

      if (request.status !== "open" && request.status !== "matched") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This request is already closed or expired",
        });
      }

      const [updated] = await ctx.db
        .update(buyerRequests)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(buyerRequests.id, input.requestId))
        .returning();

      return updated;
    }),

  /**
   * Update a buyer request (notes + urgency).
   * Only allowed on open/matched requests.
   */
  update: buyerProcedure
    .input(updateBuyerRequestSchema)
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.query.buyerRequests.findFirst({
        where: eq(buyerRequests.id, input.id),
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Request not found",
        });
      }

      if (request.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only edit your own requests",
        });
      }

      if (request.status !== "open" && request.status !== "matched") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot edit a closed or expired request",
        });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.notes !== undefined) updates.notes = input.notes;
      if (input.urgency !== undefined) updates.urgency = input.urgency;

      const [updated] = await ctx.db
        .update(buyerRequests)
        .set(updates)
        .where(eq(buyerRequests.id, input.id))
        .returning();

      return updated;
    }),

  /**
   * Delete a buyer request and its associated responses.
   */
  delete: buyerProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.query.buyerRequests.findFirst({
        where: eq(buyerRequests.id, input.requestId),
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Request not found",
        });
      }

      if (request.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only delete your own requests",
        });
      }

      // Unlink media, delete responses, then delete request
      await ctx.db
        .update(media)
        .set({ buyerRequestId: null })
        .where(eq(media.buyerRequestId, input.requestId));

      await ctx.db
        .delete(buyerRequestResponses)
        .where(eq(buyerRequestResponses.requestId, input.requestId));

      await ctx.db
        .delete(buyerRequests)
        .where(eq(buyerRequests.id, input.requestId));

      return { success: true };
    }),

  /**
   * Mark a seller's response as 'viewed'.
   */
  viewResponse: buyerProcedure
    .input(z.object({ responseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [candidate] = await tx
          .select({ requestId: buyerRequestResponses.requestId })
          .from(buyerRequestResponses)
          .where(eq(buyerRequestResponses.id, input.responseId));
        if (!candidate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Response not found",
          });
        }

        const [request] = await tx
          .select({
            id: buyerRequests.id,
            buyerId: buyerRequests.buyerId,
          })
          .from(buyerRequests)
          .where(eq(buyerRequests.id, candidate.requestId))
          .for("update");
        if (!request) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Buyer request not found",
          });
        }
        if (request.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this response",
          });
        }

        const [response] = await tx
          .select()
          .from(buyerRequestResponses)
          .where(
            and(
              eq(buyerRequestResponses.id, input.responseId),
              eq(buyerRequestResponses.requestId, request.id),
            ),
          )
          .for("update");
        if (!response) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Response not found",
          });
        }

        if (response.status === "sent") {
          await tx
            .update(buyerRequestResponses)
            .set({ status: "viewed", updatedAt: new Date() })
            .where(
              and(
                eq(buyerRequestResponses.id, response.id),
                eq(buyerRequestResponses.status, "sent"),
              ),
            );
        }

        return { success: true };
      });
    }),

  /**
   * Mark a seller's response as 'accepted'. Notifies the seller.
   */
  acceptResponse: buyerProcedure
    .input(z.object({ responseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [candidate] = await tx
          .select({ requestId: buyerRequestResponses.requestId })
          .from(buyerRequestResponses)
          .where(eq(buyerRequestResponses.id, input.responseId));

        if (!candidate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Response not found",
          });
        }

        // The request is the serialization point for accepting any response.
        // Lock it before the response rows so two buyers cannot deadlock by
        // locking different responses and then waiting on the same request.
        const [request] = await tx
          .select()
          .from(buyerRequests)
          .where(eq(buyerRequests.id, candidate.requestId))
          .for("update");

        if (!request) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Buyer request not found",
          });
        }
        if (request.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this response",
          });
        }

        const lockedResponses = await tx
          .select()
          .from(buyerRequestResponses)
          .where(eq(buyerRequestResponses.requestId, request.id))
          .orderBy(asc(buyerRequestResponses.id))
          .for("update");
        const response = lockedResponses.find(
          (item) => item.id === input.responseId,
        );
        if (!response) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Response not found",
          });
        }
        const existingAccepted = lockedResponses.find(
          (item) => item.status === "accepted",
        );

        if (existingAccepted && existingAccepted.id !== response.id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Another response has already been accepted",
          });
        }
        if (
          request.status !== "open" &&
          !(request.status === "matched" && existingAccepted?.id === response.id)
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This request is no longer accepting a match",
          });
        }
        if (
          request.expiresAt &&
          request.expiresAt.getTime() <= Date.now() &&
          existingAccepted?.id !== response.id
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This request has expired",
          });
        }
        if (response.status === "declined") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot accept a declined response",
          });
        }

        if (existingAccepted?.id === response.id) {
          if (!response.listingId) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "The accepted response does not have a listing",
            });
          }

          const [existingConversation] = await tx
            .select({ id: conversations.id })
            .from(conversations)
            .where(
              and(
                eq(conversations.listingId, response.listingId),
                eq(conversations.buyerId, request.buyerId),
              ),
            )
            .limit(1);
          if (!existingConversation) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "The accepted response conversation is unavailable",
            });
          }

          return {
            ...existingAccepted,
            conversationId: existingConversation.id,
          };
        }

        if (!response.listingId) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "The seller must attach an active listing before matching",
          });
        }

        const [attachedListing] = await tx
          .select({
            id: listings.id,
            sellerId: listings.sellerId,
            materialType: listings.materialType,
            territoryMode: listings.territoryMode,
            allowedDestinationStates: listings.allowedDestinationStates,
          })
          .from(listings)
          .where(
            and(
              eq(listings.id, response.listingId),
              eq(listings.status, "active"),
              isNotNull(listings.lastConfirmedAt),
              isNotNull(listings.confirmationDueAt),
              gte(listings.confirmationDueAt, new Date()),
              gt(listings.totalSqFt, 0),
            ),
          )
          .limit(1);

        if (!attachedListing || attachedListing.sellerId !== response.sellerId) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "The response listing is no longer available from this seller",
          });
        }
        if (!request.materialTypes.includes(attachedListing.materialType)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "The response listing no longer matches the requested material",
          });
        }

        const territoryMatch = resolveBuyerRequestListingMatch({
          destinationZip: request.destinationZip,
          territoryMode: attachedListing.territoryMode,
          allowedDestinationStates: attachedListing.allowedDestinationStates,
        });
        if (!territoryMatch.eligible) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "The response listing is not eligible for the buyer's destination",
          });
        }

        const [createdConversation] = await tx
          .insert(conversations)
          .values({
            listingId: attachedListing.id,
            buyerId: request.buyerId,
            sellerId: response.sellerId,
          })
          .onConflictDoNothing({
            target: [conversations.listingId, conversations.buyerId],
          })
          .returning({ id: conversations.id });

        const existingConversation =
          createdConversation ??
          (
            await tx
              .select({ id: conversations.id })
              .from(conversations)
              .where(
                and(
                  eq(conversations.listingId, attachedListing.id),
                  eq(conversations.buyerId, request.buyerId),
                ),
              )
              .limit(1)
          )[0];
        if (!existingConversation) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Unable to open the matched seller conversation",
          });
        }
        const conversationId = existingConversation.id;

        const now = new Date();
        const [updated] = await tx
          .update(buyerRequestResponses)
          .set({ status: "accepted", updatedAt: now })
          .where(
            and(
              eq(buyerRequestResponses.id, input.responseId),
              inArray(buyerRequestResponses.status, ["sent", "viewed"]),
            ),
          )
          .returning();

        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This response changed before it could be accepted",
          });
        }

        await tx
          .update(buyerRequestResponses)
          .set({ status: "declined", updatedAt: now })
          .where(
            and(
              eq(buyerRequestResponses.requestId, request.id),
              ne(buyerRequestResponses.id, response.id),
              inArray(buyerRequestResponses.status, ["sent", "viewed"]),
            ),
          );

        await tx
          .update(buyerRequests)
          .set({ status: "matched", updatedAt: now })
          .where(
            and(
              eq(buyerRequests.id, request.id),
              eq(buyerRequests.status, "open"),
            ),
          );

        await tx.insert(notifications).values({
          userId: response.sellerId,
          type: "system",
          title: "Your response was accepted",
          message: `A buyer accepted your response to request: "${request.title}"`,
          data: {
            type: "response_accepted",
            requestId: response.requestId,
            responseId: response.id,
            conversationId,
          },
        });

        return { ...updated, conversationId };
      });
    }),

  /**
   * Mark a seller's response as 'declined'. Notifies the seller.
   */
  declineResponse: buyerProcedure
    .input(z.object({ responseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [candidate] = await tx
          .select({ requestId: buyerRequestResponses.requestId })
          .from(buyerRequestResponses)
          .where(eq(buyerRequestResponses.id, input.responseId));
        if (!candidate) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Response not found",
          });
        }

        const [request] = await tx
          .select({
            id: buyerRequests.id,
            buyerId: buyerRequests.buyerId,
            title: buyerRequests.title,
          })
          .from(buyerRequests)
          .where(eq(buyerRequests.id, candidate.requestId))
          .for("update");
        if (!request) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Buyer request not found",
          });
        }
        if (request.buyerId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You do not have access to this response",
          });
        }

        const [response] = await tx
          .select()
          .from(buyerRequestResponses)
          .where(
            and(
              eq(buyerRequestResponses.id, input.responseId),
              eq(buyerRequestResponses.requestId, request.id),
            ),
          )
          .for("update");
        if (!response) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Response not found",
          });
        }
        if (response.status === "accepted") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot decline an already accepted response",
          });
        }
        if (response.status === "declined") {
          return response;
        }

        const [updated] = await tx
          .update(buyerRequestResponses)
          .set({ status: "declined", updatedAt: new Date() })
          .where(
            and(
              eq(buyerRequestResponses.id, response.id),
              inArray(buyerRequestResponses.status, ["sent", "viewed"]),
            ),
          )
          .returning();
        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This response changed before it could be declined",
          });
        }

        await tx.insert(notifications).values({
          userId: response.sellerId,
          type: "system",
          title: "Your response was declined",
          message: `A buyer declined your response to request: "${request.title}"`,
          data: {
            type: "response_declined",
            requestId: response.requestId,
            responseId: response.id,
          },
        });

        return updated;
      });
    }),

  // ====================================================================
  // SELLER PROCEDURES
  // ====================================================================

  /**
   * Browse open buyer requests with optional filtering.
   */
  browse: sellerProcedure
    .input(buyerRequestFilterSchema)
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      // Build conditions dynamically
      const conditions = [eq(buyerRequests.status, "open")];

      if (input.materialTypes && input.materialTypes.length > 0) {
        // Filter requests whose materialTypes array overlaps with filter
        conditions.push(
          sql`${buyerRequests.materialTypes} ?| array[${sql.join(
            input.materialTypes.map((m) => sql`${m}`),
            sql`, `
          )}]`
        );
      }

      if (input.minSqFt !== undefined) {
        conditions.push(
          sql`${buyerRequests.minTotalSqFt} >= ${input.minSqFt}`
        );
      }

      if (input.maxSqFt !== undefined) {
        conditions.push(
          sql`${buyerRequests.minTotalSqFt} <= ${input.maxSqFt}`
        );
      }

      if (input.maxPricePerSqFt !== undefined) {
        conditions.push(
          sql`${buyerRequests.priceMaxPerSqFt} <= ${input.maxPricePerSqFt}`
        );
      }

      if (input.urgency) {
        conditions.push(eq(buyerRequests.urgency, input.urgency));
      }

      const whereClause = and(...conditions);

      // Determine sort order
      const urgencyOrder = sql`CASE ${buyerRequests.urgency}
        WHEN 'asap' THEN 1
        WHEN '2_weeks' THEN 2
        WHEN '4_weeks' THEN 3
        ELSE 4
      END`;

      const orderBy =
        input.sort === "newest"
          ? [desc(buyerRequests.createdAt)]
          : input.sort === "urgency"
          ? [asc(urgencyOrder), desc(buyerRequests.createdAt)]
          : input.sort === "sqft_desc"
          ? [desc(buyerRequests.minTotalSqFt)]
          : input.sort === "price_desc"
          ? [desc(buyerRequests.priceMaxPerSqFt)]
          : [desc(buyerRequests.createdAt)];

      const [items, countResult] = await Promise.all([
        ctx.db.query.buyerRequests.findMany({
          where: whereClause,
          orderBy,
          limit: input.limit,
          offset,
          with: {
            media: {
              columns: { id: true, url: true },
              orderBy: (media, { asc }) => [asc(media.sortOrder)],
              limit: 1,
            },
          },
        }),
        ctx.db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(buyerRequests)
          .where(whereClause),
      ]);

      const total = countResult[0]?.count ?? 0;

      // Flatten media into a thumbnailUrl for card display
      const itemsWithThumbnail = items.map((item) => ({
        ...item,
        thumbnailUrl: item.media?.[0]?.url ?? null,
        media: undefined,
      }));

      return {
        items: itemsWithThumbnail,
        total,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(total / input.limit),
        hasMore: offset + items.length < total,
      };
    }),

  /**
   * Submit a response to a buyer request.
   * Verifies the seller has not already responded. Increments responseCount.
   * Creates a notification for the buyer.
   */
  respond: sellerProcedure
    .input(createResponseSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.db.transaction(async (tx) => {
        const [request] = await tx
          .select()
          .from(buyerRequests)
          .where(eq(buyerRequests.id, input.requestId))
          .for("update");

        if (!request || request.status !== "open") {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Request not found or no longer accepting responses",
          });
        }
        if (request.expiresAt && request.expiresAt.getTime() <= Date.now()) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Request not found or no longer accepting responses",
          });
        }
        if (request.buyerId === ctx.user.id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You cannot respond to your own request",
          });
        }

        const existing = await tx.query.buyerRequestResponses.findFirst({
          where: and(
            eq(buyerRequestResponses.requestId, input.requestId),
            eq(buyerRequestResponses.sellerId, ctx.user.id),
          ),
        });
        if (existing) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You have already responded to this request",
          });
        }

        const attachedListing = await tx.query.listings.findFirst({
          where: and(
            eq(listings.id, input.listingId),
            eq(listings.sellerId, ctx.user.id),
            eq(listings.status, "active"),
            isNotNull(listings.lastConfirmedAt),
            isNotNull(listings.confirmationDueAt),
            gte(listings.confirmationDueAt, new Date()),
            gt(listings.totalSqFt, 0),
          ),
          columns: {
            id: true,
            materialType: true,
            territoryMode: true,
            allowedDestinationStates: true,
          },
        });
        if (!attachedListing) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Attach one of your active listings to this response",
          });
        }
        if (!request.materialTypes.includes(attachedListing.materialType)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Attach a listing whose material matches the buyer's request",
          });
        }

        const territoryMatch = resolveBuyerRequestListingMatch({
          destinationZip: request.destinationZip,
          territoryMode: attachedListing.territoryMode,
          allowedDestinationStates: attachedListing.allowedDestinationStates,
        });
        if (!territoryMatch.eligible) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "That listing is not eligible for the buyer's destination",
          });
        }

        const [newResponse] = await tx
          .insert(buyerRequestResponses)
          .values({
            requestId: input.requestId,
            sellerId: ctx.user.id,
            listingId: input.listingId,
            message: input.message,
          })
          .returning();

        await tx
          .update(buyerRequests)
          .set({
            responseCount: sql`${buyerRequests.responseCount} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(buyerRequests.id, input.requestId));

        if (!newResponse) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to submit response",
          });
        }

        await tx.insert(notifications).values({
          userId: request.buyerId,
          type: "system",
          title: "New response to your request",
          message: `A seller responded to your request: "${request.title}"`,
          data: {
            type: "request_response",
            requestId: input.requestId,
            responseId: newResponse.id,
          },
        });

        return { response: newResponse };
      });

      return result.response;
    }),

  /**
   * Get all of this seller's responses across all requests, paginated.
   */
  getMyResponses: sellerProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        ctx.db.query.buyerRequestResponses.findMany({
          where: eq(buyerRequestResponses.sellerId, ctx.user.id),
          orderBy: desc(buyerRequestResponses.createdAt),
          limit: input.limit,
          offset,
          with: {
            request: {
              columns: {
                id: true,
                title: true,
                status: true,
                destinationZip: true,
                materialTypes: true,
                minTotalSqFt: true,
                priceMaxPerSqFt: true,
                urgency: true,
              },
            },
          },
        }),
        ctx.db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(buyerRequestResponses)
          .where(eq(buyerRequestResponses.sellerId, ctx.user.id)),
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
});
