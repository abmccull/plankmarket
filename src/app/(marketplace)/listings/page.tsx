"use client";

import { useState, useCallback, useRef } from "react";
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
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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

export default function ListingsPage() {
  const {
    filters,
    isFilterPanelOpen,
    viewMode,
    setQuery,
    setSort,
    setPage,
    setLimit,
    toggleFilterPanel,
    setViewMode,
    clearFilters,
  } = useSearchStore();

  // Debounced search input — local state updates immediately, store updates after 300ms
  const [searchInput, setSearchInput] = useState(filters.query ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const debounceRef = useCallback(
    (value: string) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setQuery(value), 300);
    },
    [setQuery]
  );

  const { data, isLoading } = trpc.listing.list.useQuery({
    query: filters.query,
    materialType: filters.materialType,
    condition: filters.condition,
    priceMin: filters.priceMin,
    priceMax: filters.priceMax,
    width: filters.width,
    thickness: filters.thickness,
    wearLayer: filters.wearLayer,
    maxDistance: filters.maxDistance,
    buyerZip: filters.buyerZip,
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
        {/* Desktop Filter Toggle */}
        <Button
          variant="outline"
          size="icon"
          onClick={toggleFilterPanel}
          className={cn("hidden md:flex", isFilterPanelOpen && "bg-accent")}
          aria-label="Toggle filters"
          aria-expanded={isFilterPanelOpen}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
        {/* Mobile Filter Sheet */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="md:hidden"
              aria-label="Open filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left">
            <SheetTitle>Filters</SheetTitle>
            <div className="mt-4 overflow-y-auto">
              <FacetedFilters />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
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
        <div className="flex items-center gap-3 flex-wrap">
          <Select
            value={String(filters.limit ?? 24)}
            onValueChange={(v) => setLimit(parseInt(v))}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12">Show 12</SelectItem>
              <SelectItem value="24">Show 24</SelectItem>
              <SelectItem value="48">Show 48</SelectItem>
            </SelectContent>
          </Select>
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
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
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
              aria-label="List view"
              aria-pressed={viewMode === "list"}
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
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : data?.items.length === 0 ? (
            <div className="text-center py-20">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/50 mb-4">
                <Search className="h-10 w-10 text-muted-foreground/30" />
              </div>
              <h3 className="text-lg font-display font-semibold">
                {(filters.materialType && filters.materialType.length > 0) ||
                (filters.condition && filters.condition.length > 0) ||
                filters.priceMin !== undefined ||
                filters.priceMax !== undefined ||
                filters.minLotSize !== undefined ||
                filters.query
                  ? "No listings match your filters"
                  : "No listings yet"}
              </h3>
              <p className="text-muted-foreground mt-1">
                {(filters.materialType && filters.materialType.length > 0) ||
                (filters.condition && filters.condition.length > 0) ||
                filters.priceMin !== undefined ||
                filters.priceMax !== undefined ||
                filters.minLotSize !== undefined ||
                filters.query
                  ? "Try adjusting your filters or search terms"
                  : "Check back soon for new listings"}
              </p>
              {((filters.materialType && filters.materialType.length > 0) ||
                (filters.condition && filters.condition.length > 0) ||
                filters.priceMin !== undefined ||
                filters.priceMax !== undefined ||
                filters.minLotSize !== undefined ||
                filters.query) && (
                <Button
                  className="mt-4"
                  variant="secondary"
                  onClick={clearFilters}
                >
                  Clear all filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "grid gap-4 stagger-grid",
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
