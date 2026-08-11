import {
  buyerProcedure,
  createTRPCRouter,
  protectedProcedure,
  messagingProcedure,
} from "../trpc";
import {
  sendMessageSchema,
  getMessagesSchema,
} from "@/lib/validators/message";
import { conversations, messages, listings, media, orders } from "../db/schema";
import { eq, and, or, desc, asc, gt, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { detectSelfReference } from "@/lib/content-filter";
import { logContentViolation } from "@/server/services/content-moderation";
import { toConversationParty } from "@/server/security/public-data";
import { assertListingVisibleToViewer } from "@/server/security/listing-visibility";

const conversationPartyColumns = {
  id: true,
  name: true,
  role: true,
  businessCity: true,
  businessState: true,
  verificationStatus: true,
} as const;

type ConversationIdentity = {
  listingId: string;
  buyerId: string;
  sellerId: string;
};

function conversationIdentityKey(conversation: {
  listingId: string;
  buyerId: string;
  sellerId: string;
}) {
  return `${conversation.listingId}:${conversation.buyerId}:${conversation.sellerId}`;
}

async function canRevealConversationIdentity(
  db: typeof import("@/server/db").db,
  conversation: { listingId: string; buyerId: string; sellerId: string },
) {
  const deliveredOrder = await db.query.orders.findFirst({
    where: and(
      eq(orders.listingId, conversation.listingId),
      eq(orders.buyerId, conversation.buyerId),
      eq(orders.sellerId, conversation.sellerId),
      eq(orders.status, "delivered"),
    ),
    columns: { id: true },
  });

  return Boolean(deliveredOrder);
}

async function getRevealableConversationKeys(
  db: typeof import("@/server/db").db,
  conversationsList: ConversationIdentity[],
) {
  if (conversationsList.length === 0) {
    return new Set<string>();
  }

  const uniqueConversations = [...new Map(
    conversationsList.map((conversation) => [
      conversationIdentityKey(conversation),
      conversation,
    ]),
  ).values()];

  const deliveredTriplets = uniqueConversations.map((conversation) =>
    and(
      eq(orders.listingId, conversation.listingId),
      eq(orders.buyerId, conversation.buyerId),
      eq(orders.sellerId, conversation.sellerId),
    ),
  );

  const deliveredOrders = await db
    .select({
      listingId: orders.listingId,
      buyerId: orders.buyerId,
      sellerId: orders.sellerId,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, "delivered"),
        or(...deliveredTriplets)!,
      ),
    );

  return new Set(deliveredOrders.map(conversationIdentityKey));
}

function shapeConversation<
  T extends {
    buyer: Parameters<typeof toConversationParty>[0];
    seller: Parameters<typeof toConversationParty>[0];
  },
>(conversation: T, revealIdentity: boolean) {
  return {
    ...conversation,
    buyer: toConversationParty(conversation.buyer, revealIdentity),
    seller: toConversationParty(conversation.seller, revealIdentity),
  };
}

