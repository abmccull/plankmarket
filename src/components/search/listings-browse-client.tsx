"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ListingCard } from "@/components/search/listing-card";
import { FacetedFilters } from "@/components/search/faceted-filters";
import { SponsoredCarousel } from "@/components/promotions/sponsored-carousel";
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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SortOption, PromotionTier } from "@/types";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "date_newest", label: "Newest First" },
  { value: "date_oldest", label: "Oldest First" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "lot_value_desc", label: "Lot Value: High to Low" },
  { value: "lot_value_asc", label: "Lot Value: Low to High" },
  { value: "popularity", label: "Most Popular" },
];

interface ListingItem {
  id: string;
  title: string;
  materialType: string;
  species: string | null;
  condition: string;
  totalSqFt: number;
  askPricePerSqFt: number;
  buyNowPrice: number | null;
  locationCity: string | null;
  locationState: string | null;
  viewsCount: number;
  watchlistCount: number;
  createdAt: Date | string;
  promotionTier?: PromotionTier | null;
  isPromoted?: boolean;
  media?: { url: string }[];
  seller?: {
    verified: boolean;
    role: string;
    businessState: string | null;
  } | null;
}

interface ListingsBrowseClientProps {
  initialData: {
    items: ListingItem[];
    total: number;
    totalPages: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
  sponsoredListings: ListingItem[];
  initialParams: {
    page: number;
    limit: number;
    sort: string;
    query?: string;
    materialType?: string;
    condition?: string;
  };
}

export function ListingsBrowseClient({
  initialData,
  sponsoredListings,
  initialParams,
}: ListingsBrowseClientProps) {
  const router = useRouter();
  const rawSearchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(initialParams.query ?? "");
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(rawSearchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined && value !== "") {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      // Reset to page 1 when filters change (unless we're explicitly setting page)
      if (!updates.page) {
        params.delete("page");
      }
      router.push(`/listings?${params.toString()}`);
    },
    [router, rawSearchParams]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        updateParams({ query: value || undefined });
      }, 300);
    },
    [updateParams]
  );

  // Build pagination URLs for crawlable links
  const buildPageUrl = (page: number) => {
    const params = new URLSearchParams(rawSearchParams.toString());
    if (page > 1) {
      params.set("page", String(page));
    } else {
      params.delete("page");
    }
    return `/listings?${params.toString()}`;
  };

  const currentPage = initialParams.page;
  const hasFilters = !!(
    initialParams.materialType ||
    initialParams.condition ||
    initialParams.query
  );

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
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
          className={cn("hidden md:flex", isFilterPanelOpen && "bg-accent")}
          aria-label="Toggle filters"
          aria-expanded={isFilterPanelOpen}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
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
          {initialData.total.toLocaleString()} listing
          {initialData.total !== 1 ? "s" : ""} found
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select
            value={String(initialParams.limit)}
            onValueChange={(v) => updateParams({ limit: v })}
          >
            <SelectTrigger className="w-full sm:w-[140px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12">Show 12</SelectItem>
              <SelectItem value="24">Show 24</SelectItem>
              <SelectItem value="48">Show 48</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={initialParams.sort}
            onValueChange={(v) => updateParams({ sort: v })}
          >
            <SelectTrigger className="w-full sm:w-[200px] h-8 text-xs">
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
        {isFilterPanelOpen && (
          <aside className="w-64 shrink-0 hidden md:block">
            <FacetedFilters />
          </aside>
        )}

        <div className="flex-1">
          {sponsoredListings && sponsoredListings.length > 0 && (
            <SponsoredCarousel listings={sponsoredListings} />
          )}

          {initialData.items.length === 0 ? (
            <div className="text-center py-20">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/50 mb-4">
                <Search className="h-10 w-10 text-muted-foreground/30" />
              </div>
              <h3 className="text-lg font-display font-semibold">
                {hasFilters
                  ? "No listings match your filters"
                  : "No listings yet"}
              </h3>
              <p className="text-muted-foreground mt-1">
                {hasFilters
                  ? "Try adjusting your filters or search terms"
                  : "Check back soon for new listings"}
              </p>
              {hasFilters && (
                <Button
                  className="mt-4"
                  variant="secondary"
                  onClick={() => router.push("/listings")}
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
                {initialData.items.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>

              {/* Crawlable Pagination with Link elements */}
              {initialData.totalPages > 1 && (
                <nav
                  aria-label="Pagination"
                  className="flex items-center justify-center gap-2 mt-8"
                >
                  {currentPage > 1 ? (
                    <Link href={buildPageUrl(currentPage - 1)}>
                      <Button variant="outline" size="sm">
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                  )}
                  <span className="text-sm text-muted-foreground px-4">
                    Page {currentPage} of {initialData.totalPages}
                  </span>
                  {currentPage < initialData.totalPages ? (
                    <Link href={buildPageUrl(currentPage + 1)}>
                      <Button variant="outline" size="sm">
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
