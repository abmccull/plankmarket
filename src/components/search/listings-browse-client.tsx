"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ListingCard } from "@/components/search/listing-card";
import { ListingTableView } from "@/components/search/listing-table-view";
import { FacetedFilters } from "@/components/search/faceted-filters";
import { SaveSearchDialog } from "@/components/saved-searches/save-search-dialog";
import { SponsoredCarousel } from "@/components/promotions/sponsored-carousel";
import { FeaturedCarousel } from "@/components/promotions/featured-carousel";
import { PremiumHeroBanner } from "@/components/promotions/hero-banner";
import { FEATURES } from "@/lib/feature-flags";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useProStatus } from "@/hooks/use-pro-status";
import { trpc } from "@/lib/trpc/client";
import { FREE_LIMITS } from "@/lib/pro";
import { getFilterBadges, searchParamsToFilters } from "@/lib/utils/search-filters";
import { useTrack } from "@/lib/analytics/use-track";
import {
  buildAuthPath,
  buildBuyerRequestPrefillParams,
  buildSearchGapAnalyticsContext,
  buildShareableSearchParams,
} from "@/lib/marketplace/search-gap";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
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
  SheetClose,
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
  BookmarkPlus,
  BellRing,
  ClipboardPlus,
  PackagePlus,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchFilters, SortOption, PromotionTier } from "@/types";
import { toast } from "sonner";
import type { ListingFreshnessStatus } from "@/lib/listing-freshness";
import type { FreightEstimateStatus } from "@/components/listings/listing-evidence";

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
  freightEstimateStatus?: FreightEstimateStatus;
  freshnessStatus?: ListingFreshnessStatus;
  lastConfirmedAt?: Date | string | null;
  viewsCount: number;
  watchlistCount: number;
  createdAt: Date | string;
  promotionTier?: PromotionTier | null;
  isPromoted?: boolean;
  media?: { url: string }[];
  seller?: {
    displayName: string;
    verified: boolean;
    role: string;
  } | null;
}

