import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { FacetedFilters } from "../faceted-filters";
import type { FilterUpdates } from "../faceted-filters";
import type { SearchFilters } from "@/types";

describe("numeric marketplace filters", () => {
  it("names each price and lot-size bound and updates its matching filter", () => {
    const onFiltersChange = vi.fn();
    function FilterHarness() {
      const [filters, setFilters] = useState<SearchFilters>({});
      const update = (updates: FilterUpdates) => {
        onFiltersChange(updates);
        setFilters(current => ({ ...current, ...(typeof updates === "function" ? updates(current) : updates) }));
      };
      return <FacetedFilters filters={filters} onFiltersChange={update} onClearFilters={vi.fn()} />;
    }
    render(<FilterHarness />);
    const controls = [
      ["Minimum price per square foot", "priceMin", "1.25", 1.25],
      ["Maximum price per square foot", "priceMax", "4.75", 4.75],
      ["Minimum lot size in square feet", "minLotSize", "1000", 1000],
      ["Maximum lot size in square feet", "maxLotSize", "5000", 5000],
    ] as const;
    for (const [name, key, entered, expected] of controls) {
      const input = screen.getByRole("spinbutton", { name });
      fireEvent.change(input, { target: { value: entered } });
      expect(onFiltersChange).toHaveBeenLastCalledWith({ [key]: expected });
      expect(input).toHaveValue(expected);
      fireEvent.change(input, { target: { value: "" } });
      expect(onFiltersChange).toHaveBeenLastCalledWith({ [key]: undefined });
    }
  });
});
