import { describe, expect, it } from "vitest";
import { parseListingSearchParams } from "../listing-search-params";

describe("parseListingSearchParams", () => {
  it("parses supported public filters", () => {
    expect(
      parseListingSearchParams({
        page: "3",
        limit: "48",
        sort: "price_asc",
        query: "  oak  ",
        materialType: "hardwood",
        condition: "closeout",
      }),
    ).toEqual({
      page: 3,
      limit: 48,
      sort: "price_asc",
      query: "oak",
      materialType: "hardwood",
      condition: "closeout",
    });
  });

  it("normalizes malformed and repeated parameters instead of forwarding them", () => {
    expect(
      parseListingSearchParams({
        page: "NaN",
        limit: "9999",
        sort: "drop_table",
        query: ["oak", "maple"],
        materialType: "not-a-material",
        condition: ["closeout", "returns"],
      }),
    ).toEqual({
      page: 1,
      limit: 24,
      sort: "date_newest",
      query: undefined,
      materialType: undefined,
      condition: undefined,
    });
  });

  it("caps public pagination before it can create an unbounded database offset", () => {
    expect(parseListingSearchParams({ page: "1000" }).page).toBe(1000);
    expect(parseListingSearchParams({ page: "1001" }).page).toBe(1);
  });

  it("drops overlong public search text", () => {
    expect(parseListingSearchParams({ query: "x".repeat(200) }).query).toHaveLength(
      200,
    );
    expect(parseListingSearchParams({ query: "x".repeat(201) }).query).toBe(
      undefined,
    );
  });
});