interface ListingsBrowseClientProps {
  initialData: {
    items: ListingItem[];
    total: number;
    totalIsExact: boolean;
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

function buildDefaultSavedSearchName(searchParams: URLSearchParams): string {
  const badges = getFilterBadges(searchParamsToFilters(searchParams))
    .map((badge) => badge.label.replace(/"/g, ""))
    .slice(0, 2);

  if (badges.length > 0) {
    return badges.join(" | ");
  }

  return "All Listings";
}

const FILTER_PARAM_KEYS: Array<keyof SearchFilters> = [
  "materialType",
  "species",
  "colorFamily",
  "finishType",
  "width",
  "thickness",
  "wearLayer",
  "priceMin",
  "priceMax",
  "condition",
  "state",
  "certifications",
  "minLotSize",
  "maxLotSize",
  "maxDistance",
  "buyerZip",
  "sellerVerified",
  "freightReady",
  "fullLotOnly",
];

function buildListingsUrl(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/listings?${query}` : "/listings";
}

function writeFilterParams(params: URLSearchParams, filters: SearchFilters) {
  for (const key of FILTER_PARAM_KEYS) {
    params.delete(key);
  }

  const setCsvParam = (key: keyof SearchFilters, value?: Array<string | number>) => {
    if (value && value.length > 0) {
      params.set(String(key), value.join(","));
    }
  };

  setCsvParam("materialType", filters.materialType);
  setCsvParam("condition", filters.condition);
  setCsvParam("species", filters.species);
  setCsvParam("colorFamily", filters.colorFamily);
  setCsvParam("finishType", filters.finishType);
  setCsvParam("state", filters.state);
  setCsvParam("certifications", filters.certifications);
  setCsvParam("width", filters.width);
  setCsvParam("thickness", filters.thickness);
  setCsvParam("wearLayer", filters.wearLayer);

  if (filters.priceMin !== undefined) {
    params.set("priceMin", String(filters.priceMin));
  }
  if (filters.priceMax !== undefined) {
    params.set("priceMax", String(filters.priceMax));
  }
  if (filters.minLotSize !== undefined) {
    params.set("minLotSize", String(filters.minLotSize));
  }
  if (filters.maxLotSize !== undefined) {
    params.set("maxLotSize", String(filters.maxLotSize));
  }
  if (filters.maxDistance !== undefined) {
    params.set("maxDistance", String(filters.maxDistance));
  }
  if (filters.buyerZip) {
    params.set("buyerZip", filters.buyerZip);
  }
  if (filters.sellerVerified === true) {
    params.set("sellerVerified", "true");
  }
  if (filters.freightReady === true) {
    params.set("freightReady", "true");
  }
  if (filters.fullLotOnly !== undefined) {
    params.set("fullLotOnly", String(filters.fullLotOnly));
  }
}

export function ListingsBrowseClient({
  initialData,
  sponsoredListings,
  initialParams,
}: ListingsBrowseClientProps) {
  const router = useRouter();
  const rawSearchParams = useSearchParams();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuthStore();
  const { isPro } = useProStatus();
  const track = useTrack();
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const zeroResultImpressionRef = useRef<string | null>(null);
  const saveIntentHandledRef = useRef(false);
  const {
    data: savedSearches,
    isLoading: areSavedSearchesLoading,
    refetch: refetchSavedSearches,
  } =
    trpc.search.getMySavedSearches.useQuery(undefined, {
      enabled: isAuthenticated,
      retry: false,
      staleTime: 60 * 1000,
    });
  const searchParamsString = rawSearchParams.toString();
  const currentSearchParams = useMemo(
    () => new URLSearchParams(searchParamsString),
    [searchParamsString],
  );
  const currentFilters = useMemo(
    () => searchParamsToFilters(currentSearchParams),
    [currentSearchParams],
  );
  const currentSort = currentSearchParams.get("sort") ?? initialParams.sort;
  const currentLimit = Number(currentSearchParams.get("limit") ?? initialData.limit);
  const viewMode: "grid" | "list" = currentLimit >= 50 ? "list" : "grid";
  const filterStateKey = currentFilters.buyerZip ?? user?.zipCode ?? "";
  const searchGapContext = useMemo(
    () => buildSearchGapAnalyticsContext(currentFilters),
    [currentFilters],
  );
  const buyerRequestPath = useMemo(
    () =>
      `/buyer/requests/new?${buildBuyerRequestPrefillParams(currentFilters).toString()}`,
    [currentFilters],
  );
  const shareableSearchParams = useMemo(
    () => buildShareableSearchParams(currentFilters),
    [currentFilters],
  );
  const sellerIntentPath = useMemo(() => {
    const params = new URLSearchParams(shareableSearchParams);
    params.set("source", "zero_results");
    return `/seller/listings/new?${params.toString()}`;
  }, [shareableSearchParams]);
  const defaultSavedSearchName = buildDefaultSavedSearchName(
    currentSearchParams,
  );

  const navigateWithParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(rawSearchParams.toString());
      mutate(params);
      router.push(buildListingsUrl(params));
    },
    [rawSearchParams, router],
  );

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      navigateWithParams((params) => {
        Object.entries(updates).forEach(([key, value]) => {
          if (value !== undefined && value !== "") {
            params.set(key, value);
          } else {
            params.delete(key);
          }
        });
        if (!updates.page) {
          params.delete("page");
        }
      });
    },
    [navigateWithParams],
  );

  const updateFilters = useCallback(
    (updates: Partial<SearchFilters>) => {
      navigateWithParams((params) => {
        writeFilterParams(params, {
          ...currentFilters,
          ...updates,
        });
        params.delete("page");
      });
    },
    [currentFilters, navigateWithParams],
  );

  const clearFilters = useCallback(() => {
    navigateWithParams((params) => {
      for (const key of FILTER_PARAM_KEYS) {
        params.delete(String(key));
      }
      params.delete("page");
    });
  }, [navigateWithParams]);

  const handleViewModeChange = useCallback(
    (mode: "grid" | "list") => {
      const GRID_LIMITS = ["12", "24", "48"];
      const LIST_LIMITS = ["50", "100", "250"];
      const nextLimit = String(currentLimit);
      if (mode === "list" && GRID_LIMITS.includes(nextLimit)) {
        updateParams({ limit: "50" });
      } else if (mode === "grid" && LIST_LIMITS.includes(nextLimit)) {
        updateParams({ limit: "24" });
      }
    },
    [currentLimit, updateParams],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        const normalized = value.trim();
        updateParams({
          query: normalized.length >= 3 ? normalized : undefined,
        });
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
    return buildListingsUrl(params);
  };

  const currentPage = initialData.page;
  const savedSearchCount = savedSearches?.length ?? 0;
  const atSearchLimit =
    isAuthenticated && !isPro && savedSearchCount >= FREE_LIMITS.savedSearches;
  const hasSaveSearchIntent =
    currentSearchParams.get("intent") === "save_search";
  const shouldResumeSaveSearch =
    hasSaveSearchIntent &&
    !isAuthLoading &&
    isAuthenticated &&
    !areSavedSearchesLoading &&
    !atSearchLimit;
  const hasFilters = searchGapContext.active_filter_count > 0;
  const isZeroResults = initialData.total === 0;
  const zeroResultKey = JSON.stringify(searchGapContext);
  const actorRole = user?.role ?? "anonymous";
  const sharePath = `/listings${shareableSearchParams.size > 0 ? `?${shareableSearchParams.toString()}` : ""}`;
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://plankmarket.com"
  ).replace(/\/$/, "");
  const referralHref = `mailto:?subject=${encodeURIComponent(
    "Flooring inventory opportunity on PlankMarket",
  )}&body=${encodeURIComponent(
    `Buyers are searching for inventory like yours. Review the current demand here: ${appUrl}${sharePath}`,
  )}`;

  useEffect(
    () => () => {
      clearTimeout(timeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!isZeroResults || zeroResultImpressionRef.current === zeroResultKey) {
      return;
    }

    zeroResultImpressionRef.current = zeroResultKey;
    track("marketplace_zero_results_viewed", {
      ...searchGapContext,
      results_count: 0,
    });
  }, [isZeroResults, searchGapContext, track, zeroResultKey]);

  useEffect(() => {
    if (
      !hasSaveSearchIntent ||
      isAuthLoading ||
      saveIntentHandledRef.current
    ) {
      return;
    }

    const currentPath = `/listings?${currentSearchParams.toString()}`;
    if (!isAuthenticated) {
      saveIntentHandledRef.current = true;
      router.replace(buildAuthPath(currentPath, "buyer"));
      return;
    }

    if (areSavedSearchesLoading) return;

    if (atSearchLimit) {
      saveIntentHandledRef.current = true;
      toast.error(
        `Free accounts are limited to ${FREE_LIMITS.savedSearches} saved searches. Upgrade to Pro for unlimited saved searches.`,
      );
      router.push("/pro");
      return;
    }

  }, [
    areSavedSearchesLoading,
    atSearchLimit,
    currentSearchParams,
    hasSaveSearchIntent,
    isAuthLoading,
    isAuthenticated,
    router,
  ]);

  const trackZeroResultAction = useCallback(
    (
      action:
        | "create_buyer_request"
        | "save_search_alert"
        | "list_inventory"
        | "refer_inventory",
    ) => {
      if (!isZeroResults) return;
      track("marketplace_zero_results_action_clicked", {
        ...searchGapContext,
        action,
        authenticated: isAuthenticated,
        actor_role: actorRole,
      });
    },
    [actorRole, isAuthenticated, isZeroResults, searchGapContext, track],
  );

  const handleSaveSearchClick = useCallback(() => {
    trackZeroResultAction("save_search_alert");

    if (!isAuthenticated) {
      toast.info("Sign in to save searches and get alerts for matching listings.");
      const params = new URLSearchParams(currentSearchParams);
      params.set("intent", "save_search");
      params.delete("page");
      router.push(
        buildAuthPath(`/listings?${params.toString()}`, "buyer"),
      );
      return;
    }

    if (atSearchLimit) {
      toast.error(
        `Free accounts are limited to ${FREE_LIMITS.savedSearches} saved searches. Upgrade to Pro for unlimited saved searches.`
      );
      router.push("/pro");
      return;
    }

    setIsSaveDialogOpen(true);
  }, [
    atSearchLimit,
    currentSearchParams,
    isAuthenticated,
    router,
    trackZeroResultAction,
  ]);

  const handleSaveDialogOpenChange = useCallback(
    (open: boolean) => {
      setIsSaveDialogOpen(open);
      if (open || !hasSaveSearchIntent) return;

      saveIntentHandledRef.current = true;
      const cleanedParams = new URLSearchParams(currentSearchParams);
      cleanedParams.delete("intent");
      const cleanedPath = `/listings${
        cleanedParams.size > 0 ? `?${cleanedParams.toString()}` : ""
      }`;
      router.replace(cleanedPath, { scroll: false });
    },
    [currentSearchParams, hasSaveSearchIntent, router],
  );

  const handleBuyerRequestClick = useCallback(() => {
    trackZeroResultAction("create_buyer_request");
    if (!isAuthenticated) {
      router.push(buildAuthPath(buyerRequestPath, "buyer"));
      return;
    }

    if (user?.role === "seller") {
      toast.info("Buyer requests require a buyer account. Contact us if your business needs both roles.");
      router.push("/contact?topic=buyer-account");
      return;
    }

    router.push(buyerRequestPath);
  }, [
    buyerRequestPath,
    isAuthenticated,
    router,
    trackZeroResultAction,
    user?.role,
  ]);

  const handleSellerIntentClick = useCallback(() => {
    trackZeroResultAction("list_inventory");
    if (!isAuthenticated) {
      router.push(buildAuthPath(sellerIntentPath, "seller", "register"));
      return;
    }

    if (user?.role === "buyer") {
      toast.info("Listings require a seller account. Contact us to add selling access.");
      router.push("/contact?topic=seller-account");
      return;
    }

    router.push(sellerIntentPath);
  }, [
    isAuthenticated,
    router,
    sellerIntentPath,
    trackZeroResultAction,
    user?.role,
  ]);

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-6 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-secondary">
          Current marketplace inventory
        </p>
        <h1 className="mt-2 font-display text-3xl tracking-tight sm:text-4xl">
          Browse surplus flooring listings
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
          Compare lot economics, seller verification, inventory freshness, and
          freight readiness before you contact a seller.
        </p>
      </header>
      {/* Search Bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            key={currentFilters.query ?? ""}
            placeholder="Search flooring by material, species, brand (3+ characters)..."
            className="pl-10"
            defaultValue={currentFilters.query ?? ""}
            onChange={(e) => handleSearchChange(e.target.value)}
            minLength={3}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            setIsMobileFilterOpen(false);
            setIsFilterPanelOpen((open) => !open);
          }}
          className={cn("hidden md:flex", isFilterPanelOpen && "bg-accent")}
          aria-label="Toggle filters"
          aria-expanded={isFilterPanelOpen}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
        <Sheet
          open={isMobileFilterOpen}
          onOpenChange={(open) => {
            setIsMobileFilterOpen(open);
            if (open) {
              setIsFilterPanelOpen(false);
            }
          }}
        >
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
          <SheetContent side="left" className="flex flex-col gap-0 p-0">
            <div className="shrink-0 border-b px-5 py-4 pr-12">
              <SheetTitle>Filters</SheetTitle>
              <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
                {initialData.total.toLocaleString()}
                {initialData.totalIsExact ? "" : "+"} listing
                {initialData.total !== 1 ? "s" : ""} match
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <FacetedFilters
                key={`mobile-${filterStateKey}`}
                filters={currentFilters}
                onFiltersChange={updateFilters}
                onClearFilters={clearFilters}
              />
            </div>
            <div className="grid shrink-0 grid-cols-[auto_1fr] gap-3 border-t bg-background px-5 py-4 shadow-[0_-8px_24px_rgba(49,32,21,0.08)]">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={clearFilters}
                disabled={!hasFilters}
              >
                Clear
              </Button>
              <SheetClose asChild>
                <Button type="button" className="min-h-11">
                  Show {initialData.total.toLocaleString()}
                  {initialData.totalIsExact ? "" : "+"} result
                  {initialData.total !== 1 ? "s" : ""}
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="text-sm text-muted-foreground">
          {initialData.total.toLocaleString()}{initialData.totalIsExact ? "" : "+"} listing
          {initialData.total !== 1 ? "s" : ""} found
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Select
            value={String(currentLimit)}
            onValueChange={(v) => updateParams({ limit: v })}
          >
            <SelectTrigger
              aria-label="Listings per page"
              className="w-full sm:w-[140px] h-8 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {viewMode === "grid" ? (
                <>
                  <SelectItem value="12">Show 12</SelectItem>
                  <SelectItem value="24">Show 24</SelectItem>
                  <SelectItem value="48">Show 48</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="50">Show 50</SelectItem>
                  <SelectItem value="100">Show 100</SelectItem>
                  <SelectItem value="250">Show 250</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
          <Select
            value={currentSort}
            onValueChange={(v) => updateParams({ sort: v })}
          >
            <SelectTrigger
              aria-label="Sort listings"
              className="w-full sm:w-[200px] h-8 text-xs"
            >
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
          <Button
            variant={atSearchLimit ? "gold" : "outline"}
            size="sm"
            onClick={handleSaveSearchClick}
            className="h-8"
          >
            <BookmarkPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            {isAuthenticated && !isPro
              ? `Save Search (${savedSearchCount}/${FREE_LIMITS.savedSearches})`
              : "Save Search"}
          </Button>
          <div className="flex border rounded-md">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-r-none",
                viewMode === "grid" && "bg-accent"
              )}
              onClick={() => handleViewModeChange("grid")}
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
              onClick={() => handleViewModeChange("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <SaveSearchDialog
        open={isSaveDialogOpen || shouldResumeSaveSearch}
        onOpenChange={handleSaveDialogOpenChange}
        filters={currentFilters}
        defaultName={defaultSavedSearchName}
        onSaved={() => {
          refetchSavedSearches();
          track("saved_search_alert_created", {
            ...searchGapContext,
            source: isZeroResults ? "zero_results" : "browse_toolbar",
            alert_enabled: true,
          });
        }}
      />

      {/* Premium Hero Banner */}
      {FEATURES.PROMOTIONS_ENABLED && <PremiumHeroBanner />}

      {/* Featured Carousel */}
      {FEATURES.PROMOTIONS_ENABLED && <FeaturedCarousel />}

      {/* Content */}
      <div className="flex gap-8">
        {isFilterPanelOpen && (
          <aside className="w-64 shrink-0 hidden md:block">
            <FacetedFilters
              key={`desktop-${filterStateKey}`}
              filters={currentFilters}
              onFiltersChange={updateFilters}
              onClearFilters={clearFilters}
            />
          </aside>
        )}

        <div className="flex-1">
          {FEATURES.PROMOTIONS_ENABLED && sponsoredListings && sponsoredListings.length > 0 && (
            <SponsoredCarousel listings={sponsoredListings} />
          )}

          {initialData.items.length === 0 ? (
            <section
              aria-labelledby="search-gap-title"
              className="mx-auto max-w-5xl py-12 text-center sm:py-16"
            >
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/50">
                <Search
                  className="h-10 w-10 text-muted-foreground/40"
                  aria-hidden="true"
                />
              </div>
              <h2
                id="search-gap-title"
                className="font-display text-2xl font-semibold"
              >
                {hasFilters
                  ? "No listings match your filters"
                  : "No listings yet"}
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-muted-foreground">
                {hasFilters
                  ? "Keep your criteria working. We can alert you, send your request to sellers, or help matching inventory get listed."
                  : "Be first to know when inventory arrives, or tell qualified sellers exactly what your business needs."}
              </p>

              <div className="mt-8 grid gap-4 text-left md:grid-cols-3">
                <Card className="flex h-full flex-col shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <BellRing className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h3 className="font-semibold leading-none tracking-tight">
                      Get a match alert
                    </h3>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <p className="flex-1 text-sm text-muted-foreground">
                      Save these filters and get notified when a matching lot
                      goes live.
                    </p>
                    <Button
                      className="mt-5 w-full"
                      variant="outline"
                      onClick={handleSaveSearchClick}
                    >
                      <BookmarkPlus
                        className="mr-2 h-4 w-4"
                        aria-hidden="true"
                      />
                      Save search alert
                    </Button>
                  </CardContent>
                </Card>

                <Card className="flex h-full flex-col border-primary/30 bg-primary/[0.03] shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <ClipboardPlus className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h3 className="font-semibold leading-none tracking-tight">
                      Let sellers come to you
                    </h3>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <p className="flex-1 text-sm text-muted-foreground">
                      Post a structured buyer request using the safe product and
                      price filters from this search.
                    </p>
                    <Button
                      className="mt-5 w-full"
                      onClick={handleBuyerRequestClick}
                    >
                      Post a buyer request
                    </Button>
                  </CardContent>
                </Card>

                <Card className="flex h-full flex-col shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <PackagePlus className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <h3 className="font-semibold leading-none tracking-tight">
                      Have matching inventory?
                    </h3>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <p className="flex-1 text-sm text-muted-foreground">
                      List the lot for verified buyers, or share this demand with
                      a flooring seller you know.
                    </p>
                    <div className="mt-5 grid gap-2">
                      <Button
                        className="w-full"
                        variant="secondary"
                        onClick={handleSellerIntentClick}
                      >
                        List matching inventory
                      </Button>
                      <Button asChild className="w-full" variant="ghost">
                        <a
                          href={referralHref}
                          onClick={() =>
                            trackZeroResultAction("refer_inventory")
                          }
                        >
                          <Share2
                            className="mr-2 h-4 w-4"
                            aria-hidden="true"
                          />
                          Refer a seller
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {hasFilters && (
                <Button
                  className="mt-6"
                  variant="ghost"
                  onClick={clearFilters}
                >
                  Clear all filters
                </Button>
              )}
            </section>
          ) : (
            <>
              {viewMode === "list" ? (
                <ListingTableView items={initialData.items} />
              ) : (
                <div className="grid gap-4 stagger-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {initialData.items.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))}
                </div>
              )}

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
                    Page {currentPage} of {initialData.totalPages}{initialData.totalIsExact ? "" : "+"}
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
