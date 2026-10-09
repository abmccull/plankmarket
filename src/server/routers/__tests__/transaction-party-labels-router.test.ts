import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { createTRPCContext } from "@/server/trpc";

process.env.SKIP_ENV_VALIDATION = "1";
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/redis/client", () => ({ getRedisClient: () => ({}), redis: {} }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() { return {}; }
    async limit() { return { success: true }; }
  },
}));
vi.mock("@/server/services/content-moderation", () => ({ checkViolationStatus: vi.fn(), logContentViolation: vi.fn() }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: vi.fn() } }));

const { createCallerFactory, createTRPCRouter } = await import("@/server/trpc");
const { offerRouter } = await import("@/server/routers/offer");
const { messageRouter } = await import("@/server/routers/message");
const { orders } = await import("@/server/db/schema");
const createCaller = createCallerFactory(createTRPCRouter({ offer: offerRouter, message: messageRouter }));
const dialect = new PgDialect();
const BUYER = "11111111-1111-4111-8111-111111111111";
const SELLER = "22222222-2222-4222-8222-222222222222";
const SUPPORT = "33333333-3333-4333-8333-333333333333";
const FOREIGN = "44444444-4444-4444-8444-444444444444";
const LISTING = "55555555-5555-4555-8555-555555555555";
const OFFER = "66666666-6666-4666-8666-666666666666";
const CONVERSATION = "77777777-7777-4777-8777-777777777777";
const ORDER = "88888888-8888-4888-8888-888888888888";
type AccountRole = "buyer" | "seller" | "admin";
type Party = {
  id: string; name: string; role: AccountRole; businessCity: string;
  businessState: string; verificationStatus: "verified" | "unverified" | "pending" | "rejected";
};
type ShapedParty = {
  id: string; name: string | null; role: AccountRole; displayName: string; verified: boolean;
  identityRevealed: boolean; businessCity?: string | null; businessState?: string | null;
};
function party(id: string, role: AccountRole, name: string, verified = true): Party {
  return Object.freeze({ id, role, name, businessCity: "Denver", businessState: "CO", verificationStatus: verified ? "verified" : "pending" });
}
function fixture(options: {
  accountRole?: AccountRole; viewerId?: string; delivered?: boolean;
  buyerVerified?: boolean; includeUnexpectedActor?: boolean; noOrder?: boolean;
  createConversation?: boolean; reverseParticipants?: boolean;
  buyerStatus?: Party["verificationStatus"]; sellerStatus?: Party["verificationStatus"];
} = {}) {
  // Both customers have seller accounts; one is buying this transaction.
  const buyerId = options.reverseParticipants ? SELLER : BUYER;
  const sellerId = options.reverseParticipants ? BUYER : SELLER;
  const buyer = Object.freeze({ ...party(buyerId, "seller", "Private buying business", options.buyerVerified ?? true),
    ...(options.buyerStatus ? { verificationStatus: options.buyerStatus } : {}) });
  const seller = Object.freeze({ ...party(sellerId, "seller", "Private selling business"),
    ...(options.sellerStatus ? { verificationStatus: options.sellerStatus } : {}) });
  const support = party(SUPPORT, "admin", "Support staff name");
  const unexpected = party(FOREIGN, "seller", "Unrelated private business");
  const actors = [buyer, seller, support, ...(options.includeUnexpectedActor ? [unexpected] : [])];
  const events = actors.map((actor, index) => ({
    id: `a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    offerId: OFFER, actorId: actor.id, actor, eventType: "initial_offer",
    createdAt: new Date(`2026-10-01T12:0${index}:00Z`),
  }));
  const offer = {
    id: OFFER, listingId: LISTING, buyerId, sellerId,
    buyer, seller, events, orderId: options.noOrder ? null : ORDER, status: "accepted",
    listing: {
      id: LISTING, sellerId, title: "Synthetic oak stock", status: "active",
      lastConfirmedAt: new Date(), confirmationDueAt: new Date(Date.now() + 86_400_000),
      territoryMode: "unrestricted", allowedDestinationStates: null,
    },
  };
  const conversation = {
    id: CONVERSATION, listingId: LISTING, buyerId, sellerId,
    buyer, seller, listing: offer.listing, messages: [],
  };
  const messages = actors.map((sender, index) => ({
    id: `b0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    conversationId: CONVERSATION, senderId: sender.id, sender, body: "Synthetic message",
    createdAt: new Date(`2026-10-01T12:0${index}:00Z`),
  }));
  const queryOrders = vi.fn().mockResolvedValue(options.delivered ? { id: ORDER } : null);
  const queryOffers = vi.fn().mockResolvedValue(offer);
  const queryConversations = vi.fn().mockResolvedValue(conversation);
  if (options.createConversation) queryConversations.mockResolvedValueOnce(null);
  const queryMessages = vi.fn().mockImplementation(async () => [...messages].reverse());
  const queryEvents = vi.fn().mockResolvedValue([...events].reverse());
  const queryOfferList = vi.fn().mockResolvedValue([offer]);
  const queryConversationList = vi.fn().mockResolvedValue([conversation]);
  const selectedOrders: SQL[] = [];
  const mutation = vi.fn(() => { throw new Error("Participant label reads must not mutate state"); });
  const createValues = vi.fn(() => ({ returning: async () => [{ id: CONVERSATION }] }));
  const insert = vi.fn(() => {
    if (!options.createConversation) throw new Error("A read/existing conversation cannot insert");
    return { values: createValues };
  });
  const assurance = vi.fn(() => { throw new Error("No elevated admin participation override is allowed"); });
  const db = {
    query: {
      offers: { findFirst: queryOffers, findMany: queryOfferList },
      offerEvents: { findMany: queryEvents },
      conversations: { findFirst: queryConversations, findMany: queryConversationList },
      messages: { findMany: queryMessages },
      listings: { findFirst: vi.fn().mockResolvedValue(offer.listing) },
      orders: { findFirst: queryOrders },
    },
    select: vi.fn(() => ({
      from: (table: unknown) => ({
        where: async (where: SQL) => {
          if (getTableName(table as typeof orders) === getTableName(orders)) {
            selectedOrders.push(where);
            return options.delivered ? [{ id: ORDER, listingId: LISTING, buyerId, sellerId }] : [];
          }
          return [{ count: 1 }];
        },
      }),
    })),
    update: mutation, insert, delete: mutation,
  };
  const context = {
    db, authUser: { id: `auth-${options.viewerId ?? buyerId}` },
    user: { id: options.viewerId ?? buyerId, role: options.accountRole ?? "seller", active: true, verificationStatus: "verified" },
    supabase: {}, clientIp: "127.0.0.1", getAuthAssurance: assurance,
  } as unknown as Awaited<ReturnType<typeof createTRPCContext>>;
  return {
    caller: createCaller(context), buyer, seller, support, unexpected, events, messages, offer, conversation, context,
    buyerId, sellerId, queryOfferList, queryConversationList,
    queryOrders, queryOffers, queryConversations, queryMessages, queryEvents,
    selectedOrders, mutation, insert, createValues, assurance,
  };
}
function masked(party: ShapedParty, side: "buyer" | "seller", verified = true) {
  expect(party).toMatchObject({ name: null, identityRevealed: false, verified, role: side });
  expect(party).not.toHaveProperty("businessCity");
  expect(party).not.toHaveProperty("businessState");
  const noun = side === "buyer" ? "(Buyer|Professional)" : "(Seller|Supplier)";
  expect(party.displayName).toMatch(new RegExp(`^${verified ? "Verified " : ""}${noun}$`));
}
function revealed(party: ShapedParty, source: Party, projectedRole: AccountRole) {
  expect(party).toMatchObject({
    id: source.id, name: source.name, displayName: source.name, identityRevealed: true, role: projectedRole,
    businessCity: source.businessCity, businessState: source.businessState,
  });
}
function assertHistoryActors(actors: ShapedParty[]) {
  masked(actors.find((actor) => actor.id === BUYER)!, "buyer");
  masked(actors.find((actor) => actor.id === SELLER)!, "seller");
  expect(actors.find((actor) => actor.id === SUPPORT)).toMatchObject({ displayName: "PlankMarket Support", name: null, identityRevealed: false, role: "admin" });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("offer participant labels are scoped to the offer", () => {
  it("shapes detail parties and history actors from persisted IDs before delivery", async () => {
    const f = fixture();
    const result = await f.caller.offer.getOfferById({ offerId: OFFER });
    masked(result.buyer, "buyer");
    masked(result.seller, "seller");
    assertHistoryActors(result.events.map((event) => event.actor));
    expect(f.buyer.role).toBe("seller");
    expect(f.context.user?.role).toBe("seller");
    expect(f.mutation).not.toHaveBeenCalled();
    expect(f.assurance).not.toHaveBeenCalled();
  });

  it("shapes the separate history route by actor IDs", async () => {
    const f = fixture();
    assertHistoryActors((await f.caller.offer.getOfferHistory({ offerId: OFFER })).map((event) => event.actor));
  });

  it.each(["getMyOffers", "getByListing"] as const)("%s keeps buyer/seller labels in list views", async (route) => {
    const f = fixture();
    const items = route === "getMyOffers"
      ? (await f.caller.offer.getMyOffers({ role: "buyer", page: 1, limit: 20 })).offers
      : await f.caller.offer.getByListing({ listingId: LISTING });
    masked(items[0].buyer, "buyer");
    masked(items[0].seller, "seller");
  });

  it("does not manufacture verification when a pending seller account is the buyer", async () => {
    const f = fixture({ buyerVerified: false, noOrder: true });
    masked((await f.caller.offer.getOfferById({ offerId: OFFER })).buyer, "buyer", false);
    expect(f.queryOrders).not.toHaveBeenCalled();
  });

  it("preserves an unmatched history actor account-role fallback", async () => {
    const f = fixture({ includeUnexpectedActor: true });
    const result = await f.caller.offer.getOfferHistory({ offerId: OFFER });
    const actor = result.find((event) => event.actor.id === FOREIGN)!.actor;
    masked(actor, "seller");
  });

  it("preserves the delivered-order identity milestone for actual participants", async () => {
    const f = fixture({ delivered: true });
    const result = await f.caller.offer.getOfferById({ offerId: OFFER });
    revealed(result.buyer, f.buyer, "buyer");
    revealed(result.seller, f.seller, "seller");
    const { sql, params } = dialect.sqlToQuery(f.queryOrders.mock.calls[0][0].where as SQL);
    expect(sql).toBe('("orders"."id" = $1 and "orders"."status" = $2)');
    expect(params).toEqual([ORDER, "delivered"]);
    const history = await f.caller.offer.getOfferHistory({ offerId: OFFER });
    revealed(history.find((event) => event.actor.id === BUYER)!.actor, f.buyer, "buyer");
    for (const item of (await f.caller.offer.getMyOffers({ role: "buyer" })).offers) revealed(item.buyer, f.buyer, "buyer");
  });

  it.each(["buyer", "seller", "admin"] as const)("rejects a nonparticipant %s before reading history or release state", async (accountRole) => {
    const f = fixture({ accountRole, viewerId: FOREIGN });
    await expect(f.caller.offer.getOfferById({ offerId: OFFER })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(f.caller.offer.getOfferHistory({ offerId: OFFER })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.queryEvents).not.toHaveBeenCalled();
    expect(f.queryOrders).not.toHaveBeenCalled();
    expect(f.assurance).not.toHaveBeenCalled();
  });
});

describe("message participant labels are scoped to the conversation", () => {
  it.each([false, true])("getOrCreateConversation shapes buying/selling identities when newly created = %s", async (createConversation) => {
    const f = fixture({ createConversation });
    const result = await f.caller.message.getOrCreateConversation({ listingId: LISTING });
    masked(result.buyer, "buyer");
    masked(result.seller, "seller");
    expect(f.buyer.role).toBe("seller");
    if (createConversation) {
      expect(f.insert).toHaveBeenCalledOnce();
      expect(f.createValues).toHaveBeenCalledWith({ listingId: LISTING, buyerId: BUYER, sellerId: SELLER });
      expect(f.queryOrders).not.toHaveBeenCalled();
    } else {
      expect(f.insert).not.toHaveBeenCalled();
    }
  });

  it.each(["getConversation", "getMyConversations"] as const)("%s labels the purchasing seller as buyer", async (route) => {
    const f = fixture();
    const result = route === "getConversation"
      ? await f.caller.message.getConversation({ conversationId: CONVERSATION })
      : (await f.caller.message.getMyConversations({})).conversations[0];
    expect(result).not.toBeNull();
    masked(result!.buyer, "buyer");
    masked(result!.seller, "seller");
    expect(f.buyer.role).toBe("seller");
    expect(f.mutation).not.toHaveBeenCalled();
    if (route === "getConversation") {
      expect(dialect.sqlToQuery(f.queryConversations.mock.calls[0][0].where as SQL)).toMatchObject({
        sql: '("conversations"."id" = $1 and ("conversations"."buyer_id" = $2 or "conversations"."seller_id" = $3))',
        params: [CONVERSATION, BUYER, BUYER],
      });
    }
  });

  it("shapes message senders by participant ID without changing message bodies or read state", async () => {
    const f = fixture();
    const result = await f.caller.message.getMessages({ conversationId: CONVERSATION });
    assertHistoryActors(result.map((message) => message.sender));
    expect(result.every((message) => message.body === "Synthetic message")).toBe(true);
    expect(f.mutation).not.toHaveBeenCalled();
    expect(f.assurance).not.toHaveBeenCalled();
  });

  it("keeps verification truthful in message sender labels", async () => {
    const f = fixture({ buyerVerified: false });
    const result = await f.caller.message.getMessages({ conversationId: CONVERSATION });
    masked(result.find((message) => message.sender.id === BUYER)!.sender, "buyer", false);
  });

  it("preserves an unmatched sender account-role fallback", async () => {
    const f = fixture({ includeUnexpectedActor: true });
    const result = await f.caller.message.getMessages({ conversationId: CONVERSATION });
    const sender = result.find((message) => message.sender.id === FOREIGN)!.sender;
    masked(sender, "seller");
  });

  it("preserves delivery release scoped to the exact listing and two participants", async () => {
    const f = fixture({ delivered: true });
    const result = await f.caller.message.getMessages({ conversationId: CONVERSATION });
    revealed(result.find((message) => message.sender.id === BUYER)!.sender, f.buyer, "buyer");
    const query = dialect.sqlToQuery(f.queryOrders.mock.calls[0][0].where as SQL);
    expect(query).toMatchObject({
      sql: '("orders"."listing_id" = $1 and "orders"."buyer_id" = $2 and "orders"."seller_id" = $3 and "orders"."status" = $4)',
      params: [LISTING, BUYER, SELLER, "delivered"],
    });
    const conversation = await f.caller.message.getConversation({ conversationId: CONVERSATION });
    revealed(conversation!.buyer, f.buyer, "buyer");
    const list = await f.caller.message.getMyConversations({});
    revealed(list.conversations[0].buyer, f.buyer, "buyer");
    for (const where of f.selectedOrders) {
      expect(dialect.sqlToQuery(where)).toMatchObject({
        sql: '("orders"."status" = $1 and ("orders"."listing_id" = $2 and "orders"."buyer_id" = $3 and "orders"."seller_id" = $4))',
        params: ["delivered", LISTING, BUYER, SELLER],
      });
    }
  });

  it.each(["buyer", "seller", "admin"] as const)("rejects a nonparticipant %s before sender history and identity lookup", async (accountRole) => {
    const f = fixture({ accountRole, viewerId: FOREIGN });
    await expect(f.caller.message.getMessages({ conversationId: CONVERSATION })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(f.queryMessages).not.toHaveBeenCalled();
    expect(f.queryOrders).not.toHaveBeenCalled();
    expect(f.assurance).not.toHaveBeenCalled();
  });
});


describe("transaction roles preserve their persisted direction and compatibility", () => {
  it.each([false, true])("keeps every projection contextual when the seller-account pair is reversed = %s", async (reverseParticipants) => {
    const f = fixture({ reverseParticipants });
    const detail = await f.caller.offer.getOfferById({ offerId: OFFER });
    const history = await f.caller.offer.getOfferHistory({ offerId: OFFER });
    const ownOffers = await f.caller.offer.getMyOffers({});
    const listingOffers = await f.caller.offer.getByListing({ listingId: LISTING });
    const existing = await f.caller.message.getOrCreateConversation({ listingId: LISTING });
    const conversation = await f.caller.message.getConversation({ conversationId: CONVERSATION });
    const conversations = await f.caller.message.getMyConversations({});
    const messages = await f.caller.message.getMessages({ conversationId: CONVERSATION });
    for (const value of [detail, ownOffers.offers[0], listingOffers[0], existing, conversation!, conversations.conversations[0]]) {
      expect(value.buyer.id).toBe(f.buyerId); masked(value.buyer, "buyer");
      expect(value.seller.id).toBe(f.sellerId); masked(value.seller, "seller");
    }
    for (const actors of [detail.events.map(event => event.actor), history.map(event => event.actor), messages.map(message => message.sender)]) {
      masked(actors.find(actor => actor.id === f.buyerId)!, "buyer");
      masked(actors.find(actor => actor.id === f.sellerId)!, "seller");
    }
    expect(f.buyer.role).toBe("seller"); expect(f.seller.role).toBe("seller");
    expect(f.context.user?.role).toBe("seller");
    expect(messages.map(message => message.id)).toEqual(f.messages.map(message => message.id));
    expect(f.mutation).not.toHaveBeenCalled(); expect(f.insert).not.toHaveBeenCalled();
  });

  it("projects one seller account as buyer and seller in separate rows of the same list", async () => {
    const f = fixture();
    const reverseListing = { ...f.offer.listing, id: "99999999-9999-4999-8999-999999999999", sellerId: BUYER };
    const reverseOffer = { ...f.offer, id: FOREIGN, listingId: reverseListing.id, listing: reverseListing,
      orderId: null, buyerId: SELLER, sellerId: BUYER, buyer: f.seller, seller: f.buyer };
    const reverseConversation = { ...f.conversation, id: FOREIGN, listingId: reverseListing.id, listing: reverseListing,
      buyerId: SELLER, sellerId: BUYER, buyer: f.seller, seller: f.buyer };
    f.queryOfferList.mockResolvedValue([f.offer, reverseOffer]);
    f.queryConversationList.mockResolvedValue([f.conversation, reverseConversation]);
    const offers = (await f.caller.offer.getMyOffers({})).offers;
    const conversations = (await f.caller.message.getMyConversations({})).conversations;
    for (const rows of [offers, conversations]) {
      expect(rows[0].buyer.id).toBe(BUYER); masked(rows[0].buyer, "buyer");
      expect(rows[1].seller.id).toBe(BUYER); masked(rows[1].seller, "seller");
      masked(rows[0].seller, "seller"); masked(rows[1].buyer, "buyer");
    }
    expect(f.buyer.role).toBe("seller"); expect(f.seller.role).toBe("seller");
  });

  it.each(["unverified", "pending", "rejected"] as const)("preserves %s status for both participants in every history type", async (status) => {
    const f = fixture({ buyerStatus: status, sellerStatus: status });
    const offer = await f.caller.offer.getOfferById({ offerId: OFFER });
    const history = await f.caller.offer.getOfferHistory({ offerId: OFFER });
    const conversation = await f.caller.message.getConversation({ conversationId: CONVERSATION });
    const messages = await f.caller.message.getMessages({ conversationId: CONVERSATION });
    for (const row of [offer, conversation!]) { masked(row.buyer, "buyer", false); masked(row.seller, "seller", false); }
    for (const actors of [offer.events.map(event => event.actor), history.map(event => event.actor), messages.map(message => message.sender)]) {
      masked(actors.find(actor => actor.id === BUYER)!, "buyer", false);
      masked(actors.find(actor => actor.id === SELLER)!, "seller", false);
    }
  });

  it("preserves delivered support and unmatched actor behavior without assigning transaction roles", async () => {
    const f = fixture({ delivered: true, includeUnexpectedActor: true });
    const offer = await f.caller.offer.getOfferById({ offerId: OFFER });
    const history = await f.caller.offer.getOfferHistory({ offerId: OFFER });
    const messages = await f.caller.message.getMessages({ conversationId: CONVERSATION });
    for (const actors of [offer.events.map(event => event.actor), history.map(event => event.actor), messages.map(message => message.sender)]) {
      revealed(actors.find(actor => actor.id === SUPPORT)!, f.support, "admin");
      revealed(actors.find(actor => actor.id === FOREIGN)!, f.unexpected, "seller");
      revealed(actors.find(actor => actor.id === BUYER)!, f.buyer, "buyer");
      revealed(actors.find(actor => actor.id === SELLER)!, f.seller, "seller");
    }
  });
});
