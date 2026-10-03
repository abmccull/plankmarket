import { describe, expect, it } from "vitest";
import { toConversationParty, type ConversationPartySource } from "@/server/security/public-data";

const participants = { buyerId: "buying-id", sellerId: "selling-id" };
const source = Object.freeze({ id: participants.buyerId, role: "seller", name: "Private company",
  businessCity: "Denver", businessState: "CO", verificationStatus: "verified" } satisfies ConversationPartySource);

describe("transaction party projection compatibility", () => {
  it.each([false, true])("leaves the legacy two-argument projection unchanged at reveal=%s", reveal => {
    const result = toConversationParty(source, reveal);
    expect(result.role).toBe("seller"); expect(result.verified).toBe(true);
    expect(result.identityRevealed).toBe(reveal);
    expect(result.name).toBe(reveal ? source.name : null);
    if (reveal) expect(result.displayName).toBe(source.name);
    else expect(result.displayName).toMatch(/^Verified (Seller|Supplier)$/);
  });

  it("matches persisted IDs rather than a response slot or global account role", () => {
    const result = toConversationParty(source, false, participants);
    expect(result).toMatchObject({ id: source.id, role: "buyer", verified: true, identityRevealed: false, name: null });
    expect(result.displayName).toMatch(/^Verified (Buyer|Professional)$/);
    expect(result).not.toHaveProperty("businessCity"); expect(result).not.toHaveProperty("businessState");
    expect(source.role).toBe("seller");
    const reversed = toConversationParty(source, false, { buyerId: participants.sellerId, sellerId: participants.buyerId });
    expect(reversed.role).toBe("seller"); expect(reversed.displayName).toMatch(/^Verified (Seller|Supplier)$/);
  });

  it("uses the contextual role for a revealed participant whose name is empty", () => {
    const result = toConversationParty({ ...source, name: "" }, true, participants);
    expect(result).toMatchObject({ role: "buyer", name: "", identityRevealed: true, businessCity: source.businessCity, businessState: source.businessState });
    expect(result.displayName).toMatch(/^Verified (Buyer|Professional)$/);
  });

  it.each(["buyer", "seller", "admin"] as const)("preserves the entire legacy projection for unmatched %s actors", role => {
    const outsider = { ...source, id: "unmatched-id", role };
    for (const reveal of [false, true]) expect(toConversationParty(outsider, reveal, participants)).toEqual(toConversationParty(outsider, reveal));
  });

  it("projects a matched admin source as its transaction side without mutating the account", () => {
    const admin = Object.freeze({ ...source, role: "admin" as const });
    const result = toConversationParty(admin, false, participants);
    expect(result.role).toBe("buyer"); expect(result.displayName).toMatch(/^Verified (Buyer|Professional)$/);
    expect(admin.role).toBe("admin");
  });
});
