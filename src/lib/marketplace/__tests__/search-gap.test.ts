import { describe, expect, it } from "vitest";
import type { SearchFilters } from "@/types";
import {
  buildAuthPath,
  buildBuyerRequestPrefillParams,
  buildSearchGapAnalyticsContext,
  buildShareableSearchParams,
  parseBuyerRequestPrefill,
  parseSellerListingDemandContext,
  sanitizeSearchGapTerm,
} from "../search-gap";

describe("search-gap context", () => {
  it("round-trips validated marketplace filters into a buyer request", () => {
    const filters: SearchFilters = {
      query: "Shaw Floorte Pro 20 mil",
      materialType: ["vinyl_lvp", "engineered"],
      species: ["oak"],
      finishType: ["matte", "distressed"],
      certifications: ["floorscore", "fsc"],
      minLotSize: 750,
      maxLotSize: 1_500,
      priceMin: 1.25,
      priceMax: 3.5,
      buyerZip: "84770",
    };

    const parsed = parseBuyerRequestPrefill(
      buildBuyerRequestPrefillParams(filters),
    );

    expect(parsed).toMatchObject({
      source: "zero_results",
      materialTypes: ["vinyl_lvp", "engineered"],
      minTotalSqFt: "750",
      maxTotalSqFt: "1500",
      priceMinPerSqFt: "1.25",
      priceMaxPerSqFt: "3.5",
      destinationZip: "84770",
      species: "oak",
      finishTypes: ["matte", "distressed"],
      certifications: ["FloorScore", "FSC"],
      notes: "Original marketplace search: Shaw Floorte Pro 20 mil",
    });
  });

  it("drops invalid values and contact-like free text", () => {
    const unsafeFilters = {
      query: "Call 435-555-0123 or buyer@example.com",
      materialType: ["vinyl_lvp", "not_a_material"],
      priceMax: 500,
      minLotSize: -1,
      buyerZip: "84770-1234",
    } as unknown as SearchFilters;

    const params = buildBuyerRequestPrefillParams(unsafeFilters);
    params.set("notes", "Original marketplace search: seller@example.com");
    params.set("destinationZip", "not-a-zip");
    const parsed = parseBuyerRequestPrefill(params);

    expect(parsed.materialTypes).toEqual(["vinyl_lvp"]);
    expect(parsed.priceMaxPerSqFt).toBe("");
    expect(parsed.minTotalSqFt).toBe("");
    expect(parsed.destinationZip).toBe("");
    expect(parsed.notes).toBe("");
    expect(sanitizeSearchGapTerm(unsafeFilters.query)).toBe("");
  });

  it("builds shareable context without an exact ZIP or unsafe query", () => {
    const params = buildShareableSearchParams({
      query: "buyer@example.com",
      materialType: ["hardwood"],
      condition: ["closeout"],
      state: ["ut", "invalid"],
      buyerZip: "84770",
      maxDistance: 50,
      priceMax: 4,
    });

    expect(params.toString()).toBe(
      "materialType=hardwood&condition=closeout&priceMax=4&state=UT",
    );
    expect(params.has("buyerZip")).toBe(false);
    expect(params.has("query")).toBe(false);
  });

  it("parses carried seller context without treating it as guaranteed demand", () => {
    const params = buildShareableSearchParams({
      query: "white oak closeout",
      materialType: ["hardwood", "engineered"],
      condition: ["closeout"],
      species: ["oak"],
      finishType: ["matte"],
      priceMin: 2,
      priceMax: 4.5,
      minLotSize: 1_000,
      maxLotSize: 4_000,
      state: ["ut"],
    });
    params.set("source", "zero_results");

    expect(parseSellerListingDemandContext(params)).toEqual({
      source: "zero_results",
      query: "white oak closeout",
      materialTypes: ["hardwood", "engineered"],
      conditions: ["closeout"],
      species: ["oak"],
      finishTypes: ["matte"],
      priceMin: "2",
      priceMax: "4.5",
      minLotSize: "1000",
      maxLotSize: "4000",
      states: ["UT"],
    });
  });

  it("produces privacy-safe marketplace health properties", () => {
    const context = buildSearchGapAnalyticsContext({
      query: "private search text",
      materialType: ["laminate"],
      condition: ["remnants"],
      priceMax: 2.75,
      buyerZip: "90210",
    });

    expect(context).toEqual({
      query_present: true,
      material_types: ["laminate"],
      conditions: ["remnants"],
      active_filter_count: 5,
      has_price_filter: true,
      has_lot_size_filter: false,
      has_location_filter: true,
    });
    expect(context).not.toHaveProperty("query");
    expect(context).not.toHaveProperty("buyer_zip");
  });

  it("encodes the full destination through authentication", () => {
    const destination =
      "/buyer/requests/new?source=zero_results&materialTypes=hardwood%2Ctile&priceMaxPerSqFt=4";
    const authPath = buildAuthPath(destination, "buyer");
    const authUrl = new URL(authPath, "https://plankmarket.test");

    expect(authUrl.pathname).toBe("/login");
    expect(authUrl.searchParams.get("role")).toBe("buyer");
    expect(authUrl.searchParams.get("redirect")).toBe(destination);
  });
});
