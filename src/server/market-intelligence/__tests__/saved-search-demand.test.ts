import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  savedSearchFiltersOverlapMaterials,
  savedSearchMaterialOverlapWhere,
} from "../saved-search-demand";

describe("saved-search demand material scoping", () => {
  it("counts broad searches and searches overlapping an active seller material", () => {
    expect(
      savedSearchFiltersOverlapMaterials({}, ["hardwood", "engineered"]),
    ).toBe(true);
    expect(
      savedSearchFiltersOverlapMaterials(
        { materialType: ["hardwood"] },
        ["hardwood", "engineered"],
      ),
    ).toBe(true);
  });

  it("excludes alerts for unrelated materials", () => {
    expect(
      savedSearchFiltersOverlapMaterials(
        { materialType: ["vinyl_lvp"] },
        ["hardwood", "engineered"],
      ),
    ).toBe(false);
  });

  it("builds a JSON overlap predicate instead of a platform-wide count", () => {
    const query = new PgDialect().sqlToQuery(
      savedSearchMaterialOverlapWhere(["hardwood", "engineered"]),
    );

    expect(query.sql).toContain("jsonb_array_elements_text");
    expect(query.sql).toContain("selected_material.value in");
    expect(query.params).toEqual(["hardwood", "engineered"]);
  });

  it("fails closed when the seller has no active material categories", () => {
    const query = new PgDialect().sqlToQuery(
      savedSearchMaterialOverlapWhere([]),
    );
    expect(query.sql.trim()).toBe("false");
  });
});
