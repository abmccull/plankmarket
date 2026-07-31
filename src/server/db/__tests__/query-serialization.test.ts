import { describe, expect, it } from "vitest";
import { and, gte, inArray, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { listings, orders } from "@/server/db/schema";
import * as schema from "@/server/db/schema";

const mockDb = drizzle.mock({ schema });

describe("Postgres query parameter serialization", () => {
  it("encodes temporal filters as ISO strings for the postgres-js driver", () => {
    const cutoff = new Date("2026-07-30T00:00:00.000Z");
    const query = mockDb
      .select({ id: orders.id })
      .from(orders)
      .where(lt(orders.createdAt, cutoff))
      .toSQL();

    expect(query.params).toEqual(["2026-07-30T00:00:00.000Z"]);
  });

  it("encodes saved-search list filters as scalar IN parameters", () => {
    const since = new Date("2026-07-29T00:00:00.000Z");
    const query = mockDb
      .select({ id: listings.id })
      .from(listings)
      .where(
        and(
          gte(listings.createdAt, since),
          inArray(listings.materialType, ["hardwood", "vinyl_lvp"]),
          inArray(listings.condition, ["new_overstock", "discontinued"]),
        ),
      )
      .toSQL();

    expect(query.sql).toContain('"listings"."material_type" in ($2, $3)');
    expect(query.sql).toContain('"listings"."condition" in ($4, $5)');
    expect(query.sql).not.toContain("ANY");
    expect(query.params).toEqual([
      "2026-07-29T00:00:00.000Z",
      "hardwood",
      "vinyl_lvp",
      "new_overstock",
      "discontinued",
    ]);
  });
});
