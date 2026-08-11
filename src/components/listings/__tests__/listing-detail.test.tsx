import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ListingDetailClient } from "../listing-detail-client";
import type { Mock } from "vitest";

// --- Mocks ---

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    listing: { getPurchaseConfig: { useQuery: vi.fn() } },
    review: { getUserReputation: { useQuery: vi.fn() } },
    watchlist: {
      isWatchlisted: { useQuery: vi.fn() },
      add: { useMutation: vi.fn() },
      remove: { useMutation: vi.fn() },
    },
    message: { getOrCreateConversation: { useMutation: vi.fn() } },
    useUtils: vi.fn(),
  },
}));

vi.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useParams: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/identity/display-name", () => ({
  getAnonymousDisplayName: vi.fn(() => "Verified Seller"),
  getAnonymousInitials: vi.fn(() => "VS"),
}));

vi.mock("@/components/checkout/seller-payment-not-ready-dialog", () => ({
  SellerPaymentNotReadyDialog: () => null,
}));

vi.mock("@/components/offers/make-offer-modal", () => ({
  MakeOfferModal: () => null,
}));

vi.mock("@/components/shared/star-rating", () => ({
  StarRating: () => <span data-testid="star-rating" />,
}));

// --- Imports after mocks ---

import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useRouter, useParams } from "next/navigation";

// --- Helpers ---

function createListing(
  overrides: Partial<Parameters<typeof ListingDetailClient>[0]["listing"]> = {}
) {
  return {
    id: "listing-123",
    title: "Test Hardwood Flooring",
    sellerId: "seller-456",
    materialType: "hardwood",
    condition: "new_overstock",
    species: "Oak",
    askPricePerSqFt: 2.5,
    totalSqFt: 1000,
    buyNowPrice: null as number | null,
    allowOffers: false,
    moq: 200,
    moqUnit: "sqft" as const,
    freightEstimateStatus: "quote_request_ready" as const,
    freshnessStatus: "fresh" as const,
    lastConfirmedAt: "2026-07-29T00:00:00.000Z",
    locationCity: "Portland",
    locationState: "OR",
    viewsCount: 42,
    watchlistCount: 7,
    createdAt: "2025-06-15T00:00:00.000Z",
    media: [{ url: "https://example.com/lot.jpg" }],
    seller: {
      id: "seller-456",
      displayName: "Verified Seller",
      verified: true,
      createdAt: "2024-01-01T00:00:00.000Z",
      stripeOnboardingComplete: true,
      role: "seller",
    },
    ...overrides,
  };
}

function setupMocks(
  authOverrides: {
    isAuthenticated?: boolean;
    user?: { id: string; role: string } | null;
  } = {}
) {
  const {
    isAuthenticated = true,
    user = { id: "buyer-123", role: "buyer" },
  } = authOverrides;

  (useAuthStore as unknown as Mock).mockReturnValue({ isAuthenticated, user });
  (useParams as Mock).mockReturnValue({ id: "listing-123" });
  (useRouter as Mock).mockReturnValue({ push: vi.fn() });

  const trpcMock = trpc as unknown as {
    listing: { getPurchaseConfig: { useQuery: Mock } };
    review: { getUserReputation: { useQuery: Mock } };
    watchlist: {
      isWatchlisted: { useQuery: Mock };
      add: { useMutation: Mock };
      remove: { useMutation: Mock };
    };
    message: { getOrCreateConversation: { useMutation: Mock } };
    useUtils: Mock;
  };

  trpcMock.listing.getPurchaseConfig.useQuery.mockReturnValue({
    data: {
      canSplitLots: true,
      partialQuantityMarkupPercent: null,
      allowSampleRequests: true,
      sellingTerritoryMode: "unrestricted",
      allowedDestinationStates: [],
    },
  });
  trpcMock.review.getUserReputation.useQuery.mockReturnValue({
    data: undefined,
  });
  trpcMock.watchlist.isWatchlisted.useQuery.mockReturnValue({
    data: undefined,
  });
  trpcMock.watchlist.add.useMutation.mockReturnValue({
    mutateAsync: vi.fn(),
  });
  trpcMock.watchlist.remove.useMutation.mockReturnValue({
    mutateAsync: vi.fn(),
  });
  trpcMock.message.getOrCreateConversation.useMutation.mockReturnValue({
    mutateAsync: vi.fn(),
  });
  trpcMock.useUtils.mockReturnValue({
    watchlist: { isWatchlisted: { invalidate: vi.fn() } },
  });
}

// --- Tests ---

