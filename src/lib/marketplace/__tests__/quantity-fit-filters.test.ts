import { describe, expect, it } from "vitest";
import { listingFilterSchema } from "@/lib/validators/listing";
import { parseListingSearchParams } from "../listing-search-params";
import { buildShareableSearchParams } from "../search-gap";
import { filtersToSearchParams, getFilterBadges, searchParamsToFilters } from "@/lib/utils/search-filters";

// Contract checks written before implementation: links must not silently lose buyer intent.
describe("quantity conflict filter continuity", () => {
  it("retains the modifier through save/open/share serialization", () => {
    const parsed = parseListingSearchParams({ minLotSize: "501", buyerZip: "80202", materialType: "engineered", hideQuantityConflicts: "true" });
    expect(parsed).toMatchObject({ minLotSize: 501, hideQuantityConflicts: true });
    const restored = searchParamsToFilters(new URLSearchParams(filtersToSearchParams({
      minLotSize: parsed.minLotSize, buyerZip: parsed.buyerZip,
      materialType: parsed.materialType, hideQuantityConflicts: parsed.hideQuantityConflicts,
    })));
    expect(restored).toMatchObject({ minLotSize: 501, buyerZip: "80202", hideQuantityConflicts: true });
    expect(buildShareableSearchParams(restored).get("hideQuantityConflicts")).toBe("true");
    expect(getFilterBadges(restored)).toContainEqual({ key: "hideQuantityConflicts", label: "Quantity conflicts hidden" });
  });

  it.each([undefined, "0", "-1", "NaN", ["501", "502"]])("normalizes an inapplicable URL modifier with quantity %j", minLotSize => {
    const parsed = parseListingSearchParams({ minLotSize, hideQuantityConflicts: "true", query: "oak" });
    expect(parsed).not.toHaveProperty("hideQuantityConflicts", true);
    expect(parsed.query).toBe("oak");
  });

  it("normalizes repeated flags consistently in server and client parsers", () => {
    expect(parseListingSearchParams({ minLotSize: "501", hideQuantityConflicts: ["true", "true"] })).not.toHaveProperty("hideQuantityConflicts", true);
    expect(searchParamsToFilters(new URLSearchParams("minLotSize=501&hideQuantityConflicts=true&hideQuantityConflicts=true"))).not.toHaveProperty("hideQuantityConflicts", true);
  });

  it.each([{ hideQuantityConflicts: true }, { minLotSize: 0, hideQuantityConflicts: true }, { minLotSize: 501, hideQuantityConflicts: false }])("rejects an invalid direct filter %j", input => {
    expect(listingFilterSchema.safeParse(input).success).toBe(false);
  });

  it("keeps legacy stock bounds unchanged without the modifier", () => {
    expect(listingFilterSchema.parse({ minLotSize: 501, maxLotSize: 1200 })).toMatchObject({ minLotSize: 501, maxLotSize: 1200 });
    expect(filtersToSearchParams({ minLotSize: 501 })).toBe("minLotSize=501");
  });
});
