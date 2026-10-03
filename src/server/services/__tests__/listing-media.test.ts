import { describe, expect, it, vi } from "vitest";
import {
  saveListingMedia,
  validateListingMediaSelection,
} from "../listing-media";
const seller = "seller",
  listing = "listing";
const candidate = (id: string) => ({
  id,
  uploaderId: seller,
  listingId: null,
  buyerRequestId: null,
  deletionClaimToken: null,
  mimeType: "image/jpeg",
  sortOrder: 0,
});
describe("listing photo ownership and Save", () => {
  it.each<{ rows: Parameters<typeof validateListingMediaSelection>[1] }>([
    { rows: [{ ...candidate("a"), uploaderId: "other" }] },
    { rows: [{ ...candidate("a"), listingId: "another-listing" }] },
    { rows: [{ ...candidate("a"), buyerRequestId: "request" }] },
    { rows: [{ ...candidate("a"), deletionClaimToken: "claim" }] },
    { rows: [] },
  ])(
    "rejects unavailable or foreign uploads before association changes",
    ({ rows }) => {
      expect(() =>
        validateListingMediaSelection(["a"], rows, seller, listing),
      ).toThrow();
    },
  );
  it("rejects duplicate IDs", () =>
    expect(() =>
      validateListingMediaSelection(
        ["a", "a"],
        [candidate("a")],
        seller,
        listing,
      ),
    ).toThrow());
  it("detaches removed media and persists the selected order inside the caller transaction", async () => {
    const writes: unknown[] = [];
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                for: async () => [
                  { ...candidate("old"), listingId: listing },
                  candidate("b"),
                  candidate("a"),
                ],
              }),
            }),
          }),
        })
        .mockReturnValueOnce({ from: () => ({ where: async () => [] }) }),
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => {
          writes.push(value);
          return {
            where: () => ({
              returning: async () => [{ id: "updated" }],
              then: (resolve: (value: unknown[]) => void) => resolve([]),
            }),
          };
        }),
      })),
    };
    await saveListingMedia(
      tx as unknown as Parameters<typeof saveListingMedia>[0],
      { id: listing, sellerId: seller, status: "active" },
      ["b", "a"],
    );
    expect(writes).toEqual([
      { listingId: null },
      { listingId: listing, sortOrder: 0 },
      { listingId: listing, sortOrder: 1 },
    ]);
  });
});
