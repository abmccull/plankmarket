import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SellerDashboardPage from "../page";

const listingStatsRefetch = vi.fn();
const orderStatsRefetch = vi.fn();
const analyticsRefetch = vi.fn();
const recommendedRequestsRefetch = vi.fn();

type QueryState<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: ReturnType<typeof vi.fn>;
};

let sellerQueries: {
  listingStats: QueryState<
    Array<{ status: string; count: number; totalViews: number }>
  >;
  orderStats: QueryState<
    Array<{ status: string; count: number; totalRevenue: number }>
  >;
  analytics: QueryState<{
    kpis: {
      revenue: number;
      prevRevenue: number;
      orders: number;
      prevOrders: number;
    };
    timeSeries: Array<{ date: string; revenue: number }>;
  }>;
  recommendedRequests: QueryState<{ items: never[]; prefsIncomplete: boolean }>;
} = {
  listingStats: {
    data: [
      { status: "active", count: 1, totalViews: 12 },
      { status: "draft", count: 2, totalViews: 0 },
    ],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: listingStatsRefetch,
  },
  orderStats: {
    data: [{ status: "pending", count: 3, totalRevenue: 4500 }],
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: orderStatsRefetch,
  },
  analytics: {
    data: {
      kpis: { revenue: 4500, prevRevenue: 3000, orders: 3, prevOrders: 2 },
      timeSeries: [{ date: "2026-08-01", revenue: 4500 }],
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: analyticsRefetch,
  },
  recommendedRequests: {
    data: { items: [], prefsIncomplete: false },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: recommendedRequestsRefetch,
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

vi.mock("@/components/dashboard/stripe-onboarding-banner", () => ({
  StripeOnboardingBanner: () => <div>Stripe banner</div>,
}));

vi.mock("@/components/dashboard/onboarding-checklist", () => ({
  OnboardingChecklist: ({ variant }: { variant: string }) => (
    <div>Checklist:{variant}</div>
  ),
}));

vi.mock("@/components/pro-badge", () => ({
  ProBadge: () => <span>PRO</span>,
}));

vi.mock("@/components/analytics/area-chart", () => ({
  AreaChart: () => <div>Area chart</div>,
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    listing: {
      getSellerStats: { useQuery: () => sellerQueries.listingStats },
    },
    order: {
      getSellerOrderStats: { useQuery: () => sellerQueries.orderStats },
    },
    analytics: {
      overview: { useQuery: () => sellerQueries.analytics },
    },
    matching: {
      recommendedRequests: {
        useQuery: () => sellerQueries.recommendedRequests,
      },
    },
  },
}));

describe("SellerDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sellerQueries = {
      listingStats: {
        data: [
          { status: "active", count: 1, totalViews: 12 },
          { status: "draft", count: 2, totalViews: 0 },
        ],
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: listingStatsRefetch,
      },
      orderStats: {
        data: [{ status: "pending", count: 3, totalRevenue: 4500 }],
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: orderStatsRefetch,
      },
      analytics: {
        data: {
          kpis: { revenue: 4500, prevRevenue: 3000, orders: 3, prevOrders: 2 },
          timeSeries: [{ date: "2026-08-01", revenue: 4500 }],
        },
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: analyticsRefetch,
      },
      recommendedRequests: {
        data: { items: [], prefsIncomplete: false },
        isLoading: false,
        isError: false,
        isFetching: false,
        refetch: recommendedRequestsRefetch,
      },
    };
  });

  it("renders a truthful empty listing summary when seller stats are empty", () => {
    sellerQueries.listingStats = {
      data: [],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: listingStatsRefetch,
    };
    sellerQueries.orderStats = {
      data: [],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: orderStatsRefetch,
    };
    sellerQueries.analytics = {
      data: {
        kpis: { revenue: 0, prevRevenue: 0, orders: 0, prevOrders: 0 },
        timeSeries: [],
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: analyticsRefetch,
    };

    render(<SellerDashboardPage />);

    expect(
      screen.getByRole("status", { name: "No listings yet" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Create listing" })).toHaveLength(
      2,
    );
  });

  it("keeps primary stats visible when analytics are unavailable", () => {
    sellerQueries.analytics = {
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch: analyticsRefetch,
    };

    render(<SellerDashboardPage />);

    expect(screen.getByText("Active Listings:1")).toBeInTheDocument();
    expect(
      screen.getByRole("alert", { name: "We couldn't load analytics" }),
    ).toBeInTheDocument();
  });
});