describe("ListingDetailClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("renders listing price per sq ft and lot value", () => {
    const listing = createListing({
      askPricePerSqFt: 2.5,
      totalSqFt: 1000,
    });

    render(<ListingDetailClient listing={listing} />);

    // Price per sq ft: $2.50/sq ft
    expect(screen.getByText("$2.50/sq ft")).toBeInTheDocument();
    // Lot value: 2.5 * 1000 = $2,500.00
    expect(screen.getByText(/Direct purchase lot:/)).toHaveTextContent(
      "Direct purchase lot: $2,500.00"
    );
    expect(screen.getByText("Known now")).toBeInTheDocument();
    expect(screen.getByText("Calculated later")).toBeInTheDocument();
  });

  it("shows Buy Now button when buyNowPrice is set", () => {
    const listing = createListing({
      buyNowPrice: 3.0,
      allowOffers: false,
    });

    render(<ListingDetailClient listing={listing} />);

    expect(screen.getAllByRole("link", { name: /Buy Now/i })).toHaveLength(2);
    expect(screen.getByText(/Buy Now - \$3\.00\/sq ft/)).toBeInTheDocument();
    expect(screen.getByText("$3.00/sq ft")).toBeInTheDocument();
    expect(screen.getByText(/Direct purchase lot:/)).toHaveTextContent(
      "Direct purchase lot: $3,000.00",
    );
    expect(screen.getByText(/Seller ask for offers:/)).toHaveTextContent(
      "Seller ask for offers: $2.50/sq ft",
    );
  });

  it("shows Make Offer button when allowOffers is true", () => {
    const listing = createListing({
      allowOffers: true,
    });

    render(<ListingDetailClient listing={listing} />);

    expect(
      screen.getByRole("button", { name: /Make an offer on this listing/ })
    ).toBeInTheDocument();
    expect(screen.getByText("Make Offer")).toBeInTheDocument();
  });

  it("shows Request Sample when the listing allows it", () => {
    render(<ListingDetailClient listing={createListing()} />);

    expect(
      screen.getByRole("button", { name: /Request Sample/i }),
    ).toBeInTheDocument();
  });

  it("hides Make Offer button when allowOffers is false", () => {
    const listing = createListing({
      allowOffers: false,
    });

    render(<ListingDetailClient listing={listing} />);

    expect(
      screen.queryByRole("button", { name: /Make an offer on this listing/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Make Offer")).not.toBeInTheDocument();
  });

  it("shows Edit Listing and View as Buyer buttons for the listing owner", () => {
    setupMocks({
      isAuthenticated: true,
      user: { id: "seller-456", role: "seller" },
    });

    const listing = createListing({
      sellerId: "seller-456",
    });

    render(<ListingDetailClient listing={listing} />);

    expect(
      screen.getByRole("link", { name: "Edit Listing" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View as Buyer" })
    ).toBeInTheDocument();

    // Owner should NOT see Buy Now or Contact Seller
    expect(
      screen.queryByRole("link", { name: /Buy Now/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Contact the seller/ })
    ).not.toBeInTheDocument();
  });

  it("shows seller info section with verified badge", () => {
    const listing = createListing({
      seller: {
        id: "seller-456",
        displayName: "Verified Seller",
        verified: true,
        createdAt: "2024-01-01T00:00:00.000Z",
        stripeOnboardingComplete: true,
        role: "seller",
      },
    });

    render(<ListingDetailClient listing={listing} />);

    // Display name is shaped and approved by the server.
    expect(screen.getByText("Verified Seller")).toBeInTheDocument();
    // Initials are mocked to return "VS"
    expect(screen.getByText("VS")).toBeInTheDocument();
    // "New to Plank Market" is shown when no reputation data
    expect(screen.getByText("New to Plank Market")).toBeInTheDocument();
  });

  it("keeps the primary purchase action available in the mobile action bar", () => {
    const listing = createListing({
      buyNowPrice: 3.0,
      allowOffers: true,
    });

    render(<ListingDetailClient listing={listing} />);

    const actionBar = screen.getByTestId("mobile-listing-action-bar");
    expect(actionBar).toHaveClass("lg:hidden");
    expect(
      screen.getByRole("link", { name: "Buy now at $3.00/sq ft" }),
    ).toHaveAttribute("href", "/listings/listing-123/checkout");
  });

  it("renders blocked and warning evidence states from existing listing data", () => {
    render(
      <ListingDetailClient
        listing={createListing({
          freightEstimateStatus: "seller_setup_required",
          freshnessStatus: "overdue",
          lastConfirmedAt: "2026-06-01T00:00:00.000Z",
          media: [],
          seller: {
            id: "seller-456",
            displayName: "Verified Seller",
            verified: false,
            createdAt: "2024-01-01T00:00:00.000Z",
            stripeOnboardingComplete: true,
            role: "seller",
          },
        })}
      />,
    );

    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Inventory reconfirmation is overdue"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Freight quote setup is incomplete"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Seller verification is missing"),
    ).toBeInTheDocument();
  });

  it("shows location with city and state", () => {
    const listing = createListing({
      locationCity: "Portland",
      locationState: "OR",
    });

    render(<ListingDetailClient listing={listing} />);

    expect(screen.getByText("Portland, OR")).toBeInTheDocument();
  });

  it("shows watchlist toggle button with correct aria-label", () => {
    render(<ListingDetailClient listing={createListing()} />);

    const watchlistButton = screen.getByRole("button", {
      name: "Add to watchlist",
    });
    expect(watchlistButton).toBeInTheDocument();
    // When watchlistStatus is undefined, aria-pressed is not rendered
    expect(watchlistButton).not.toHaveAttribute("aria-pressed", "true");
  });
});
