import { createTRPCRouter, sellerProcedure } from "../trpc";
import {
  sellerBuyerTags,
  sellerBuyerNotes,
  followups,
} from "../db/schema/crm";
import { conversations } from "../db/schema/conversations";
import { users } from "../db/schema/users";
import { and, eq, sql, desc, asc, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

/**
 * Maximum number of tags per seller-buyer pair.
 */
const MAX_TAGS_PER_PAIR = 10;

export const crmRouter = createTRPCRouter({
  // ====================================================================
  // TAGS
  // ====================================================================

  /**
   * Add a tag to a buyer. Respects max 10 tags per seller-buyer pair.
   * Silently ignores duplicate tags (conflict ignore on unique constraint).
   */
  addTag: sellerProcedure
    .input(
      z.object({
        buyerId: z.string().uuid(),
        tag: z
          .string()
          .min(1)
          .max(50)
          .regex(/^[a-zA-Z0-9\s\-_]+$/, "Tag must contain only letters, numbers, spaces, hyphens, or underscores"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify buyer exists
      const buyer = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.buyerId),
        columns: { id: true, role: true },
      });

      if (!buyer || (buyer.role !== "buyer" && buyer.role !== "admin")) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Buyer not found",
        });
      }

      // Enforce max tags per pair
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(sellerBuyerTags)
        .where(
          and(
            eq(sellerBuyerTags.sellerId, ctx.user.id),
            eq(sellerBuyerTags.buyerId, input.buyerId)
          )
        );

      if (count >= MAX_TAGS_PER_PAIR) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `You can add at most ${MAX_TAGS_PER_PAIR} tags per buyer`,
        });
      }

      // Insert with conflict ignore (duplicate tag for same seller/buyer pair is a no-op)
      const [tag] = await ctx.db
        .insert(sellerBuyerTags)
        .values({
          sellerId: ctx.user.id,
          buyerId: input.buyerId,
          tag: input.tag.trim().toLowerCase(),
        })
        .onConflictDoNothing()
        .returning();

      return tag ?? null;
    }),

  /**
   * Remove a tag by ID. Verifies seller ownership.
   */
  removeTag: sellerProcedure
    .input(z.object({ tagId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(sellerBuyerTags)
        .where(
          and(
            eq(sellerBuyerTags.id, input.tagId),
            eq(sellerBuyerTags.sellerId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  /**
   * Get all tags this seller has applied to a specific buyer.
   */
  getTagsForBuyer: sellerProcedure
    .input(z.object({ buyerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tags = await ctx.db.query.sellerBuyerTags.findMany({
        where: and(
          eq(sellerBuyerTags.sellerId, ctx.user.id),
          eq(sellerBuyerTags.buyerId, input.buyerId)
        ),
        orderBy: asc(sellerBuyerTags.tag),
      });

      return tags;
    }),

  /**
   * Get all unique tags this seller has ever applied (for autocomplete UI).
   */
  getAllTags: sellerProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .selectDistinct({ tag: sellerBuyerTags.tag })
      .from(sellerBuyerTags)
      .where(eq(sellerBuyerTags.sellerId, ctx.user.id))
      .orderBy(asc(sellerBuyerTags.tag));

    return rows.map((r) => r.tag);
  }),

  // ====================================================================
  // NOTES
  // ====================================================================

  /**
   * Add a private note about a buyer.
   */
  addNote: sellerProcedure
    .input(
      z.object({
        buyerId: z.string().uuid(),
        note: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify buyer exists
      const buyer = await ctx.db.query.users.findFirst({
        where: eq(users.id, input.buyerId),
        columns: { id: true },
      });

      if (!buyer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Buyer not found",
        });
      }

      const [note] = await ctx.db
        .insert(sellerBuyerNotes)
        .values({
          sellerId: ctx.user.id,
          buyerId: input.buyerId,
          note: input.note,
        })
        .returning();

      if (!note) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create note",
        });
      }

      return note;
    }),

  /**
   * Update an existing note. Verifies seller ownership.
   */
  updateNote: sellerProcedure
    .input(
      z.object({
        noteId: z.string().uuid(),
        note: z.string().min(1).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.sellerBuyerNotes.findFirst({
        where: and(
          eq(sellerBuyerNotes.id, input.noteId),
          eq(sellerBuyerNotes.sellerId, ctx.user.id)
        ),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Note not found",
        });
      }

      const [updated] = await ctx.db
        .update(sellerBuyerNotes)
        .set({ note: input.note, updatedAt: new Date() })
        .where(eq(sellerBuyerNotes.id, input.noteId))
        .returning();

      return updated;
    }),

  /**
   * Delete a note by ID. Verifies seller ownership.
   */
  deleteNote: sellerProcedure
    .input(z.object({ noteId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(sellerBuyerNotes)
        .where(
          and(
            eq(sellerBuyerNotes.id, input.noteId),
            eq(sellerBuyerNotes.sellerId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  /**
   * Get all notes for a specific buyer, ordered newest first.
   */
  getNotesForBuyer: sellerProcedure
    .input(z.object({ buyerId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const notes = await ctx.db.query.sellerBuyerNotes.findMany({
        where: and(
          eq(sellerBuyerNotes.sellerId, ctx.user.id),
          eq(sellerBuyerNotes.buyerId, input.buyerId)
        ),
        orderBy: desc(sellerBuyerNotes.createdAt),
      });

      return notes;
    }),

  // ====================================================================
  // FOLLOWUPS
  // ====================================================================

  /**
   * Create a follow-up task (optionally linked to a buyer or conversation).
   */
  createFollowup: sellerProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        dueAt: z.date(),
        buyerId: z.string().uuid().optional(),
        conversationId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [followup] = await ctx.db
        .insert(followups)
        .values({
          sellerId: ctx.user.id,
          title: input.title,
          dueAt: input.dueAt,
          buyerId: input.buyerId,
          conversationId: input.conversationId,
          status: "pending",
        })
        .returning();

      if (!followup) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create follow-up",
        });
      }

      return followup;
    }),

  /**
   * Get follow-ups for the current seller, filterable by status, sorted by dueAt asc.
   * Defaults to showing pending follow-ups.
   */
  getMyFollowups: sellerProcedure
    .input(
      z.object({
        status: z
          .enum(["pending", "completed", "cancelled"])
          .default("pending"),
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      const whereCondition = and(
        eq(followups.sellerId, ctx.user.id),
        eq(followups.status, input.status)
      );

      const [items, countResult] = await Promise.all([
        ctx.db.query.followups.findMany({
          where: whereCondition,
          orderBy: asc(followups.dueAt),
          limit: input.limit,
          offset,
        }),
        ctx.db
          .select({ count: sql<number>`cast(count(*) as integer)` })
          .from(followups)
          .where(whereCondition),
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
   * Mark a follow-up as completed. Verifies seller ownership.
   */
  completeFollowup: sellerProcedure
    .input(z.object({ followupId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const followup = await ctx.db.query.followups.findFirst({
        where: and(
          eq(followups.id, input.followupId),
          eq(followups.sellerId, ctx.user.id)
        ),
      });

      if (!followup) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Follow-up not found",
        });
      }

      if (followup.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Follow-up is not in a pending state",
        });
      }

      const now = new Date();

      const [updated] = await ctx.db
        .update(followups)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(eq(followups.id, input.followupId))
        .returning();

      return updated;
    }),

  /**
   * Cancel a follow-up. Verifies seller ownership.
   */
  cancelFollowup: sellerProcedure
    .input(z.object({ followupId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const followup = await ctx.db.query.followups.findFirst({
        where: and(
          eq(followups.id, input.followupId),
          eq(followups.sellerId, ctx.user.id)
        ),
      });

      if (!followup) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Follow-up not found",
        });
      }

      if (followup.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only pending follow-ups can be cancelled",
        });
      }

      const [updated] = await ctx.db
        .update(followups)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(followups.id, input.followupId))
        .returning();

      return updated;
    }),

  /**
   * Get follow-ups due today or already overdue (status: pending).
   */
  getDueToday: sellerProcedure.query(async ({ ctx }) => {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const items = await ctx.db.query.followups.findMany({
      where: and(
        eq(followups.sellerId, ctx.user.id),
        eq(followups.status, "pending"),
        lte(followups.dueAt, endOfToday)
      ),
      orderBy: asc(followups.dueAt),
    });

    return items;
  }),

  // ====================================================================
  // EXPORT
  // ====================================================================

  /**
   * Export a CSV of all buyers this seller has interacted with via conversations.
   * Columns: buyerName, businessName, tags, noteCount, conversationCount, lastInteraction.
   */
  exportLeadsCsv: sellerProcedure.query(async ({ ctx }) => {
    // Get all conversations for this seller to find unique buyers
    const sellerConversations = await ctx.db.query.conversations.findMany({
      where: eq(conversations.sellerId, ctx.user.id),
      orderBy: desc(conversations.lastMessageAt),
      with: {
        buyer: {
          columns: {
            id: true,
            name: true,
            businessName: true,
          },
        },
      },
    });

    if (sellerConversations.length === 0) {
      return "buyerName,businessName,tags,noteCount,conversationCount,lastInteraction\n";
    }

    // Deduplicate buyers and collect conversation stats
    const buyerMap = new Map<
      string,
      {
        id: string;
        name: string;
        businessName: string | null;
        conversationCount: number;
        lastInteraction: Date;
      }
    >();

    for (const conv of sellerConversations) {
      const existing = buyerMap.get(conv.buyerId);
      if (existing) {
        existing.conversationCount += 1;
        if (conv.lastMessageAt > existing.lastInteraction) {
          existing.lastInteraction = conv.lastMessageAt;
        }
      } else {
        buyerMap.set(conv.buyerId, {
          id: conv.buyerId,
          name: conv.buyer.name,
          businessName: conv.buyer.businessName,
          conversationCount: 1,
          lastInteraction: conv.lastMessageAt,
        });
      }
    }

    const buyerIds = Array.from(buyerMap.keys());

    // Fetch tags and notes for all buyers in batch
    const [allTags, allNotes] = await Promise.all([
      ctx.db.query.sellerBuyerTags.findMany({
        where: and(
          eq(sellerBuyerTags.sellerId, ctx.user.id),
          sql`${sellerBuyerTags.buyerId} = ANY(ARRAY[${sql.join(
            buyerIds.map((id) => sql`${id}::uuid`),
            sql`, `
          )}])`
        ),
        columns: { buyerId: true, tag: true },
      }),
      ctx.db
        .select({
          buyerId: sellerBuyerNotes.buyerId,
          count: sql<number>`cast(count(*) as integer)`,
        })
        .from(sellerBuyerNotes)
        .where(
          and(
            eq(sellerBuyerNotes.sellerId, ctx.user.id),
            sql`${sellerBuyerNotes.buyerId} = ANY(ARRAY[${sql.join(
              buyerIds.map((id) => sql`${id}::uuid`),
              sql`, `
            )}])`
          )
        )
        .groupBy(sellerBuyerNotes.buyerId),
    ]);

    // Build lookup maps for tags and note counts
    const tagsByBuyer = new Map<string, string[]>();
    for (const t of allTags) {
      const existing = tagsByBuyer.get(t.buyerId) ?? [];
      existing.push(t.tag);
      tagsByBuyer.set(t.buyerId, existing);
    }

    const noteCountByBuyer = new Map<string, number>();
    for (const n of allNotes) {
      noteCountByBuyer.set(n.buyerId, n.count);
    }

    // Build CSV rows
    const escapeCsv = (val: string) =>
      `"${val.replace(/"/g, '""')}"`;

    const header =
      "buyerName,businessName,tags,noteCount,conversationCount,lastInteraction";

    const rows = Array.from(buyerMap.values()).map((buyer) => {
      const tags = (tagsByBuyer.get(buyer.id) ?? []).join("; ");
      const noteCount = noteCountByBuyer.get(buyer.id) ?? 0;

      return [
        escapeCsv(buyer.name),
        escapeCsv(buyer.businessName ?? ""),
        escapeCsv(tags),
        noteCount.toString(),
        buyer.conversationCount.toString(),
        buyer.lastInteraction.toISOString(),
      ].join(",");
    });

    return [header, ...rows].join("\n");
  }),
});