export const messageRouter = createTRPCRouter({
  // Get or create a conversation for a listing
  getOrCreateConversation: buyerProcedure
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
            columns: conversationPartyColumns,
          },
          buyer: {
            columns: conversationPartyColumns,
          },
        },
      });

      if (existingConversation) {
        const revealIdentity = await canRevealConversationIdentity(
          ctx.db,
          existingConversation,
        );
        return shapeConversation(existingConversation, revealIdentity);
      }

      // Existing participants retain their history after a listing closes, but
      // a caller cannot use a known UUID to open a new conversation against an
      // expired, stale, or territory-restricted listing.
      assertListingVisibleToViewer(
        listing,
        ctx.user,
        "Listing is not available for messaging",
      );

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
            columns: conversationPartyColumns,
          },
          buyer: {
            columns: conversationPartyColumns,
          },
        },
      });

      if (!conversation) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create conversation",
        });
      }

      return shapeConversation(conversation, false);
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

      // Check for self-referencing identity info (business name, full name)
      const selfRefDetections = detectSelfReference(input.body, ctx.user);
      const highConfidence = selfRefDetections.filter(d => d.level === "high");
      const mediumConfidence = selfRefDetections.filter(d => d.level === "medium");

      if (highConfidence.length > 0) {
        await logContentViolation({
          userId: ctx.user.id,
          contentType: "message",
          contentBody: input.body,
          detections: highConfidence,
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Your message appears to contain identifying business information. For your security, all communication must stay on PlankMarket.",
        });
      }

      // Log medium-confidence detections for admin review (don't block)
      if (mediumConfidence.length > 0) {
        await logContentViolation({
          userId: ctx.user.id,
          contentType: "message",
          contentBody: input.body,
          detections: mediumConfidence,
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

  getConversation: protectedProcedure
    .input(z.object({ conversationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const conversation = await ctx.db.query.conversations.findFirst({
        where: and(
          eq(conversations.id, input.conversationId),
          or(
            eq(conversations.buyerId, ctx.user.id),
            eq(conversations.sellerId, ctx.user.id),
          ),
        ),
        with: {
          listing: {
            columns: {
              id: true,
              title: true,
            },
            with: {
              media: {
                columns: {
                  id: true,
                  url: true,
                  altText: true,
                  sortOrder: true,
                },
                limit: 1,
                orderBy: [asc(media.sortOrder)],
              },
            },
          },
          buyer: {
            columns: conversationPartyColumns,
          },
          seller: {
            columns: conversationPartyColumns,
          },
          messages: {
            limit: 1,
            orderBy: [desc(messages.createdAt)],
          },
        },
      });

      if (!conversation) {
        return null;
      }

      const revealableConversationKeys = await getRevealableConversationKeys(
        ctx.db,
        [conversation],
      );

      return shapeConversation(
        conversation,
        revealableConversationKeys.has(conversationIdentityKey(conversation)),
      );
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
                columns: {
                  id: true,
                  url: true,
                  altText: true,
                  sortOrder: true,
                },
                limit: 1,
                orderBy: [asc(media.sortOrder)],
              },
            },
          },
          buyer: {
            columns: conversationPartyColumns,
          },
          seller: {
            columns: conversationPartyColumns,
          },
          messages: {
            limit: 1,
            orderBy: [desc(messages.createdAt)],
          },
        },
      });

      const revealableConversationKeys = await getRevealableConversationKeys(
        ctx.db,
        conversationsList,
      );
      const shapedConversations = conversationsList.map((conversation) =>
        shapeConversation(
          conversation,
          revealableConversationKeys.has(conversationIdentityKey(conversation)),
        ),
      );

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
        conversations: shapedConversations,
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
            columns: conversationPartyColumns,
          },
        },
      });

      const revealIdentity = await canRevealConversationIdentity(
        ctx.db,
        conversation,
      );
      return messagesList.map((message) => ({
        ...message,
        sender: toConversationParty(message.sender, revealIdentity),
      }));
    }),

  // Mark a conversation as read
  markAsRead: protectedProcedure
    .input(
      z.object({
        conversationId: z.string().uuid(),
        latestMessageId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Find conversation and verify participation
      const conversation = await ctx.db.query.conversations.findFirst({
        where: eq(conversations.id, input.conversationId),
        columns: {
          id: true,
          buyerId: true,
          sellerId: true,
          buyerLastReadAt: true,
          sellerLastReadAt: true,
        },
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

      const isBuyer = conversation.buyerId === ctx.user.id;
      const currentLastReadAt = isBuyer
        ? conversation.buyerLastReadAt
        : conversation.sellerLastReadAt;

      const latestMessage = await ctx.db.query.messages.findFirst({
        where: and(
          eq(messages.id, input.latestMessageId),
          eq(messages.conversationId, input.conversationId),
        ),
        columns: {
          id: true,
          senderId: true,
          createdAt: true,
        },
      });

      if (!latestMessage || latestMessage.senderId === ctx.user.id) {
        return {
          updated: false,
          lastReadAt: currentLastReadAt,
        };
      }

      if (
        currentLastReadAt &&
        latestMessage.createdAt <= currentLastReadAt
      ) {
        return {
          updated: false,
          lastReadAt: currentLastReadAt,
        };
      }

      const [updated] = await ctx.db
        .update(conversations)
        .set(
          isBuyer
            ? { buyerLastReadAt: latestMessage.createdAt }
            : { sellerLastReadAt: latestMessage.createdAt }
        )
        .where(
          and(
            eq(conversations.id, input.conversationId),
            isBuyer
              ? or(
                  sql`${conversations.buyerLastReadAt} IS NULL`,
                  lt(conversations.buyerLastReadAt, latestMessage.createdAt),
                )
              : or(
                  sql`${conversations.sellerLastReadAt} IS NULL`,
                  lt(conversations.sellerLastReadAt, latestMessage.createdAt),
                ),
          ),
        )
        .returning({
          lastReadAt: isBuyer
            ? conversations.buyerLastReadAt
            : conversations.sellerLastReadAt,
        });

      return {
        updated: Boolean(updated),
        lastReadAt: updated?.lastReadAt ?? currentLastReadAt,
      };
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
