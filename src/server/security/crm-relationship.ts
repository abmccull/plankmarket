import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { db as applicationDb } from "@/server/db";
import { conversations, offers, orders } from "@/server/db/schema";

type Database = typeof applicationDb;

export async function hasSellerBuyerRelationship(
  database: Database,
  sellerId: string,
  buyerId: string,
): Promise<boolean> {
  const [conversation, offer, order] = await Promise.all([
    database.query.conversations.findFirst({
      where: and(
        eq(conversations.sellerId, sellerId),
        eq(conversations.buyerId, buyerId),
      ),
      columns: { id: true },
    }),
    database.query.offers.findFirst({
      where: and(
        eq(offers.sellerId, sellerId),
        eq(offers.buyerId, buyerId),
      ),
      columns: { id: true },
    }),
    database.query.orders.findFirst({
      where: and(
        eq(orders.sellerId, sellerId),
        eq(orders.buyerId, buyerId),
      ),
      columns: { id: true },
    }),
  ]);

  return Boolean(conversation || offer || order);
}

export async function assertSellerBuyerRelationship(
  database: Database,
  sellerId: string,
  buyerId: string,
): Promise<void> {
  if (!(await hasSellerBuyerRelationship(database, sellerId, buyerId))) {
    // A generic response avoids turning the CRM endpoint into a user UUID
    // enumeration oracle.
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Buyer relationship not found",
    });
  }
}

export async function requireSellerConversation(
  database: Database,
  sellerId: string,
  conversationId: string,
) {
  const conversation = await database.query.conversations.findFirst({
    where: and(
      eq(conversations.id, conversationId),
      eq(conversations.sellerId, sellerId),
    ),
    columns: {
      id: true,
      buyerId: true,
      sellerId: true,
    },
  });

  if (!conversation) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conversation not found",
    });
  }

  return conversation;
}
