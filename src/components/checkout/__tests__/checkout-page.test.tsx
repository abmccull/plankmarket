import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import CheckoutPage from "@/app/(marketplace)/listings/[id]/checkout/page";
import { trpc } from "@/lib/trpc/client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { calculateOrderFees } from "@/lib/fees";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    listing: { getById: { useQuery: vi.fn() } },
    offer: { getOfferById: { useQuery: vi.fn() } },
    shippingAddress: { list: { useQuery: vi.fn() } },
    order: {
      create: { useMutation: vi.fn() },
      createFromOffer: { useMutation: vi.fn() },
    },
    payment: { createPaymentIntent: { useMutation: vi.fn() } },
  },
}));

vi.mock("next/navigation", () => ({
  useParams: vi.fn(),
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/checkout/stripe-provider", () => ({
  StripeProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/checkout/stripe-payment-form", () => ({
  StripePaymentForm: () => <div data-testid="stripe-payment-form" />,
}));

vi.mock("@/components/checkout/shipping-quote-selector", () => ({
  __esModule: true,
  default: () => <div data-testid="shipping-quote-selector" />,
}));

vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

vi.mock("@/lib/identity/display-name", () => ({
  getAnonymousDisplayName: vi.fn(() => "Seller"),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockListing = {
  id: "listing-123",
  title: "Premium Oak Flooring",
  askPricePerSqFt: 3.5,
  buyNowPrice: 3.5,
  totalSqFt: 2000,
  moq: 500,
  moqUnit: "sqft",
  sqFtPerBox: null,
  boxesPerPallet: null,
  materialType: "hardwood",
  condition: "new_overstock",
  sellerId: "seller-456",
  media: [{ id: "m1", url: "https://example.com/img.jpg", altText: "Oak" }],
  seller: {
    id: "seller-456",
    name: "Oak Co",
    verified: true,
    stripeOnboardingComplete: true,
    createdAt: "2025-01-01",
    role: "seller",
    businessState: null,
    businessCity: null,
  },
};

const mockRouter = {
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  forward: vi.fn(),
};

const mockMutationReturn = {
  mutateAsync: vi.fn(),
  isPending: false,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupDefaultMocks(overrides?: {
  listing?: typeof mockListing | null;
  isLoading?: boolean;
  searchParamsGet?: (key: string) => string | null;
}) {
  vi.mocked(useParams).mockReturnValue({ id: "listing-123" });
  vi.mocked(useRouter).mockReturnValue(
    mockRouter as unknown as ReturnType<typeof useRouter>,
  );
  vi.mocked(useSearchParams).mockReturnValue({
    get: overrides?.searchParamsGet ?? vi.fn(() => null),
  } as unknown as ReturnType<typeof useSearchParams>);

  vi.mocked(trpc.listing.getById.useQuery).mockReturnValue({
    data: overrides?.listing !== undefined ? overrides.listing : mockListing,
    isLoading: overrides?.isLoading ?? false,
  } as unknown as ReturnType<typeof trpc.listing.getById.useQuery>);

  vi.mocked(trpc.offer.getOfferById.useQuery).mockReturnValue({
    data: undefined,
    isLoading: false,
  } as unknown as ReturnType<typeof trpc.offer.getOfferById.useQuery>);

  vi.mocked(trpc.shippingAddress.list.useQuery).mockReturnValue({
    data: undefined,
  } as unknown as ReturnType<typeof trpc.shippingAddress.list.useQuery>);

  vi.mocked(trpc.order.create.useMutation).mockReturnValue(
    mockMutationReturn as unknown as ReturnType<
      typeof trpc.order.create.useMutation
    >,
  );
  vi.mocked(trpc.order.createFromOffer.useMutation).mockReturnValue(
    mockMutationReturn as unknown as ReturnType<
      typeof trpc.order.createFromOffer.useMutation
    >,
  );
  vi.mocked(trpc.payment.createPaymentIntent.useMutation).mockReturnValue(
    mockMutationReturn as unknown as ReturnType<
      typeof trpc.payment.createPaymentIntent.useMutation
    >,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CheckoutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("shows loading spinner while fetching listing", () => {
    setupDefaultMocks({ listing: undefined, isLoading: true });

    render(<CheckoutPage />);

    // The Loader2 icon renders an SVG with the animate-spin class
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
    // Should not show checkout heading while loading
    expect(screen.queryByText("Checkout")).not.toBeInTheDocument();
  });

  it("shows 'Listing Not Found' when listing is null", () => {
    setupDefaultMocks({ listing: null, isLoading: false });

    render(<CheckoutPage />);

    expect(screen.getByText("Listing Not Found")).toBeInTheDocument();
    expect(screen.queryByText("Checkout")).not.toBeInTheDocument();
  });

  it("renders checkout heading when listing loads", () => {
    render(<CheckoutPage />);

    expect(
      screen.getByRole("heading", { name: "Checkout", level: 1 }),
    ).toBeInTheDocument();
  });

  it("renders listing title in order summary", () => {
    render(<CheckoutPage />);

    expect(screen.getByText("Premium Oak Flooring")).toBeInTheDocument();
    expect(screen.getByText("Order Summary")).toBeInTheDocument();
  });

  it("shows shipping address form fields in address step", () => {
    render(<CheckoutPage />);

    expect(
      screen.getByLabelText(/Full Name \/ Business/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Street Address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/City/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/State/i)).toBeInTheDocument();
    expect(screen.getByLabelText("ZIP")).toBeInTheDocument();
    expect(screen.getByLabelText(/Phone/i)).toBeInTheDocument();
  });

  it("shows quantity input field", () => {
    render(<CheckoutPage />);

    const quantityInput = screen.getByLabelText(/Quantity \(sq ft\)/i);
    expect(quantityInput).toBeInTheDocument();
    expect(quantityInput).toHaveAttribute("type", "number");
  });

  it("displays price breakdown with subtotal and buyer fee", () => {
    render(<CheckoutPage />);

    // With default listing: 2000 sqft x $3.50 = $7,000 subtotal
    const subtotal = Math.round(2000 * 3.5 * 100) / 100;
    const fees = calculateOrderFees(subtotal, 0);

    // Subtotal line contains the quantity, price, and subtotal amount
    expect(
      screen.getByText(/2,000 sq ft\s+x\s+\$3\.50\/sq ft/),
    ).toBeInTheDocument();

    // Buyer fee label
    expect(
      screen.getByText(/Buyer fee \(3% on inventory \+ shipping\)/i),
    ).toBeInTheDocument();

    // Buyer fee amount ($210.00)
    expect(screen.getByText(`$${fees.buyerFee.toFixed(2)}`)).toBeInTheDocument();

    // Total
    expect(
      screen.getByText(`$${fees.totalCharge.toLocaleString("en-US", { minimumFractionDigits: 2 })}`),
    ).toBeInTheDocument();
  });

  it("shows 'Continue to Shipping' button", () => {
    render(<CheckoutPage />);

    const continueButton = screen.getByRole("button", {
      name: /Continue to Shipping/i,
    });
    expect(continueButton).toBeInTheDocument();
  });

  it("address validation: empty required field prevents advancing", async () => {
    const user = userEvent.setup();

    render(<CheckoutPage />);

    // All address fields start empty (no saved addresses), so clicking
    // "Continue to Shipping" without filling them should trigger validation
    // and keep the user on the address step.
    const continueButton = screen.getByRole("button", {
      name: /Continue to Shipping/i,
    });

    await user.click(continueButton);

    // Should stay on address step -- the shipping quote selector should NOT appear
    await waitFor(() => {
      expect(
        screen.queryByTestId("shipping-quote-selector"),
      ).not.toBeInTheDocument();
    });

    // Validation error messages should be visible
    await waitFor(() => {
      expect(
        screen.getByText(/Shipping name is required/i),
      ).toBeInTheDocument();
    });
  });

  it("shows 'Accepted Offer' banner when offerId present", () => {
    const mockOffer = {
      id: "offer-789",
      status: "accepted",
      offerPricePerSqFt: 3.0,
      counterPricePerSqFt: null,
      quantitySqFt: 1000,
      expiresAt: null,
    };

    const searchParamsGet = vi.fn((key: string) =>
      key === "offerId" ? "offer-789" : null,
    );

    setupDefaultMocks({ searchParamsGet });

    vi.mocked(trpc.offer.getOfferById.useQuery).mockReturnValue({
      data: mockOffer,
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.offer.getOfferById.useQuery>);

    render(<CheckoutPage />);

    expect(
      screen.getByText("Completing checkout for accepted offer"),
    ).toBeInTheDocument();
    expect(screen.getByText("Accepted Offer")).toBeInTheDocument();
  });

  it("redirects when seller has no Stripe setup", () => {
    const listingWithoutStripe = {
      ...mockListing,
      seller: {
        ...mockListing.seller,
        stripeOnboardingComplete: false,
      },
    };

    setupDefaultMocks({ listing: listingWithoutStripe });

    render(<CheckoutPage />);

    expect(toast.error).toHaveBeenCalledWith(
      "This seller hasn't set up payment processing yet.",
    );
    expect(mockRouter.push).toHaveBeenCalledWith("/listings/listing-123");
  });

  it("shows 'Back to listing' button", () => {
    render(<CheckoutPage />);

    const backButton = screen.getByRole("button", {
      name: /Back to listing/i,
    });
    expect(backButton).toBeInTheDocument();
  });
});
