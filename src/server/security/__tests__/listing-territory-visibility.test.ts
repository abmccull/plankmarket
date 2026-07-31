import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  isListingTerritoryVisibleToViewer,
  publicActiveListingWhere,
  resolveTerritoryViewerScope,
  type ListingVisibilityViewer,
} from "@/server/security/listing-visibility";

const SELLER_ID = "11111111-1111-4111-8111-111111111111";
const BUYER_ID = "22222222-2222-4222-8222-222222222222";

function viewer(
  overrides: Partial<NonNullable<ListingVisibilityViewer>>,
): NonNullable<ListingVisibilityViewer> {
  return {
    id: BUYER_ID,
    role: "buyer",
    verificationStatus: "verified",
    businessState: "CO",
    ...overrides,
  };
}

const restrictedListing = {
  sellerId: SELLER_ID,
  territoryMode: "allowed_states" as const,
  allowedDestinationStates: ["CO", "WY"],
};

describe("listing territory visibility", () => {
  it("hides restricted inventory from anonymous viewers", () => {
    expect(isListingTerritoryVisibleToViewer(restrictedListing, null)).toBe(
      false,
    );
  });

  it.each([
    ["unverified state", "unverified", "CO"],
    ["pending verification", "pending", "CO"],
    ["invalid state", "verified", "NA"],
    ["missing state", "verified", null],
  ])(
    "hides restricted inventory when the buyer has %s",
    (_label, verificationStatus, businessState) => {
      expect(
        isListingTerritoryVisibleToViewer(
          restrictedListing,
          viewer({ verificationStatus, businessState }),
        ),
      ).toBe(false);
    },
  );

  it("shows restricted inventory to an allowed verified buyer", () => {
    expect(
      isListingTerritoryVisibleToViewer(
        restrictedListing,
        viewer({ businessState: "co" }),
      ),
    ).toBe(true);
  });

  it("hides restricted inventory from a blocked verified buyer", () => {
    expect(
      isListingTerritoryVisibleToViewer(
        restrictedListing,
        viewer({ businessState: "UT" }),
      ),
    ).toBe(false);
  });

  it("shows a seller their own restricted inventory but not another seller's", () => {
    expect(
      isListingTerritoryVisibleToViewer(
        restrictedListing,
        viewer({ id: SELLER_ID, role: "seller", businessState: null }),
      ),
    ).toBe(true);
    expect(
      isListingTerritoryVisibleToViewer(
        restrictedListing,
        viewer({ role: "seller", businessState: null }),
      ),
    ).toBe(false);
  });

  it("shows restricted inventory to admins", () => {
    expect(
      isListingTerritoryVisibleToViewer(
        restrictedListing,
        viewer({ role: "admin", businessState: null }),
      ),
    ).toBe(true);
  });

  it("preserves unrestricted listings for every viewer", () => {
    const unrestricted = {
      ...restrictedListing,
      territoryMode: "unrestricted" as const,
      allowedDestinationStates: [],
    };

    expect(isListingTerritoryVisibleToViewer(unrestricted, null)).toBe(true);
    expect(
      isListingTerritoryVisibleToViewer(
        unrestricted,
        viewer({
          verificationStatus: "unverified",
          businessState: null,
        }),
      ),
    ).toBe(true);
  });

  it("fails closed for empty or invalid restricted policies", () => {
    expect(
      isListingTerritoryVisibleToViewer(
        { ...restrictedListing, allowedDestinationStates: [] },
        viewer({ businessState: "CO" }),
      ),
    ).toBe(false);
    expect(
      isListingTerritoryVisibleToViewer(
        {
          ...restrictedListing,
          allowedDestinationStates: ["CO", "ZZ"],
        },
        viewer({ businessState: "CO" }),
      ),
    ).toBe(false);
  });

  it("uses verified profile state as the buyer SQL visibility scope", () => {
    expect(
      resolveTerritoryViewerScope(
        viewer({ verificationStatus: "verified", businessState: "co" }),
      ),
    ).toEqual({ kind: "buyer_state", destinationState: "CO" });
    expect(
      resolveTerritoryViewerScope(
        viewer({ verificationStatus: "unverified", businessState: "CO" }),
      ),
    ).toEqual({ kind: "unrestricted_only" });
  });

  it("puts territory filtering inside the public SQL predicate", () => {
    const dialect = new PgDialect();
    const buyerQuery = dialect.sqlToQuery(
      publicActiveListingWhere(
        new Date("2030-01-01T00:00:00.000Z"),
        viewer({ businessState: "CO" }),
      )!,
    );
    const anonymousQuery = dialect.sqlToQuery(
      publicActiveListingWhere(new Date("2030-01-01T00:00:00.000Z"), null)!,
    );

    expect(buyerQuery.sql).toContain("territory_mode");
    expect(buyerQuery.sql).toContain("jsonb_array_elements_text");
    expect(buyerQuery.params).toContain(JSON.stringify(["CO"]));
    expect(anonymousQuery.sql).toContain("territory_mode");
    expect(anonymousQuery.params).toContain("unrestricted");
    expect(anonymousQuery.sql).not.toContain("jsonb_array_elements_text");
  });
});
