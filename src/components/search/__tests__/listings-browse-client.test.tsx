import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListingsBrowseClient } from "../listings-browse-client";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockTrack = vi.fn();
const mockRefetch = vi.fn();
let currentParams = new URLSearchParams(
  "query=oak&materialType=hardwood&priceMax=4&buyerZip=84770",
);
let authState = {
  user: null as null | { role: "buyer" | "seller" | "admin" },
  isAuthenticated: false,
  isLoading: false,
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => currentParams,
}));

vi.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: () => authState,
}));

vi.mock("@/hooks/use-pro-status", () => ({
  useProStatus: () => ({ isPro: false }),
}));

vi.mock("@/lib/analytics/use-track", () => ({
  useTrack: () => mockTrack,
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    search: {
      getMySavedSearches: {
        useQuery: () => ({
          data: [],
          isLoading: false,
          refetch: mockRefetch,
        }),
      },
    },
  },
}));

vi.mock("@/lib/feature-flags", () => ({
  FEATURES: { PROMOTIONS_ENABLED: false },
}));

vi.mock("@/components/search/faceted-filters", () => ({
  FacetedFilters: ({
    onFiltersChange,
    onClearFilters,
  }: {
    onFiltersChange: (updates: Record<string, unknown>) => void;
    onClearFilters: () => void;
  }) => (
    <div>
      <button
        onClick={() =>
          onFiltersChange({
            materialType: ["tile"],
            buyerZip: "84003",
            maxDistance: 150,
            sellerVerified: true,
            freightReady: true,
            fullLotOnly: false,
          })
        }
      >
        Apply mock filters
      </button>
      <button onClick={onClearFilters}>Clear mock filters</button>
    </div>
  ),
}));

vi.mock("@/components/search/listing-card", () => ({
  ListingCard: () => <div>Listing card</div>,
}));

vi.mock("@/components/search/listing-table-view", () => ({
  ListingTableView: () => <div>Listing table</div>,
}));

vi.mock("@/components/promotions/sponsored-carousel", () => ({
  SponsoredCarousel: () => null,
}));

vi.mock("@/components/promotions/featured-carousel", () => ({
  FeaturedCarousel: () => null,
}));

vi.mock("@/components/promotions/hero-banner", () => ({
  PremiumHeroBanner: () => null,
}));

