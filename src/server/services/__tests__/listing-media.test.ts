import { describe, expect, it, vi } from "vitest";
import { saveListingMedia, validateListingMediaSelection } from "../listing-media";
const seller = "seller", listing = "listing";
const candidate = (id: string) => ({ id, uploaderId: seller, listingId: null, buyerRequestId: null, deletionClaimToken: null });
describe("listing photo ownership and Save", () => {
  it.each<{ rows: Parameters<typeof validateListingMediaSelection>[1] }>([
    { rows: [{ ...candidate("a"), uploaderId: "other" }] },
    { rows: [{ ...candidate("a"), listingId: "another-listing" }] },
    { rows: [{ ...candidate("a"), buyerRequestId: "request" }] },
    { rows: [{ ...candidate("a"), deletionClaimToken: "claim" }] },
    { rows: [] },
  ])("rejects unavailable or foreign uploads before association changes", ({ rows }) => {
    expect(() => validateListingMediaSelection(["a"], rows, seller, listing)).toThrow();
  });
  it("rejects duplicate IDs", () => expect(() => validateListingMediaSelection(["a", "a"], [candidate("a")], seller, listing)).toThrow());
  it("detaches removed media and persists the selected order inside the caller transaction", async () => {
    const writes: unknown[] = [];
    const tx = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ for: vi.fn().mockResolvedValue([{ ...candidate("old"), listingId: listing }, candidate("b"), candidate("a")]) })) })) })),
      update: vi.fn(() => ({ set: vi.fn((value: unknown) => { writes.push(value); return { where: vi.fn().mockResolvedValue([]) }; }) })),
    };
    await saveListingMedia(tx as unknown as Parameters<typeof saveListingMedia>[0], seller, listing, ["b", "a"]);
    expect(writes).toEqual([{ listingId: null }, { listingId: listing, sortOrder: 0 }, { listingId: listing, sortOrder: 1 }]);
  });
});
