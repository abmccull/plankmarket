import { describe, expect, it } from "vitest";
import {
  filtersToSearchParams,
  getFilterBadges,
  searchParamsToFilters,
} from "../utils/search-filters";

describe("marketplace confidence filter URLs", () => {
  it("round-trips positive confidence and lot-format filters", () => {
    const serialized = filtersToSearchParams({
      sellerVerified: true,
      freightReady: true,
      fullLotOnly: false,
    });

    expect(searchParamsToFilters(new URLSearchParams(serialized))).toMatchObject({
      sellerVerified: true,
      freightReady: true,
      fullLotOnly: false,
    });
    expect(
      getFilterBadges(searchParamsToFilters(new URLSearchParams(serialized))).map(
        ({ label }) => label,
      ),
    ).toEqual([
      "Verified sellers",
      "Freight quote ready",
      "Split lots allowed",
    ]);
  });

  it("drops negative confidence filters instead of hiding active constraints", () => {
    const parsed = searchParamsToFilters(
      new URLSearchParams(
        "sellerVerified=false&freightReady=false&fullLotOnly=false",
      ),
    );

    expect(parsed.sellerVerified).toBeUndefined();
    expect(parsed.freightReady).toBeUndefined();
    expect(parsed.fullLotOnly).toBe(false);
    expect(
      filtersToSearchParams({ sellerVerified: false, freightReady: false }),
    ).toBe("");
  });
});
