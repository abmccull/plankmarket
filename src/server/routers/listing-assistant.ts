import { createTRPCRouter, sellerProcedure } from "../trpc";
import { listingDraftsAi } from "../db/schema/listing-drafts-ai";
import { extractListingFields } from "@/lib/ai/listing-extractor";
import { and, eq, sql, desc, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

/**
 * Maximum number of AI extraction drafts a seller may create per hour.
 */
const MAX_DRAFTS_PER_HOUR = 10;

export const listingAssistantRouter = createTRPCRouter({
  /**
   * Extract structured listing fields from raw pasted text (spec sheets, invoices, etc.).
   * Rate-limited to MAX_DRAFTS_PER_HOUR per seller per hour.
   * Creates a draft record, calls the AI extractor, then updates the draft with results.
   */
  extract: sellerProcedure
    .input(
      z.object({
        rawText: z
          .string()
          .min(1, "Input text cannot be empty")
          .max(10000, "Input text must be 10,000 characters or fewer"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limit: count drafts created in the last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(listingDraftsAi)
        .where(
          and(
            eq(listingDraftsAi.sellerId, ctx.user.id),
            gt(listingDraftsAi.createdAt, oneHourAgo)
          )
        );

      if (count >= MAX_DRAFTS_PER_HOUR) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `You can extract at most ${MAX_DRAFTS_PER_HOUR} listings per hour. Please wait before trying again.`,
        });
      }

      // Create the draft record in 'processing' state
      const [draft] = await ctx.db
        .insert(listingDraftsAi)
        .values({
          sellerId: ctx.user.id,
          rawInputText: input.rawText,
          status: "processing",
        })
        .returning();

      if (!draft) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create draft record",
        });
      }

      // Call the AI extractor and update the draft with results
      try {
        const { fields, confidence } = await extractListingFields(
          input.rawText
        );

        const [updated] = await ctx.db
          .update(listingDraftsAi)
          .set({
            extractedFields: fields,
            confidence,
            status: "ready",
            updatedAt: new Date(),
          })
          .where(eq(listingDraftsAi.id, draft.id))
          .returning();

        return updated ?? draft;
      } catch (error) {
        // Mark draft as failed so the user can retry
        await ctx.db
          .update(listingDraftsAi)
          .set({
            status: "failed",
            errorMessage:
              error instanceof Error
                ? error.message
                : "Unknown extraction error",
            updatedAt: new Date(),
          })
          .where(eq(listingDraftsAi.id, draft.id));

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI extraction failed. Please try again.",
        });
      }
    }),

  /**
   * Get a single AI draft by ID. Verifies seller ownership.
   */
  getDraft: sellerProcedure
    .input(z.object({ draftId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const draft = await ctx.db.query.listingDraftsAi.findFirst({
        where: and(
          eq(listingDraftsAi.id, input.draftId),
          eq(listingDraftsAi.sellerId, ctx.user.id)
        ),
      });

      if (!draft) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft not found",
        });
      }

      return draft;
    }),

  /**
   * Get a paginated list of the seller's AI drafts, ordered newest first.
   */
  getMyDrafts: sellerProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const [items, countResult] = await Promise.all([
        ctx.db.query.listingDraftsAi.findMany({
          where: eq(listingDraftsAi.sellerId, ctx.user.id),
          orderBy: desc(listingDraftsAi.createdAt),
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(listingDraftsAi)
          .where(eq(listingDraftsAi.sellerId, ctx.user.id)),
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
   * Return the extracted fields from a draft filtered to only the seller-selected fields.
   * Marks the draft as 'applied'. Frontend uses these to pre-populate the listing form.
   */
  applyToListing: sellerProcedure
    .input(
      z.object({
        draftId: z.string().uuid(),
        selectedFields: z.array(z.string()).min(1, "Select at least one field"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const draft = await ctx.db.query.listingDraftsAi.findFirst({
        where: and(
          eq(listingDraftsAi.id, input.draftId),
          eq(listingDraftsAi.sellerId, ctx.user.id)
        ),
      });

      if (!draft) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft not found",
        });
      }

      if (draft.status !== "ready") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Draft is not ready for application (status: ${draft.status})`,
        });
      }

      if (!draft.extractedFields) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No extracted fields available on this draft",
        });
      }

      // Filter extracted fields to only the ones the seller selected
      const selectedData: Record<string, unknown> = {};
      for (const field of input.selectedFields) {
        const value =
          (draft.extractedFields as Record<string, unknown>)[field];
        if (value !== undefined) {
          selectedData[field] = value;
        }
      }

      // Mark draft as applied
      await ctx.db
        .update(listingDraftsAi)
        .set({ status: "applied", updatedAt: new Date() })
        .where(eq(listingDraftsAi.id, input.draftId));

      return {
        fields: selectedData,
        confidence: draft.confidence ?? {},
        draftId: draft.id,
      };
    }),

  /**
   * Delete a draft by ID. Verifies seller ownership.
   */
  deleteDraft: sellerProcedure
    .input(z.object({ draftId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const draft = await ctx.db.query.listingDraftsAi.findFirst({
        where: and(
          eq(listingDraftsAi.id, input.draftId),
          eq(listingDraftsAi.sellerId, ctx.user.id)
        ),
        columns: { id: true },
      });

      if (!draft) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft not found",
        });
      }

      await ctx.db
        .delete(listingDraftsAi)
        .where(eq(listingDraftsAi.id, input.draftId));

      return { success: true };
    }),
});
