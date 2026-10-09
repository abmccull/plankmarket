import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BuyerDashboardPage from "../page";

const ordersRefetch = vi.fn();
const watchlistRefetch = vi.fn();
const savedSearchesRefetch = vi.fn();
const recommendedRefetch = vi.fn();
const requestsRefetch = vi.fn();
const trendingRefetch = vi.fn();

type QueryState<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: ReturnType<typeof vi.fn>;
};

let buyerQueries: {
  orders: QueryState<{ total: number; items: never[] }>;
  watchlist: QueryState<{ total: number; items: never[] }>;
  savedSearches: QueryState<Array<{ id: string }>>;
  recommended: QueryState<{ items: never[]; prefsIncomplete: boolean; limitation?: string }>;
  requests: QueryState<{ items: never[]; openCount?: number }>;
  trending: QueryState<never[]>;
} = {
  orders: {
    data: { total: 2, items: [] },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: ordersRefetch,
  },
  watchlist: {
    data: { total: 1, items: [] },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: watchlistRefetch,
  },
  savedSearches: {
    data: [{ id: "search-1" }],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: savedSearchesRefetch,
  },
  recommended: {
    data: { items: [], prefsIncomplete: false },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: recommendedRefetch,
  },
  requests: {
    data: { items: [] },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: requestsRefetch,
  },
  trending: {
    data: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: trendingRefetch,
  },
};

vi.mock("@/hooks/use-pro-status", () => ({
  useProStatus: () => ({ isPro: false }),
}));

vi.mock("@/components/dashboard/stats-card", () => ({
  StatsCard: ({ title, value }: { title: string; value: string | number }) => (
    <div>
      {title}:{value}
    </div>
  ),
}));

vi.mock("@/components/dashboard/onboarding-checklist", () => ({
  OnboardingChecklist: ({ variant }: { variant: string }) => (
    <div>Checklist:{variant}</div>
  ),
}));

vi.mock("@/components/ui/onboarding-tip", () => ({
  OnboardingTip: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/pro-badge", () => ({
  ProBadge: () => <span>PRO</span>,
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    order: {
      getMyOrders: { useQuery: () => buyerQueries.orders },
    },
    watchlist: {
      getMyWatchlist: { useQuery: () => buyerQueries.watchlist },
    },
    search: {
      getMySavedSearches: { useQuery: () => buyerQueries.savedSearches },
    },
    matching: {
      recommendedListings: { useQuery: () => buyerQueries.recommended },
    },
    buyerRequest: {
      getMyRequests: { useQuery: () => buyerQueries.requests },
    },
    listing: {
      getTrending: { useQuery: () => buyerQueries.trending },
    },
  },
}));

describe("BuyerDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buyerQueries = {
      orders: {
        data: { total: 2, items: [] },
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: ordersRefetch,
      },
      watchlist: {
        data: { total: 1, items: [] },
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: watchlistRefetch,
      },
      savedSearches: {
        data: [{ id: "search-1" }],
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: savedSearchesRefetch,
      },
      recommended: {
        data: { items: [], prefsIncomplete: false },
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: recommendedRefetch,
      },
      requests: {
        data: { items: [] },
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: requestsRefetch,
      },
      trending: {
        data: [],
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: trendingRefetch,
      },
    };
  });

  it("shows a retryable recent-orders error without hiding healthy dashboard data", async () => {
    buyerQueries.orders = {
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: ordersRefetch,
    };

    render(<BuyerDashboardPage />);

    const recentOrdersError = screen.getByRole("alert", {
      name: "We couldn't load recent orders",
    });
    expect(recentOrdersError).toBeInTheDocument();
    expect(screen.getByText("Total Orders:Unavailable")).toBeInTheDocument();
    expect(screen.getByText("Watchlist Items:1")).toBeInTheDocument();
    expect(screen.getByText("Saved Searches:1")).toBeInTheDocument();
    expect(
      screen.queryByRole("alert", { name: "We couldn't load your dashboard" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      within(recentOrdersError).getByRole("button", { name: "Try again" }),
    );

    expect(ordersRefetch).toHaveBeenCalledOnce();
    expect(watchlistRefetch).not.toHaveBeenCalled();
    expect(savedSearchesRefetch).not.toHaveBeenCalled();
  });

  it("keeps primary data visible when recommendations fail", () => {
    buyerQueries.recommended = {
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: recommendedRefetch,
    };

    render(<BuyerDashboardPage />);

    expect(screen.getByText("Total Orders:2")).toBeInTheDocument();
    expect(
      screen.getByRole("alert", { name: "We couldn't load recommendations" }),
    ).toBeInTheDocument();
  });
  it("explains an unverified waterproof requirement without weakening it", () => {
    buyerQueries.recommended.data = {
      items: [], prefsIncomplete: false, limitation: "waterproof_unverified",
    };
    render(<BuyerDashboardPage />);
    expect(screen.getByText("Waterproof performance needs confirmation")).toBeInTheDocument();
    expect(screen.queryByText("No matching listings right now")).not.toBeInTheDocument();
  });

});

it("shows aggregate open demand beyond the visible request page", () => { buyerQueries.requests = { data: { items: [], openCount: 51 }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }; render(<BuyerDashboardPage />); expect(screen.getByText("51")).toBeInTheDocument(); });
