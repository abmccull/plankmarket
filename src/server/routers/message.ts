import {
  createTRPCRouter,
  protectedProcedure,
  verifiedProcedure,
  messagingProcedure,
} from "../trpc";
import {
  sendMessageSchema,
  getMessagesSchema,
} from "@/lib/validators/message";
import { conversations, messages, listings, media } from "../db/schema";
import { eq, and, or, desc, asc, gt, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const messageRouter = createTRPCRouter({
  // Get or create a conversation for a listing
  getOrCreateConversation: verifiedProcedure
    .input(z.object({ listingId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get the listing to determine seller
      const listing = await ctx.db.query.listings.findFirst({
        where: eq(listings.id, input.listingId),
      });

      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      // Prevent messaging yourself
      if (listing.sellerId === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Cannot message yourself",
        });
      }

      // Find existing conversation
      const existingConversation = await ctx.db.query.conversations.findFirst({
        where: and(
          eq(conversations.listingId, input.listingId),
          eq(conversations.buyerId, ctx.user.id)
        ),
        with: {
          listing: {
            columns: {
              id: true,
              title: true,
              status: true,
            },
          },
          seller: {
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
          buyer: {
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
        },
      });

      if (existingConversation) {
        return existingConversation;
      }

      // Create new conversation
      const [newConversation] = await ctx.db
        .insert(conversations)
        .values({
          listingId: input.listingId,
          buyerId: ctx.user.id,
          sellerId: listing.sellerId,
        })
        .returning();

      // Fetch the full conversation with relations
      const conversation = await ctx.db.query.conversations.findFirst({
        where: eq(conversations.id, newConversation.id),
        with: {
          listing: {
            columns: {
              id: true,
              title: true,
              status: true,
            },
          },
          seller: {
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
          buyer: {
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
        },
      });

      return conversation;
    }),

  // Send a message in a conversation (uses messagingProcedure for content policy enforcement)
  sendMessage: messagingProcedure
    .input(sendMessageSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify user is participant in conversation
      const conversation = await ctx.db.query.conversations.findFirst({
        where: eq(conversations.id, input.conversationId),
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      // Verify user is buyer or seller
      if (
        conversation.buyerId !== ctx.user.id &&
        conversation.sellerId !== ctx.user.id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a participant in this conversation",
        });
      }

      // Insert the message
      const [message] = await ctx.db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          senderId: ctx.user.id,
          body: input.body,
        })
        .returning();

      // Update conversation lastMessageAt
      await ctx.db
        .update(conversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(conversations.id, input.conversationId));

      return message;
    }),

  // Get all conversations for current user
  getMyConversations: protectedProcedure
    .input(
      z.object({
        page: z.number().int().positive().default(1),
        limit: z.number().int().positive().max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = (input.page - 1) * input.limit;

      // Get conversations where user is buyer or seller
      const conversationsList = await ctx.db.query.conversations.findMany({
        where: or(
          eq(conversations.buyerId, ctx.user.id),
          eq(conversations.sellerId, ctx.user.id)
        ),
        orderBy: [desc(conversations.lastMessageAt)],
        limit: input.limit,
        offset,
        with: {
          listing: {
            columns: {
              id: true,
              title: true,
            },
            with: {
              media: {
                limit: 1,
                orderBy: [asc(media.sortOrder)],
              },
            },
          },
          buyer: {
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
          seller: {
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
          messages: {
            limit: 1,
            orderBy: [desc(messages.createdAt)],
          },
        },
      });

      // Get total count
      const [{ count }] = await ctx.db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(conversations)
        .where(
          or(
            eq(conversations.buyerId, ctx.user.id),
            eq(conversations.sellerId, ctx.user.id)
          )
        );

      return {
        conversations: conversationsList,
        total: count,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(count / input.limit),
      };
    }),

  // Get messages for a conversation
  getMessages: protectedProcedure
    .input(getMessagesSchema)
    .query(async ({ ctx, input }) => {
      // Verify user is participant
      const conversation = await ctx.db.query.conversations.findFirst({
        where: eq(conversations.id, input.conversationId),
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      // Verify user is buyer or seller
      if (
        conversation.buyerId !== ctx.user.id &&
        conversation.sellerId !== ctx.user.id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a participant in this conversation",
        });
      }

      // Build where clause for cursor-based pagination
      const whereClause = input.cursor
        ? and(
            eq(messages.conversationId, input.conversationId),
            lt(messages.createdAt, sql`(SELECT created_at FROM messages WHERE id = ${input.cursor})`)
          )!
        : eq(messages.conversationId, input.conversationId);

      // Get messages ordered by createdAt ASC
      const messagesList = await ctx.db.query.messages.findMany({
        where: whereClause,
        orderBy: [asc(messages.createdAt)],
        limit: input.limit,
        with: {
          sender: {
            columns: {
              id: true,
              role: true,
              businessState: true,
            },
          },
        },
      });

      // Update user's lastReadAt
      const isBuyer = conversation.buyerId === ctx.user.id;
      await ctx.db
        .update(conversations)
        .set(
          isBuyer
            ? { buyerLastReadAt: new Date() }
            : { sellerLastReadAt: new Date() }
        )
        .where(eq(conversations.id, input.conversationId));

      return messagesList;
    }),

  // Mark a conversation as read
  markAsRead: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Find conversation and verify participation
      const conversation = await ctx.db.query.conversations.findFirst({
        where: eq(conversations.id, input.conversationId),
      });

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      // Verify user is buyer or seller
      if (
        conversation.buyerId !== ctx.user.id &&
        conversation.sellerId !== ctx.user.id
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a participant in this conversation",
        });
      }

      // Update lastReadAt based on user role
      const isBuyer = conversation.buyerId === ctx.user.id;
      const [updated] = await ctx.db
        .update(conversations)
        .set(
          isBuyer
            ? { buyerLastReadAt: new Date() }
            : { sellerLastReadAt: new Date() }
        )
        .where(eq(conversations.id, input.conversationId))
        .returning();

      return updated;
    }),

  // Get unread message count for current user
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    // Count unread messages for buyer conversations
    const [buyerResult] = await ctx.db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(messages)
      .innerJoin(
        conversations,
        eq(messages.conversationId, conversations.id)
      )
      .where(
        and(
          eq(conversations.buyerId, ctx.user.id),
          sql`${messages.senderId} != ${ctx.user.id}`,
          or(
            sql`${conversations.buyerLastReadAt} IS NULL`,
            gt(messages.createdAt, conversations.buyerLastReadAt)
          )
        )
      );

    // Count unread messages for seller conversations
    const [sellerResult] = await ctx.db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(messages)
      .innerJoin(
        conversations,
        eq(messages.conversationId, conversations.id)
      )
      .where(
        and(
          eq(conversations.sellerId, ctx.user.id),
          sql`${messages.senderId} != ${ctx.user.id}`,
          or(
            sql`${conversations.sellerLastReadAt} IS NULL`,
            gt(messages.createdAt, conversations.sellerLastReadAt)
          )
        )
      );

    const totalUnread = (buyerResult?.count ?? 0) + (sellerResult?.count ?? 0);

    return { count: totalUnread };
  }),
});
