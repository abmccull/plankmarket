"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ListingCard } from "@/components/search/listing-card";
import { ListingTableView } from "@/components/search/listing-table-view";
import { FacetedFilters, type FilterUpdates } from "@/components/search/faceted-filters";
import { SaveSearchDialog } from "@/components/saved-searches/save-search-dialog";
import { SponsoredCarousel } from "@/components/promotions/sponsored-carousel";
import { FeaturedCarousel } from "@/components/promotions/featured-carousel";
import { PremiumHeroBanner } from "@/components/promotions/hero-banner";
import { FEATURES } from "@/lib/feature-flags";
import { useAuthStore } from "@/lib/stores/auth-store";
import { canCreateListings, canPurchase } from "@/lib/auth/roles";
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
  MapPin,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parsePurchaseIntent } from "@/lib/marketplace/purchase-intent";
import { getWearLayerOptions } from "@/lib/constants/flooring";
import { MAX_PUBLIC_FILTER_NUMBER } from "@/lib/validators/listing";
import type { SearchFilters, SortOption, PromotionTier, MaterialType } from "@/types";
import { toast } from "sonner";
import type { ListingFreshnessStatus } from "@/lib/listing-freshness";
import type { FreightEstimateStatus } from "@/components/listings/listing-evidence";

const JOB_MATERIALS: { value: MaterialType; label: string }[] = [
  { value: "hardwood", label: "Hardwood" },
  { value: "engineered", label: "Engineered wood" },
  { value: "vinyl_lvp", label: "Vinyl / LVP" },
  { value: "laminate", label: "Laminate" },
  { value: "bamboo", label: "Bamboo" },
  { value: "tile", label: "Tile" },
  { value: "other", label: "Other" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "proximity", label: "Nearest First" },
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
    locationLabel?: string | null;
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
  "hideQuantityConflicts",
  "maxDistance",
  "buyerZip",
  "waterproofRequired",
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
  if (filters.hideQuantityConflicts === true) params.set("hideQuantityConflicts", "true");
  if (filters.maxDistance !== undefined) {
    params.set("maxDistance", String(filters.maxDistance));
  }
  if (filters.buyerZip) {
    params.set("buyerZip", filters.buyerZip);
  }
  if (filters.waterproofRequired === true) params.set("waterproofRequired", "true");
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
  const [editingJobKey, setEditingJobKey] = useState<string | null>(null);
  const jobSummaryRef = useRef<HTMLButtonElement>(null);
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
  const [searchDraft, setSearchDraft] = useState({
    source: searchParamsString,
    intended: searchParamsString,
    value: currentFilters.query ?? "",
    acknowledgements: [] as string[],
  });
  if (searchDraft.source !== searchParamsString) {
    const acknowledgement = searchDraft.acknowledgements.indexOf(searchParamsString);
    // Reconcile URL changes before rendering, without replacing this input node.
    setSearchDraft({
      source: searchParamsString,
      intended: acknowledgement >= 0 ? searchDraft.intended : searchParamsString,
      value: acknowledgement >= 0 ? searchDraft.value : currentFilters.query ?? "",
      acknowledgements: acknowledgement >= 0 ? searchDraft.acknowledgements.slice(acknowledgement + 1) : [],
    });
  }
  const intendedFilters = useMemo(
    () => searchParamsToFilters(new URLSearchParams(searchDraft.intended)),
    [searchDraft.intended],
  );
  const normalizeKeyword = (value: string) => value.trim().length >= 3 ? value.trim() : "";
  const isSearchPending = searchDraft.intended !== searchParamsString ||
    normalizeKeyword(searchDraft.value) !== normalizeKeyword(currentFilters.query ?? "");
  const intendedParamsRef = useRef(searchParamsString);
  const observedParamsRef = useRef(searchParamsString);
  const inFlightParamsRef = useRef<string | null>(null);
  const issuedParamsRef = useRef(new Set<string>());
  const pendingKeywordRef = useRef<string | undefined>(undefined);
  const searchRevisionRef = useRef(0);
  const cancelPendingSearch = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
    searchRevisionRef.current += 1;
  }, []);

  const adoptSearchLocation = useCallback((paramsString: string) => {
    cancelPendingSearch();
    pendingKeywordRef.current = undefined;
    issuedParamsRef.current.clear();
    inFlightParamsRef.current = null;
    intendedParamsRef.current = paramsString;
    observedParamsRef.current = paramsString;
    setSearchDraft((draft) => ({
      ...draft,
      intended: paramsString,
      value: searchParamsToFilters(new URLSearchParams(paramsString)).query ?? "",
      acknowledgements: [paramsString],
    }));
  }, [cancelPendingSearch]);

  useEffect(() => {
    if (observedParamsRef.current === searchParamsString) return;
    observedParamsRef.current = searchParamsString;
    if (issuedParamsRef.current.delete(searchParamsString)) {
      if (inFlightParamsRef.current === searchParamsString) inFlightParamsRef.current = null;
      // Coalesce edits made during a request, then dispatch their latest value.
      // Concurrent pushes can let an older response strand the latest intent.
      if (intendedParamsRef.current === searchParamsString) {
        issuedParamsRef.current.clear();
      } else if (inFlightParamsRef.current === null) {
        const destination = intendedParamsRef.current;
        inFlightParamsRef.current = destination;
        issuedParamsRef.current.add(destination);
        router.push(buildListingsUrl(new URLSearchParams(destination)), { scroll: false });
      }
      return;
    }
    cancelPendingSearch();
    pendingKeywordRef.current = undefined;
    issuedParamsRef.current.clear();
    inFlightParamsRef.current = null;
    intendedParamsRef.current = searchParamsString;
  }, [cancelPendingSearch, router, searchParamsString]);

  useEffect(() => {
    const onHistory = () => adoptSearchLocation(new URLSearchParams(window.location.search).toString());
    const onLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const destination = new URL(link.href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search && destination.origin === window.location.origin) return;
      if (destination.origin === window.location.origin && destination.pathname === window.location.pathname) {
        adoptSearchLocation(new URLSearchParams(destination.search).toString());
        return;
      }
      cancelPendingSearch();
      pendingKeywordRef.current = undefined;
      inFlightParamsRef.current = null;
      issuedParamsRef.current.clear();
    };
    window.addEventListener("popstate", onHistory);
    window.addEventListener("click", onLink, true);
    return () => {
      window.removeEventListener("popstate", onHistory);
      window.removeEventListener("click", onLink, true);
      cancelPendingSearch();
    };
  }, [adoptSearchLocation, cancelPendingSearch]);
  const purchaseIntent = parsePurchaseIntent({ quantitySqFt: currentFilters.minLotSize, zip: currentFilters.buyerZip });
  const jobKey = JSON.stringify([currentFilters.materialType, currentFilters.minLotSize, currentFilters.buyerZip]);
  const hasJobCriteria = Boolean(currentFilters.materialType?.length || currentFilters.minLotSize !== undefined || currentFilters.buyerZip);
  const jobEditorOpen = !hasJobCriteria || editingJobKey === jobKey;
  const jobSummary = [
    currentFilters.materialType?.map((value) => JOB_MATERIALS.find((option) => option.value === value)?.label ?? value).join(", "),
    currentFilters.minLotSize !== undefined ? `${currentFilters.minLotSize.toLocaleString()}+ sq ft lots` : undefined,
    currentFilters.buyerZip ? `ZIP ${currentFilters.buyerZip}` : undefined,
  ].filter(Boolean).join(" · ");
  const requestedSort = currentSearchParams.get("sort") ?? initialParams.sort;
  const currentSort = requestedSort === "proximity" && initialData.locationLabel === null
    ? "date_newest"
    : requestedSort;
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
      cancelPendingSearch();
      const params = new URLSearchParams(intendedParamsRef.current);
      if (pendingKeywordRef.current !== undefined) {
        const keyword = pendingKeywordRef.current.trim();
        if (keyword.length >= 3) params.set("query", keyword);
        else params.delete("query");
        pendingKeywordRef.current = undefined;
      }
      mutate(params);
      const quantity = Number(params.get("minLotSize"));
      if (params.getAll("minLotSize").length !== 1 || !Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_PUBLIC_FILTER_NUMBER) {
        params.delete("hideQuantityConflicts");
      }
      const destination = params.toString();
      if (destination === intendedParamsRef.current) return;
      intendedParamsRef.current = destination;
      setSearchDraft((draft) => ({
        ...draft,
        intended: destination,
        acknowledgements: [...draft.acknowledgements.filter((value) => value !== destination), destination],
      }));
      if (inFlightParamsRef.current === null) {
        inFlightParamsRef.current = destination;
        issuedParamsRef.current.add(destination);
        router.push(buildListingsUrl(params), { scroll: false });
      }
    },
    [cancelPendingSearch, router],
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
    (updates: FilterUpdates) => {
      navigateWithParams((params) => {
        const current = searchParamsToFilters(params);
        const patch = typeof updates === "function" ? updates(current) : updates;
        writeFilterParams(params, {
          ...current,
          ...patch,
        });
        if ("buyerZip" in patch && !patch.buyerZip && params.get("sort") === "proximity") {
          params.delete("sort");
        }
        params.delete("page");
      });
    },
    [navigateWithParams],
  );

  const clearFilters = useCallback(() => {
    navigateWithParams((params) => {
      for (const key of FILTER_PARAM_KEYS) {
        params.delete(String(key));
      }
      params.delete("page");
      if (params.get("sort") === "proximity") params.delete("sort");
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
      setSearchDraft((draft) => ({ ...draft, value }));
      pendingKeywordRef.current = value;
      cancelPendingSearch();
      const revision = searchRevisionRef.current;
      timeoutRef.current = setTimeout(() => {
        if (searchRevisionRef.current !== revision) return;
        const normalized = value.trim();
        updateParams({
          query: normalized.length >= 3 ? normalized : undefined,
        });
      }, 300);
    },
    [cancelPendingSearch, updateParams]
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
    !isSearchPending &&
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
    if (isSearchPending) return;
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
    isSearchPending,
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
    if (!isAuthenticated || !user || !canPurchase(user.role)) {
      router.push(buildAuthPath(buyerRequestPath, "buyer"));
      return;
    }

    router.push(buyerRequestPath);
  }, [
    buyerRequestPath,
    isAuthenticated,
    router,
    trackZeroResultAction,
    user,
  ]);

  const handleSellerIntentClick = useCallback(() => {
    trackZeroResultAction("list_inventory");
    if (!isAuthenticated || !user) {
      router.push(buildAuthPath(sellerIntentPath, "seller", "register"));
      return;
    }

    if (!canCreateListings(user.role)) {
      const search = currentSearchParams.toString();
      const returnPath = `/listings${search ? `?${search}` : ""}`;
      router.push(`/settings/selling?${new URLSearchParams({ redirect: returnPath }).toString()}`);
      return;
    }

    router.push(sellerIntentPath);
  }, [
    currentSearchParams,
    isAuthenticated,
    router,
    sellerIntentPath,
    trackZeroResultAction,
    user,
  ]);

  const displayControls = (
    <>
      <Select
        value={String(currentLimit)}
        onValueChange={(v) => updateParams({ limit: v })}
      >
        <SelectTrigger
          aria-label="Listings per page"
          className="w-auto max-w-full min-h-11 h-auto min-w-0 whitespace-normal text-sm [&>span]:line-clamp-none [&>span]:text-left"
        >
          <SelectValue>Show {currentLimit}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {viewMode === "grid" ? (
            <>
              <SelectItem className="min-h-11" value="12">
                Show 12
              </SelectItem>
              <SelectItem className="min-h-11" value="24">
                Show 24
              </SelectItem>
              <SelectItem className="min-h-11" value="48">
                Show 48
              </SelectItem>
            </>
          ) : (
            <>
              <SelectItem className="min-h-11" value="50">
                Show 50
              </SelectItem>
              <SelectItem className="min-h-11" value="100">
                Show 100
              </SelectItem>
              <SelectItem className="min-h-11" value="250">
                Show 250
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
      <div className="flex w-fit shrink-0 border rounded-md">
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-11 w-11 rounded-r-none",
            viewMode === "grid" && "bg-accent",
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
            "h-11 w-11 rounded-l-none",
            viewMode === "list" && "bg-accent",
          )}
          onClick={() => handleViewModeChange("list")}
          aria-label="List view"
          aria-pressed={viewMode === "list"}
        >
          <List className="h-4 w-4" />
        </Button>
      </div>
    </>
  );

  return (
    <div className="container mx-auto px-[16px] py-4 sm:py-6">
      <header className="mb-3">
        <h1 className="font-display text-2xl tracking-tight sm:text-3xl">
          Flooring listings
        </h1>
      </header>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          name="query"
          form="job-lot-search"
          placeholder="Search flooring by material, species, brand (3+ characters)..."
          className="min-h-11 pl-10"
          value={searchDraft.value}
          onChange={(e) => handleSearchChange(e.target.value)}
          minLength={3}
          aria-label="Search flooring"
        />
      </div>

      {!jobEditorOpen && (
        <button
          ref={jobSummaryRef}
          type="button"
          className="mb-2 flex min-h-11 w-full items-center justify-between gap-3 border-b pb-2 text-left sm:hidden"
          aria-label={`Edit job: ${jobSummary}`}
          aria-expanded={false}
          aria-controls="job-lot-search"
          onClick={() => {
            setEditingJobKey(jobKey);
            requestAnimationFrame(() => document.getElementById("browse-job-material")?.focus());
          }}
        >
          <span className="text-sm">{jobSummary}</span>
          <span className="shrink-0 text-sm font-medium text-primary underline underline-offset-4">Edit job</span>
        </button>
      )}
      <form
        id="job-lot-search"
        key={jobKey}
        className={cn("mb-2 space-y-2 border-b pb-3 sm:block", !jobEditorOpen && "hidden")}
        aria-label="Find flooring for your job"
        onInvalid={(event) => {
          setEditingJobKey(jobKey);
          const field = event.target as HTMLElement;
          requestAnimationFrame(() => field.focus());
        }}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const zip = String(data.get("locationZip") ?? "").trim();
          const amount = String(data.get("quantity") ?? "").trim();
          const quantity = amount ? Number(amount) : undefined;
          const material = String(data.get("material") ?? "");
          const query = String(data.get("query") ?? "").trim();
          if (zip && !/^\d{5}$/.test(zip)) return;
          if (quantity !== undefined && (!Number.isFinite(quantity) || quantity < 0 || quantity > MAX_PUBLIC_FILTER_NUMBER)) return;
          if (query && query.length < 3) return;
          if (quantity !== undefined && currentFilters.maxLotSize !== undefined && quantity > currentFilters.maxLotSize) {
            toast.error("The square feet needed exceeds your maximum lot-size filter. Adjust that filter and try again.");
            return;
          }
          const selected = JOB_MATERIALS.find((option) => option.value === material);
          if (material && material !== "__selected" && !selected) return;
          const materialType = material === "__selected" ? currentFilters.materialType : selected ? [selected.value] : undefined;
          const materialChanged = (materialType ?? []).join(",") !== (currentFilters.materialType ?? []).join(",");
          const validWearLayers = new Set(getWearLayerOptions(materialType).map((option) => option.value));
          clearTimeout(timeoutRef.current);
          updateParams({
            query: query || undefined,
            materialType: materialType?.join(","),
            minLotSize: quantity === undefined ? undefined : String(quantity),
            buyerZip: zip || undefined,
            ...(!zip ? { maxDistance: undefined } : {}),
            ...(materialChanged ? { wearLayer: currentFilters.wearLayer?.filter((layer) => validWearLayers.has(layer)).join(",") } : {}),
            sort: zip ? "proximity" : currentSort === "proximity" ? undefined : currentSort,
          });
          setEditingJobKey(null);
          requestAnimationFrame(() => {
            if (jobSummaryRef.current?.getClientRects().length) jobSummaryRef.current.focus();
          });
        }}
      >
        <p className="text-sm font-medium">Find flooring for your job</p>
        <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
            <label htmlFor="browse-job-material" className="text-xs font-medium">Material</label>
            <select id="browse-job-material" name="material" defaultValue={(currentFilters.materialType?.length ?? 0) > 1 ? "__selected" : currentFilters.materialType?.[0] ?? ""} className="flex h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Any material</option>
              {(currentFilters.materialType?.length ?? 0) > 1 && <option value="__selected">Keep selected materials</option>}
              {JOB_MATERIALS.map((material) => <option key={material.value} value={material.value}>{material.label}</option>)}
            </select>
          </div>
          <div className="min-w-0 space-y-1">
            <label htmlFor="browse-job-quantity" className="text-xs font-medium">Sq ft needed</label>
            <Input id="browse-job-quantity" name="quantity" type="number" inputMode="decimal" min={0} max={MAX_PUBLIC_FILTER_NUMBER} step="any" placeholder="Any size" defaultValue={currentFilters.minLotSize ?? ""} className="min-h-11" aria-describedby="browse-job-hint" />
          </div>
          <div className="min-w-0 space-y-1">
            <label htmlFor="browse-location-zip" className="flex items-center gap-1 text-xs font-medium"><MapPin className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />Job ZIP code</label>
            <Input id="browse-location-zip" name="locationZip" placeholder="Nationwide" defaultValue={currentFilters.buyerZip ?? ""} inputMode="numeric" autoComplete="postal-code" pattern="[0-9]{5}" maxLength={5} className="min-h-11" />
          </div>
          <Button type="submit" className="col-span-2 h-auto min-h-11 whitespace-normal sm:col-span-1">Find lots</Button>
        </div>
        <p id="browse-job-hint" className="text-xs text-muted-foreground">Shows lots with at least this many square feet. Check minimum orders on each lot; freight is quoted at checkout.</p>
        {currentFilters.maxLotSize !== undefined && <p className="text-xs text-muted-foreground">Your maximum lot-size filter is {currentFilters.maxLotSize.toLocaleString()} sq ft.</p>}
      </form>
      {purchaseIntent.quantitySqFt !== undefined && (
        <div className="mb-3">
          <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-primary"
              checked={intendedFilters.hideQuantityConflicts === true}
              onChange={(event) => updateParams({ hideQuantityConflicts: event.target.checked ? "true" : undefined })}
              aria-describedby="quantity-conflict-hint"
            />
            Hide known quantity conflicts
          </label>
          <p id="quantity-conflict-hint" className="text-xs text-muted-foreground">
            Keeps larger minimum orders and full lots. Lots needing confirmation remain visible.
          </p>
          {intendedFilters.hideQuantityConflicts && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-auto min-h-11 whitespace-normal"
              aria-label="Remove quantity conflict filter"
              onClick={() => updateParams({ hideQuantityConflicts: undefined })}
            >
              Quantity conflicts hidden <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
        <p className="mb-3 text-xs text-muted-foreground" role="status">
          {currentFilters.buyerZip && initialData.locationLabel === null
            ? "ZIP not recognized. Distance sorting is unavailable; try another ZIP."
            : initialData.locationLabel
              ? initialData.locationLabel + (currentFilters.maxDistance ? " · within " + currentFilters.maxDistance + " miles" : currentSort === "proximity" ? " · nearest lots first" : "")
              : "Add a job ZIP to put nearby inventory first."}
        </p>

      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={currentSort}
            onValueChange={(v) => updateParams({ sort: v })}
          >
            <SelectTrigger
              aria-label="Sort listings"
              className="h-auto min-h-11 min-w-0 flex-1 whitespace-normal text-left sm:w-[200px] sm:flex-none [&>span]:line-clamp-none [&>span]:text-left"
            >
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem
                  className="min-h-11"
                  key={opt.value}
                  value={opt.value}
                  disabled={
                    opt.value === "proximity" && !currentFilters.buyerZip
                  }
                >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setIsMobileFilterOpen(false);
              setIsFilterPanelOpen((open) => !open);
            }}
            className={cn(
              "hidden h-11 w-11 md:flex",
              isFilterPanelOpen && "bg-accent",
            )}
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
                className="h-auto min-h-11 shrink-0 whitespace-normal md:hidden"
                aria-label="Open filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>Filters</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="flex w-[min(100%,384px)] flex-col gap-0 p-0 sm:max-w-[384px]"
            >
              <div className="shrink-0 border-b px-[20px] py-4 pr-[56px]">
                <SheetTitle>Filters</SheetTitle>
                <p
                  className="mt-1 text-sm text-muted-foreground"
                  aria-live="polite"
                >
                  {isSearchPending ? "Updating listings…" : <>{initialData.total.toLocaleString()}
                  {initialData.totalIsExact ? "" : "+"} listing
                  {initialData.total !== 1 ? "s" : ""} match</>}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-[20px] py-4 [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:whitespace-normal [&_input]:min-h-11">
                <section
                  aria-labelledby="mobile-display-title"
                  className="mb-5 space-y-3 border-b pb-5"
                >
                  <h3
                    id="mobile-display-title"
                    className="text-sm font-semibold"
                  >
                    Display preferences
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {displayControls}
                  </div>
                </section>
                <FacetedFilters
                  key={`mobile-${filterStateKey}`}
                  filters={intendedFilters}
                  onFiltersChange={updateFilters}
                  onClearFilters={clearFilters}
                />
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 border-t bg-background px-[20px] py-4 shadow-[0_-8px_24px_rgba(49,32,21,0.08)]">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-11 flex-1 basis-20 whitespace-normal"
                  onClick={clearFilters}
                  disabled={!hasFilters}
                >
                  Clear
                </Button>
                <SheetClose asChild>
                  <Button
                    type="button"
                    className="h-auto min-h-11 flex-[2] basis-40 whitespace-normal"
                  >
                    {isSearchPending ? "View results" : <>Show {initialData.total.toLocaleString()}
                    {initialData.totalIsExact ? "" : "+"} result
                    {initialData.total !== 1 ? "s" : ""}</>}
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
          <div className="hidden min-w-0 flex-wrap items-center gap-2 md:flex">
            {displayControls}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm text-muted-foreground" role="status">
            {isSearchPending ? "Updating listings…" : <>{initialData.total.toLocaleString()}
            {initialData.totalIsExact ? "" : "+"} listing
            {initialData.total !== 1 ? "s" : ""} found</>}
          </div>
          <Button
            variant={atSearchLimit ? "gold" : "outline"}
            size="sm"
            onClick={handleSaveSearchClick}
            disabled={isSearchPending}
            className="min-h-11 h-auto whitespace-normal"
          >
            <BookmarkPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            {isAuthenticated && !isPro
              ? `Save Search (${savedSearchCount}/${FREE_LIMITS.savedSearches})`
              : "Save Search"}
          </Button>
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
      {FEATURES.PROMOTIONS_ENABLED && <PremiumHeroBanner purchaseIntent={purchaseIntent} />}

      {/* Featured Carousel */}
      {FEATURES.PROMOTIONS_ENABLED && <FeaturedCarousel purchaseIntent={purchaseIntent} />}

      {/* Content */}
      <div className="flex min-w-0 gap-8">
        {isFilterPanelOpen && (
          <aside className="hidden w-64 shrink-0 md:block [&_button]:min-h-11 [&_button]:min-w-11 [&_input]:min-h-11">
            <h2 className="sr-only">Refine listings</h2>
            <FacetedFilters
              key={`desktop-${filterStateKey}`}
              filters={intendedFilters}
              onFiltersChange={updateFilters}
              onClearFilters={clearFilters}
            />
          </aside>
        )}

        <div className="min-w-0 flex-1" role="region" aria-label="Listing results" aria-busy={isSearchPending}>
          {isSearchPending && initialData.items.length > 0 && (
            <p className="mb-3 text-sm text-muted-foreground">Previous results are shown while your search updates.</p>
          )}
          {FEATURES.PROMOTIONS_ENABLED &&
            sponsoredListings &&
            sponsoredListings.length > 0 && (
              <SponsoredCarousel listings={sponsoredListings} purchaseIntent={purchaseIntent} />
            )}

          {initialData.items.length === 0 && isSearchPending ? (
            <p className="py-12 text-center text-muted-foreground">Finding inventory for your updated search…</p>
          ) : initialData.items.length === 0 ? (
            <section
              aria-labelledby="search-gap-title"
              className="mx-auto max-w-5xl py-6 text-center sm:py-16"
            >
              <div className="mx-auto mb-4 hidden h-20 w-20 sm:flex items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/50">
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
                  ? "Tell sellers what you need, or save an alert for a matching lot."
                  : "Be first to know when inventory arrives, or tell qualified sellers exactly what your business needs."}
              </p>

              <div className="mx-auto mt-6 flex max-w-lg flex-col items-center gap-3">
                <Button
                  className="h-auto min-h-11 w-full whitespace-normal sm:w-auto"
                  onClick={handleBuyerRequestClick}
                >
                  Post a buyer request
                </Button>
                <p className="text-sm text-muted-foreground">
                  Tell sellers what you need using your current search criteria.
                </p>
                <Button
                  variant="outline"
                  className="h-auto min-h-11 w-full whitespace-normal sm:w-auto"
                  onClick={handleSaveSearchClick}
                >
                  <BookmarkPlus className="mr-2 h-4 w-4" aria-hidden="true" />
                  Save search alert
                </Button>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
                  <button
                    type="button"
                    onClick={handleSellerIntentClick}
                    className="min-h-11 underline underline-offset-4"
                  >
                    List matching inventory
                  </button>
                  <a
                    className="inline-flex min-h-11 items-center underline underline-offset-4"
                    href={referralHref}
                    onClick={() => trackZeroResultAction("refer_inventory")}
                  >
                    Refer a seller
                  </a>
                </div>
              </div>

              {hasFilters && (
                <Button
                  className="mt-6 h-auto min-h-11 whitespace-normal"
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
                <ListingTableView items={initialData.items} purchaseIntent={purchaseIntent} />
              ) : (
                <div className="grid gap-4 stagger-grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {initialData.items.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} purchaseIntent={purchaseIntent} />
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
                      <Button variant="outline" size="sm" className="min-h-11">
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                  )}
                  <span className="text-sm text-muted-foreground px-4">
                    Page {currentPage} of {initialData.totalPages}
                    {initialData.totalIsExact ? "" : "+"}
                  </span>
                  {currentPage < initialData.totalPages ? (
                    <Link href={buildPageUrl(currentPage + 1)}>
                      <Button variant="outline" size="sm" className="min-h-11">
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      disabled
                    >
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
