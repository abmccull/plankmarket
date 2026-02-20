import {
  createTRPCRouter,
  buyerProcedure,
  sellerProcedure,
} from "../trpc";
import {
  createBuyerRequestSchema,
  createResponseSchema,
  buyerRequestFilterSchema,
} from "@/lib/validators/buyer-request";
import {
  buyerRequests,
  buyerRequestResponses,
  notifications,
  media,
} from "../db/schema";
import { and, eq, sql, desc, asc, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

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

      // Link uploaded media to this request
      if (input.mediaIds && input.mediaIds.length > 0) {
        await ctx.db
          .update(media)
          .set({ buyerRequestId: request.id })
          .where(inArray(media.id, input.mediaIds));
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
   * Mark a seller's response as 'viewed'.
   */
  viewResponse: buyerProcedure
    .input(z.object({ responseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const response = await ctx.db.query.buyerRequestResponses.findFirst({
        where: eq(buyerRequestResponses.id, input.responseId),
        with: {
          request: {
            columns: { buyerId: true },
          },
        },
      });

      if (!response) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Response not found",
        });
      }

      if (response.request.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this response",
        });
      }

      // Only update if currently 'sent'
      if (response.status === "sent") {
        await ctx.db
          .update(buyerRequestResponses)
          .set({ status: "viewed", updatedAt: new Date() })
          .where(eq(buyerRequestResponses.id, input.responseId));
      }

      return { success: true };
    }),

  /**
   * Mark a seller's response as 'accepted'. Notifies the seller.
   */
  acceptResponse: buyerProcedure
    .input(z.object({ responseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const response = await ctx.db.query.buyerRequestResponses.findFirst({
        where: eq(buyerRequestResponses.id, input.responseId),
        with: {
          request: {
            columns: { buyerId: true, title: true, id: true },
          },
        },
      });

      if (!response) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Response not found",
        });
      }

      if (response.request.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this response",
        });
      }

      if (response.status === "declined") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot accept a declined response",
        });
      }

      const [updated] = await ctx.db
        .update(buyerRequestResponses)
        .set({ status: "accepted", updatedAt: new Date() })
        .where(eq(buyerRequestResponses.id, input.responseId))
        .returning();

      // Notify seller (fire-and-forget)
      void ctx.db.insert(notifications).values({
        userId: response.sellerId,
        type: "system",
        title: "Your response was accepted",
        message: `A buyer accepted your response to request: "${response.request.title}"`,
        data: {
          type: "response_accepted",
          requestId: response.requestId,
          responseId: response.id,
        },
      });

      return updated;
    }),

  /**
   * Mark a seller's response as 'declined'. Notifies the seller.
   */
  declineResponse: buyerProcedure
    .input(z.object({ responseId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const response = await ctx.db.query.buyerRequestResponses.findFirst({
        where: eq(buyerRequestResponses.id, input.responseId),
        with: {
          request: {
            columns: { buyerId: true, title: true, id: true },
          },
        },
      });

      if (!response) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Response not found",
        });
      }

      if (response.request.buyerId !== ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this response",
        });
      }

      if (response.status === "accepted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot decline an already accepted response",
        });
      }

      const [updated] = await ctx.db
        .update(buyerRequestResponses)
        .set({ status: "declined", updatedAt: new Date() })
        .where(eq(buyerRequestResponses.id, input.responseId))
        .returning();

      // Notify seller (fire-and-forget)
      void ctx.db.insert(notifications).values({
        userId: response.sellerId,
        type: "system",
        title: "Your response was declined",
        message: `A buyer declined your response to request: "${response.request.title}"`,
        data: {
          type: "response_declined",
          requestId: response.requestId,
          responseId: response.id,
        },
      });

      return updated;
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
      // Verify request exists and is open
      const request = await ctx.db.query.buyerRequests.findFirst({
        where: and(
          eq(buyerRequests.id, input.requestId),
          eq(buyerRequests.status, "open")
        ),
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Request not found or no longer accepting responses",
        });
      }

      // Prevent seller from responding to their own request (edge case)
      if (request.buyerId === ctx.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot respond to your own request",
        });
      }

      // Prevent duplicate responses
      const existing = await ctx.db.query.buyerRequestResponses.findFirst({
        where: and(
          eq(buyerRequestResponses.requestId, input.requestId),
          eq(buyerRequestResponses.sellerId, ctx.user.id)
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You have already responded to this request",
        });
      }

      // Create response and update request count in a transaction
      const response = await ctx.db.transaction(async (tx) => {
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

        return newResponse;
      });

      if (!response) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to submit response",
        });
      }

      // Notify the buyer (fire-and-forget)
      void ctx.db.insert(notifications).values({
        userId: request.buyerId,
        type: "system",
        title: "New response to your request",
        message: `A seller responded to your request: "${request.title}"`,
        data: {
          type: "request_response",
          requestId: input.requestId,
          responseId: response.id,
        },
      });

      return response;
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
