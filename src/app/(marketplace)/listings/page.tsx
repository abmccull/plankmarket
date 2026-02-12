"use client";

import { useState, useCallback } from "react";
import { useSearchStore } from "@/lib/stores/search-store";
import { trpc } from "@/lib/trpc/client";
import { ListingCard } from "@/components/search/listing-card";
import { FacetedFilters } from "@/components/search/faceted-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  SlidersHorizontal,
  Grid3X3,
  List,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SponsoredCarousel } from "@/components/promotions/sponsored-carousel";
import type { SortOption } from "@/types";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "date_newest", label: "Newest First" },
  { value: "date_oldest", label: "Oldest First" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "lot_value_desc", label: "Lot Value: High to Low" },
  { value: "lot_value_asc", label: "Lot Value: Low to High" },
  { value: "popularity", label: "Most Popular" },
];

/**
 * Render the listings page UI with search, filters, sponsored promotions, listing results, and pagination.
 *
 * Displays a search input with a 300ms debounced update to the search store, controls for sorting and view mode,
 * an optional filter sidebar, a sponsored carousel when featured promotions exist, and the main listings area
 * that presents loading, empty, and populated states plus pagination.
 *
 * @returns The listings page React element
 */
export default function ListingsPage() {
  const {
    filters,
    isFilterPanelOpen,
    viewMode,
    setQuery,
    setSort,
    setPage,
    toggleFilterPanel,
    setViewMode,
  } = useSearchStore();

  // Debounced search input — local state updates immediately, store updates after 300ms
  const [searchInput, setSearchInput] = useState(filters.query ?? "");
  const debounceRef = useCallback(
    (() => {
      let timeout: ReturnType<typeof setTimeout>;
      return (value: string) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setQuery(value), 300);
      };
    })(),
    [setQuery]
  );

  const { data: sponsoredListings } = trpc.promotion.getFeatured.useQuery({
    limit: 5,
  });

  const { data, isLoading } = trpc.listing.list.useQuery({
    query: filters.query,
    materialType: filters.materialType,
    condition: filters.condition,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    thicknessMin: filters.thicknessMin,
    thicknessMax: filters.thicknessMax,
    widthMin: filters.widthMin,
    widthMax: filters.widthMax,
    minLotSize: filters.minLotSize,
    maxLotSize: filters.maxLotSize,
    species: filters.species,
    colorFamily: filters.colorFamily,
    state: filters.state,
    sort: filters.sort,
    page: filters.page,
    limit: filters.limit,
  });

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Search Bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search flooring by material, species, brand..."
            className="pl-10"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              debounceRef(e.target.value);
            }}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={toggleFilterPanel}
          className={cn(isFilterPanelOpen && "bg-accent")}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="text-sm text-muted-foreground">
          {data ? (
            <>
              {data.total.toLocaleString()} listing
              {data.total !== 1 ? "s" : ""} found
            </>
          ) : (
            "Searching..."
          )}
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={filters.sort}
            onValueChange={(v) => setSort(v as SortOption)}
          >
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex border rounded-md">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-r-none",
                viewMode === "grid" && "bg-accent"
              )}
              onClick={() => setViewMode("grid")}
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-l-none",
                viewMode === "list" && "bg-accent"
              )}
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex gap-8">
        {/* Filter Sidebar */}
        {isFilterPanelOpen && (
          <aside className="w-64 shrink-0 hidden md:block">
            <FacetedFilters />
          </aside>
        )}

        {/* Listings Grid */}
        <div className="flex-1">
          {/* Sponsored Carousel */}
          {sponsoredListings && sponsoredListings.length > 0 && (
            <SponsoredCarousel listings={sponsoredListings} />
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : data?.items.length === 0 ? (
            <div className="text-center py-20">
              <Search className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No listings found</h3>
              <p className="text-muted-foreground mt-1">
                Try adjusting your filters or search terms
              </p>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "grid gap-4",
                  viewMode === "grid"
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-1"
                )}
              >
                {data?.items.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>

              {/* Pagination */}
              {data && data.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(Math.max(1, (filters.page ?? 1) - 1))}
                    disabled={(filters.page ?? 1) <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground px-4">
                    Page {filters.page ?? 1} of {data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPage(
                        Math.min(data.totalPages, (filters.page ?? 1) + 1)
                      )
                    }
                    disabled={(filters.page ?? 1) >= data.totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}