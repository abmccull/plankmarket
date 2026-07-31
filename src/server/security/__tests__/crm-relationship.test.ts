import { describe, expect, it, vi } from "vitest";
import {
  assertSellerBuyerRelationship,
  hasSellerBuyerRelationship,
  requireSellerConversation,
} from "@/server/security/crm-relationship";

function createDatabase(results: {
  conversation?: object | null;
  offer?: object | null;
  order?: object | null;
  ownedConversation?: object | null;
}) {
  return {
    query: {
      conversations: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(results.conversation ?? null)
          .mockResolvedValue(results.ownedConversation ?? null),
      },
      offers: {
        findFirst: vi.fn().mockResolvedValue(results.offer ?? null),
      },
      orders: {
        findFirst: vi.fn().mockResolvedValue(results.order ?? null),
      },
    },
  } as unknown as Parameters<typeof hasSellerBuyerRelationship>[0];
}

describe("CRM relationship authorization", () => {
  it("accepts an established order, offer, or conversation relationship", async () => {
    const database = createDatabase({ order: { id: "order-1" } });

    await expect(
      hasSellerBuyerRelationship(database, "seller-1", "buyer-1"),
    ).resolves.toBe(true);
  });

  it("fails closed for an unrelated buyer UUID", async () => {
    const database = createDatabase({});

    await expect(
      assertSellerBuyerRelationship(database, "seller-1", "buyer-1"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Buyer relationship not found",
    });
  });

  it("requires a follow-up conversation to belong to the seller", async () => {
    const database = createDatabase({});

    await expect(
      requireSellerConversation(database, "seller-1", "conversation-1"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Conversation not found",
    });
  });
});
