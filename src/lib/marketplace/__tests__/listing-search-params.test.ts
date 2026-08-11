import { describe, expect, it } from "vitest";
import { parseListingSearchParams } from "../listing-search-params";

describe("parseListingSearchParams", () => {
  it("parses the full supported public filter contract", () => {
    expect(
      parseListingSearchParams({
        page: "3",
        limit: "48",
        sort: "price_asc",
        query: "  oak  ",
        materialType: "hardwood,engineered",
        species: "oak,hickory",
        colorFamily: "light,dark",
        finishType: "matte,wire_brushed",
        width: "3.25,5",
        thickness: "0.5,0.75",
        wearLayer: "12,20",
        priceMin: "1.25",
        priceMax: "3.5",
        condition: "closeout,returns",
        state: "UT,CO",
        certifications: "floorscore,fsc",
        minLotSize: "750",
        maxLotSize: "1500",
        maxDistance: "250",
        buyerZip: "84770",
        sellerVerified: "true",
        freightReady: "true",
        fullLotOnly: "false",
      }),
    ).toEqual({
      page: 3,
      limit: 48,
      sort: "price_asc",
      query: "oak",
      materialType: ["hardwood", "engineered"],
      species: ["oak", "hickory"],
      colorFamily: ["light", "dark"],
      finishType: ["matte", "wire_brushed"],
      width: [3.25, 5],
      thickness: [0.5, 0.75],
      wearLayer: [12, 20],
      priceMin: 1.25,
      priceMax: 3.5,
      condition: ["closeout", "returns"],
      state: ["UT", "CO"],
      certifications: ["floorscore", "fsc"],
      minLotSize: 750,
      maxLotSize: 1500,
      maxDistance: 250,
      buyerZip: "84770",
      sellerVerified: true,
      freightReady: true,
      fullLotOnly: false,
    });
  });

  it("normalizes malformed and repeated parameters instead of forwarding them", () => {
    expect(
      parseListingSearchParams({
        page: "NaN",
        limit: "9999",
        sort: "drop_table",
        query: ["oak", "maple"],
        materialType: ["hardwood", "engineered"],
        species: ["oak", "maple"],
        colorFamily: ["light", "dark"],
        finishType: ["matte", "wire_brushed"],
        width: ["3.25", "5"],
        thickness: "bogus",
        wearLayer: "12,not-a-number",
        priceMin: "abc",
        priceMax: "4.5.6",
        condition: ["closeout", "returns"],
        state: ["UT", "CO"],
        certifications: ["floorscore", "fsc"],
        minLotSize: "none",
        maxLotSize: "tons",
        maxDistance: "far",
        buyerZip: "84770-1234",
        sellerVerified: "yes",
        freightReady: "1",
        fullLotOnly: ["true", "false"],
      }),
    ).toEqual({
      page: 1,
      limit: 24,
      sort: "date_newest",
      query: undefined,
      materialType: undefined,
      species: undefined,
      colorFamily: undefined,
      finishType: undefined,
      width: undefined,
      thickness: undefined,
      wearLayer: [12],
      priceMin: undefined,
      priceMax: undefined,
      condition: undefined,
      state: undefined,
      certifications: undefined,
      minLotSize: undefined,
      maxLotSize: undefined,
      maxDistance: undefined,
      buyerZip: undefined,
      sellerVerified: undefined,
      freightReady: undefined,
      fullLotOnly: undefined,
    });
  });

  it("keeps valid CSV members while dropping invalid ones", () => {
    expect(
      parseListingSearchParams({
        materialType: "hardwood,not-a-material,engineered",
        finishType: "matte,not-real,distressed",
        width: "3.25,nope,5",
        condition: "closeout,wrong,returns",
      }),
    ).toEqual({
      page: 1,
      limit: 24,
      sort: "date_newest",
      materialType: ["hardwood", "engineered"],
      finishType: ["matte", "distressed"],
      width: [3.25, 5],
      condition: ["closeout", "returns"],
    });
  });

  it("normalizes negative confidence filters to unset", () => {
    expect(
      parseListingSearchParams({
        sellerVerified: "false",
        freightReady: "false",
        fullLotOnly: "false",
      }),
    ).toMatchObject({
      sellerVerified: undefined,
      freightReady: undefined,
      fullLotOnly: false,
    });
  });

  it("caps public pagination before it can create an unbounded database offset", () => {
    expect(parseListingSearchParams({ page: "208" }).page).toBe(208);
    expect(parseListingSearchParams({ page: "209" }).page).toBe(1);
  });

  it("drops overlong public search text", () => {
    expect(parseListingSearchParams({ query: "x".repeat(200) }).query).toHaveLength(
      200,
    );
    expect(parseListingSearchParams({ query: "x".repeat(201) }).query).toBe(
      undefined,
    );
  });

  it("drops search terms too short for indexed trigram lookup", () => {
    expect(parseListingSearchParams({ query: "a" }).query).toBeUndefined();
    expect(parseListingSearchParams({ query: "ab" }).query).toBeUndefined();
    expect(parseListingSearchParams({ query: "oak" }).query).toBe("oak");
  });

  it("drops invalid exact-distance ZIP filters while keeping valid ones", () => {
    expect(
      parseListingSearchParams({
        buyerZip: "90210",
        maxDistance: "50",
      }),
    ).toEqual({
      page: 1,
      limit: 24,
      sort: "date_newest",
      buyerZip: "90210",
      maxDistance: 50,
    });

    expect(
      parseListingSearchParams({
        buyerZip: "90-210",
        maxDistance: "50",
      }),
    ).toEqual({
      page: 1,
      limit: 24,
      sort: "date_newest",
      buyerZip: undefined,
      maxDistance: 50,
    });
  });

  it("does not coerce whitespace-only numeric filters to zero", () => {
    expect(
      parseListingSearchParams({
        priceMin: "   ",
        minLotSize: "   ",
      }),
    ).toEqual({
      page: 1,
      limit: 24,
      sort: "date_newest",
      priceMin: undefined,
      minLotSize: undefined,
    });
  });

  it("caps public multi-select amplification and drops out-of-range numbers", () => {
    const parsed = parseListingSearchParams({
      species: Array.from({ length: 40 }, (_, index) => `species-${index}`).join(","),
      width: Array.from({ length: 40 }, (_, index) => String(index + 1)).join(","),
      certifications: "x".repeat(101),
      priceMin: "-1",
      maxLotSize: "1000000001",
      maxDistance: "5001",
    });

    expect(parsed.species).toHaveLength(25);
    expect(parsed.width).toHaveLength(25);
    expect(parsed.certifications).toBeUndefined();
    expect(parsed.priceMin).toBeUndefined();
    expect(parsed.maxLotSize).toBeUndefined();
    expect(parsed.maxDistance).toBeUndefined();
  });
});
