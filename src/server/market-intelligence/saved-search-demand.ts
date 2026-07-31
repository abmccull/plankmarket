import { sql } from "drizzle-orm";
import { savedSearches } from "@/server/db/schema/saved-searches";
import type { SearchFilters } from "@/types";

/**
 * A saved search with no material filter watches every material category.
 * Otherwise, at least one selected material must overlap the seller's current
 * active material set. Malformed historical JSON fails closed.
 */
export function savedSearchMaterialOverlapWhere(
  materialTypes: readonly string[],
) {
  if (materialTypes.length === 0) {
    return sql<boolean>`false`;
  }

  const materialParameters = sql.join(
    materialTypes.map((materialType) => sql`${materialType}`),
    sql`, `,
  );
  const selectedMaterials = sql`${savedSearches.filters}->'materialType'`;

  return sql<boolean>`(
    ${selectedMaterials} is null
    or (
      jsonb_typeof(${selectedMaterials}) = 'array'
      and (
        jsonb_array_length(${selectedMaterials}) = 0
        or exists (
          select 1
          from jsonb_array_elements_text(${selectedMaterials})
            as selected_material(value)
          where selected_material.value in (${materialParameters})
        )
      )
    )
  )`;
}

export function savedSearchFiltersOverlapMaterials(
  filters: Pick<SearchFilters, "materialType">,
  materialTypes: readonly string[],
): boolean {
  if (materialTypes.length === 0) return false;
  if (!filters.materialType?.length) return true;
  const sellerMaterials = new Set(materialTypes);
  return filters.materialType.some((materialType) =>
    sellerMaterials.has(materialType),
  );
}