vi.mock("@/components/saved-searches/save-search-dialog", () => ({
  SaveSearchDialog: ({
    open,
    onSaved,
    onOpenChange,
  }: {
    open: boolean;
    onSaved?: () => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <button
        onClick={() => {
          onSaved?.();
          onOpenChange(false);
        }}
      >
        Confirm saved search
      </button>
    ) : null,
}));

const emptyData = {
  items: [],
  total: 0,
  totalIsExact: true,
  totalPages: 0,
  page: 1,
  limit: 24,
  hasMore: false,
};

function renderBrowse() {
  return render(
    <ListingsBrowseClient
      initialData={emptyData}
      sponsoredListings={[]}
      initialParams={{
        page: 1,
        limit: 24,
        sort: "date_newest",
        query: "oak",
        materialType: "hardwood",
      }}
    />,
  );
}

describe("ListingsBrowseClient search gap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentParams = new URLSearchParams(
      "query=oak&materialType=hardwood&priceMax=4&buyerZip=84770",
    );
    authState = { user: null, isAuthenticated: false, isLoading: false };
  });

  it("offers all demand-capture actions and tracks a private impression", async () => {
    const user = userEvent.setup();
    renderBrowse();

    expect(
      screen.getByRole("heading", { name: "No listings match your filters" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save search alert" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Post a buyer request" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "List matching inventory" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Refer a seller" })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:"),
    );

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith(
        "marketplace_zero_results_viewed",
        expect.objectContaining({
          query_present: true,
          material_types: ["hardwood"],
          results_count: 0,
        }),
      );
    });
    const impression = mockTrack.mock.calls.find(
      ([event]) => event === "marketplace_zero_results_viewed",
    )?.[1];
    expect(impression).not.toHaveProperty("query");
    expect(impression).not.toHaveProperty("buyer_zip");

    await user.click(
      screen.getByRole("button", { name: "Post a buyer request" }),
    );
    const buyerAuthPath = mockPush.mock.calls.at(-1)?.[0] as string;
    const buyerAuthUrl = new URL(buyerAuthPath, "https://plankmarket.test");
    expect(buyerAuthUrl.pathname).toBe("/login");
    expect(buyerAuthUrl.searchParams.get("role")).toBe("buyer");
    expect(buyerAuthUrl.searchParams.get("redirect")).toContain(
      "/buyer/requests/new?source=zero_results",
    );

    await user.click(screen.getByRole("button", { name: "Save search alert" }));
    const alertAuthPath = mockPush.mock.calls.at(-1)?.[0] as string;
    const alertAuthUrl = new URL(alertAuthPath, "https://plankmarket.test");
    expect(alertAuthUrl.searchParams.get("redirect")).toContain(
      "intent=save_search",
    );
    expect(alertAuthUrl.searchParams.get("redirect")).toContain(
      "materialType=hardwood",
    );

    await user.click(
      screen.getByRole("button", { name: "List matching inventory" }),
    );
    const sellerAuthPath = mockPush.mock.calls.at(-1)?.[0] as string;
    const sellerAuthUrl = new URL(sellerAuthPath, "https://plankmarket.test");
    expect(sellerAuthUrl.pathname).toBe("/register");
    expect(sellerAuthUrl.searchParams.get("role")).toBe("seller");
    expect(sellerAuthUrl.searchParams.get("redirect")).toContain(
      "/seller/listings/new?",
    );
  });

  it("gives the mobile filter drawer a persistent result action", async () => {
    const user = userEvent.setup();
    renderBrowse();

    await user.click(screen.getByRole("button", { name: "Open filters" }));

    const dialog = screen.getByRole("dialog", { name: "Filters" });
    expect(within(dialog).getByText("0 listings match")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Clear" }),
    ).toBeEnabled();

    await user.click(
      within(dialog).getByRole("button", { name: "Show 0 results" }),
    );
    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
  });

  it("pushes filter changes into the listings URL instead of local-only state", async () => {
    const user = userEvent.setup();
    renderBrowse();

    await user.click(screen.getByRole("button", { name: "Toggle filters" }));
    await user.click(screen.getAllByRole("button", { name: "Apply mock filters" })[0]!);

    const pushedPath = mockPush.mock.calls.at(-1)?.[0] as string;
    const pushedUrl = new URL(pushedPath, "https://plankmarket.test");

    expect(pushedUrl.pathname).toBe("/listings");
    expect(pushedUrl.searchParams.get("query")).toBe("oak");
    expect(pushedUrl.searchParams.get("materialType")).toBe("tile");
    expect(pushedUrl.searchParams.get("priceMax")).toBe("4");
    expect(pushedUrl.searchParams.get("buyerZip")).toBe("84003");
    expect(pushedUrl.searchParams.get("maxDistance")).toBe("150");
    expect(pushedUrl.searchParams.get("sellerVerified")).toBe("true");
    expect(pushedUrl.searchParams.get("freightReady")).toBe("true");
    expect(pushedUrl.searchParams.get("fullLotOnly")).toBe("false");
    expect(pushedUrl.searchParams.get("page")).toBeNull();
  });

  it("clears facet params from the URL while preserving the search query", async () => {
    const user = userEvent.setup();
    renderBrowse();

    await user.click(screen.getByRole("button", { name: "Toggle filters" }));
    await user.click(screen.getAllByRole("button", { name: "Clear mock filters" })[0]!);

    const pushedPath = mockPush.mock.calls.at(-1)?.[0] as string;
    const pushedUrl = new URL(pushedPath, "https://plankmarket.test");

    expect(pushedUrl.pathname).toBe("/listings");
    expect(pushedUrl.searchParams.get("query")).toBe("oak");
    expect(pushedUrl.searchParams.get("materialType")).toBeNull();
    expect(pushedUrl.searchParams.get("priceMax")).toBeNull();
    expect(pushedUrl.searchParams.get("buyerZip")).toBeNull();
  });

  it("opens the existing saved-search flow and records completion", async () => {
    authState = {
      user: { role: "buyer" },
      isAuthenticated: true,
      isLoading: false,
    };
    const user = userEvent.setup();
    renderBrowse();

    await user.click(screen.getByRole("button", { name: "Save search alert" }));
    await user.click(screen.getByRole("button", { name: "Confirm saved search" }));

    expect(mockRefetch).toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith(
      "saved_search_alert_created",
      expect.objectContaining({
        source: "zero_results",
        alert_enabled: true,
      }),
    );
  });

  it("resumes a saved-search intent after authentication", async () => {
    authState = {
      user: { role: "buyer" },
      isAuthenticated: true,
      isLoading: false,
    };
    currentParams = new URLSearchParams(
      "materialType=hardwood&intent=save_search",
    );
    renderBrowse();

    expect(
      await screen.findByRole("button", { name: "Confirm saved search" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm saved search" }),
    );
    expect(mockReplace).toHaveBeenCalledWith(
      "/listings?materialType=hardwood",
      { scroll: false },
    );
  });
});
