import { render, screen } from "@testing-library/react";
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
  recommended: QueryState<{ items: never[]; prefsIncomplete: boolean }>;
  requests: QueryState<{ items: never[] }>;
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

  it("shows a retryable dashboard error when required data cannot be loaded", async () => {
    buyerQueries.orders = {
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: ordersRefetch,
    };

    render(<BuyerDashboardPage />);

    expect(
      screen.getByRole("alert", { name: "We couldn't load your dashboard" }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(ordersRefetch).toHaveBeenCalledOnce();
    expect(watchlistRefetch).toHaveBeenCalledOnce();
    expect(savedSearchesRefetch).toHaveBeenCalledOnce();
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
});
