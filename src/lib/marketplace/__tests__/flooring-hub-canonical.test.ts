import { describe, expect, it } from "vitest";
import {
  buildFlooringHubCanonicalPath,
  parseFlooringHubPage,
} from "../flooring-hub-canonical";

describe("parseFlooringHubPage", () => {
  it("defaults missing and empty to page 1", () => {
    expect(parseFlooringHubPage(undefined)).toBe(1);
    expect(parseFlooringHubPage("")).toBe(1);
  });

  it("parses positive integers", () => {
    expect(parseFlooringHubPage("1")).toBe(1);
    expect(parseFlooringHubPage("2")).toBe(2);
    expect(parseFlooringHubPage("12")).toBe(12);
  });

  it("falls back to 1 for invalid or non-positive values", () => {
    expect(parseFlooringHubPage("0")).toBe(1);
    expect(parseFlooringHubPage("-3")).toBe(1);
    expect(parseFlooringHubPage("NaN")).toBe(1);
    expect(parseFlooringHubPage("abc")).toBe(1);
  });
});

describe("buildFlooringHubCanonicalPath", () => {
  it("emits the bare hub path for page 1 and below", () => {
    expect(
      buildFlooringHubCanonicalPath({
        materialType: "hardwood",
        page: 1,
        hasListingsOnPage: true,
      }),
    ).toBe("/flooring/hardwood");

    expect(
      buildFlooringHubCanonicalPath({
        materialType: "hardwood",
        page: 1,
        hasListingsOnPage: false,
      }),
    ).toBe("/flooring/hardwood");

    expect(
      buildFlooringHubCanonicalPath({
        materialType: "vinyl_lvp",
        page: 0,
        hasListingsOnPage: true,
      }),
    ).toBe("/flooring/vinyl_lvp");
  });

  it("self-canonicalizes page 2+ when the page has listings", () => {
    expect(
      buildFlooringHubCanonicalPath({
        materialType: "hardwood",
        page: 2,
        hasListingsOnPage: true,
      }),
    ).toBe("/flooring/hardwood?page=2");

    expect(
      buildFlooringHubCanonicalPath({
        materialType: "bamboo",
        page: 5,
        hasListingsOnPage: true,
      }),
    ).toBe("/flooring/bamboo?page=5");
  });

  it("canonicalizes empty page 2+ shells back to page 1", () => {
    expect(
      buildFlooringHubCanonicalPath({
        materialType: "tile",
        page: 2,
        hasListingsOnPage: false,
      }),
    ).toBe("/flooring/tile");

    expect(
      buildFlooringHubCanonicalPath({
        materialType: "engineered",
        page: 99,
        hasListingsOnPage: false,
      }),
    ).toBe("/flooring/engineered");
  });
});
