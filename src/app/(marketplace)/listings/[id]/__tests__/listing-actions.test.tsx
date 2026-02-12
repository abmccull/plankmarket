import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ListingDetailPage from "../page";
import { trpc } from "@/lib/trpc/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";

// Mock dependencies
jest.mock("@/lib/trpc/client");
jest.mock("@/lib/stores/auth-store");
jest.mock("next/navigation");
jest.mock("sonner");

describe("ListingDetailPage - Contact Seller & Make Offer Actions", () => {
  const mockRouter = {
    push: jest.fn(),
  };

  const mockParams = {
    id: "test-listing-id",
  };

  const mockListing = {
    id: "test-listing-id",
    title: "Premium Oak Hardwood",
    description: "High-quality oak flooring",
    materialType: "hardwood",
    condition: "new_overstock",
    species: "Oak",
    askPricePerSqFt: 5.0,
    totalSqFt: 1000,
    moq: 500,
    allowOffers: true,
    buyNowPrice: 5000,
    locationCity: "Chicago",
    locationState: "IL",
    sellerId: "seller-123",
    viewsCount: 100,
    watchlistCount: 10,
    createdAt: new Date().toISOString(),
    media: [
      {
        id: "media-1",
        url: "https://example.com/image.jpg",
        altText: "Oak flooring",
      },
    ],
    seller: {
      id: "seller-123",
      name: "John Doe",
      businessName: "Oak Flooring Co",
      verified: true,
      stripeOnboardingComplete: true,
      createdAt: new Date().toISOString(),
    },
  };

  const mockGetOrCreateConversationMutate = jest.fn();
  const mockCreateOfferMutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useParams as jest.Mock).mockReturnValue(mockParams);

    // Mock tRPC
    (trpc.listing.getById.useQuery as jest.Mock).mockReturnValue({
      data: mockListing,
      isLoading: false,
    });

    (trpc.watchlist.isWatchlisted.useQuery as jest.Mock).mockReturnValue({
      data: { isWatchlisted: false },
    });

    (trpc.watchlist.add.useMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
    });

    (trpc.watchlist.remove.useMutation as jest.Mock).mockReturnValue({
      mutateAsync: jest.fn(),
    });

    (trpc.message.getOrCreateConversation.useMutation as jest.Mock).mockReturnValue(
      {
        mutateAsync: mockGetOrCreateConversationMutate,
      }
    );

    (trpc.offer.createOffer.useMutation as jest.Mock).mockReturnValue({
      mutateAsync: mockCreateOfferMutate,
    });

    (trpc.useUtils as jest.Mock).mockReturnValue({
      watchlist: {
        isWatchlisted: {
          invalidate: jest.fn(),
        },
      },
    });
  });

  describe("Authenticated Buyer", () => {
    beforeEach(() => {
      (useAuthStore as unknown as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        user: {
          id: "buyer-456",
          email: "buyer@example.com",
          name: "Jane Smith",
          role: "buyer",
        },
      });
    });

    it("renders Contact Seller button for authenticated buyers", () => {
      render(<ListingDetailPage />);

      const contactButton = screen.getByRole("button", {
        name: /Contact Seller/i,
      });
      expect(contactButton).toBeInTheDocument();
    });

    it("renders Make Offer button when offers are allowed", () => {
      render(<ListingDetailPage />);

      const makeOfferButton = screen.getByRole("button", {
        name: /Make Offer/i,
      });
      expect(makeOfferButton).toBeInTheDocument();
    });

    it("contacts seller successfully", async () => {
      const user = userEvent.setup();
      const mockConversationId = "conversation-789";

      mockGetOrCreateConversationMutate.mockResolvedValue({
        id: mockConversationId,
      });

      render(<ListingDetailPage />);

      const contactButton = screen.getByRole("button", {
        name: /Contact Seller/i,
      });

      await user.click(contactButton);

      await waitFor(() => {
        expect(mockGetOrCreateConversationMutate).toHaveBeenCalledWith({
          listingId: "test-listing-id",
        });
      });

      expect(toast.success).toHaveBeenCalledWith(
        "Opening conversation with seller"
      );
      expect(mockRouter.push).toHaveBeenCalledWith(
        `/messages/${mockConversationId}`
      );
    });

    it("shows loading state while contacting seller", async () => {
      const user = userEvent.setup();

      mockGetOrCreateConversationMutate.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<ListingDetailPage />);

      const contactButton = screen.getByRole("button", {
        name: /Contact Seller/i,
      });

      await user.click(contactButton);

      // Should show loading state
      expect(
        screen.getByRole("button", { name: /Connecting\.\.\./i })
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Connecting\.\.\./i })).toBeDisabled();
    });

    it("handles contact seller error gracefully", async () => {
      const user = userEvent.setup();
      const errorMessage = "Failed to create conversation";

      mockGetOrCreateConversationMutate.mockRejectedValue(
        new Error(errorMessage)
      );

      render(<ListingDetailPage />);

      const contactButton = screen.getByRole("button", {
        name: /Contact Seller/i,
      });

      await user.click(contactButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(errorMessage);
      });

      expect(mockRouter.push).not.toHaveBeenCalled();
    });

    it("opens Make Offer modal when Make Offer button is clicked", async () => {
      const user = userEvent.setup();

      render(<ListingDetailPage />);

      const makeOfferButton = screen.getByRole("button", {
        name: /Make Offer/i,
      });

      await user.click(makeOfferButton);

      // Modal should open
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByText("Make an Offer")).toBeInTheDocument();
      });
    });

    it("does not show Make Offer button when offers are not allowed", () => {
      (trpc.listing.getById.useQuery as jest.Mock).mockReturnValue({
        data: { ...mockListing, allowOffers: false },
        isLoading: false,
      });

      render(<ListingDetailPage />);

      const makeOfferButton = screen.queryByRole("button", {
        name: /Make Offer/i,
      });
      expect(makeOfferButton).not.toBeInTheDocument();

      // Contact Seller should still be visible
      expect(
        screen.getByRole("button", { name: /Contact Seller/i })
      ).toBeInTheDocument();
    });
  });

  describe("Unauthenticated User", () => {
    beforeEach(() => {
      (useAuthStore as unknown as jest.Mock).mockReturnValue({
        isAuthenticated: false,
        user: null,
      });
    });

    it("redirects to login when unauthenticated user clicks Contact Seller", async () => {
      const user = userEvent.setup();

      render(<ListingDetailPage />);

      const contactButton = screen.getByRole("button", {
        name: /Contact Seller/i,
      });

      await user.click(contactButton);

      expect(mockRouter.push).toHaveBeenCalledWith(
        "/login?redirect=/listings/test-listing-id"
      );
      expect(mockGetOrCreateConversationMutate).not.toHaveBeenCalled();
    });

    it("redirects to login when unauthenticated user clicks Make Offer", async () => {
      const user = userEvent.setup();

      render(<ListingDetailPage />);

      const makeOfferButton = screen.getByRole("button", {
        name: /Make Offer/i,
      });

      await user.click(makeOfferButton);

      expect(mockRouter.push).toHaveBeenCalledWith(
        "/login?redirect=/listings/test-listing-id"
      );

      // Modal should not open
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("Seller Viewing Own Listing", () => {
    beforeEach(() => {
      (useAuthStore as unknown as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        user: {
          id: "seller-123", // Same as listing.sellerId
          email: "seller@example.com",
          name: "John Doe",
          role: "seller",
        },
      });
    });

    it("shows Edit Listing button instead of action buttons", () => {
      render(<ListingDetailPage />);

      // Should show Edit Listing
      const editButton = screen.getByRole("link", { name: /Edit Listing/i });
      expect(editButton).toBeInTheDocument();
      expect(editButton).toHaveAttribute(
        "href",
        "/seller/listings/test-listing-id/edit"
      );

      // Should NOT show buyer action buttons
      expect(
        screen.queryByRole("button", { name: /Contact Seller/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Make Offer/i })
      ).not.toBeInTheDocument();
    });

    it("shows View as Buyer button (disabled)", () => {
      render(<ListingDetailPage />);

      const viewAsButton = screen.getByRole("button", {
        name: /View as Buyer/i,
      });
      expect(viewAsButton).toBeInTheDocument();
      expect(viewAsButton).toBeDisabled();
    });
  });

  describe("Button Layout", () => {
    beforeEach(() => {
      (useAuthStore as unknown as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        user: {
          id: "buyer-456",
          email: "buyer@example.com",
          name: "Jane Smith",
          role: "buyer",
        },
      });
    });

    it("renders Buy Now as primary action", () => {
      render(<ListingDetailPage />);

      const buyNowButton = screen.getByRole("link", {
        name: /Buy Now/i,
      });
      expect(buyNowButton).toBeInTheDocument();
      expect(buyNowButton).toHaveAttribute(
        "href",
        "/listings/test-listing-id/checkout"
      );
    });

    it("renders Make Offer and Contact Seller as secondary actions in grid", () => {
      render(<ListingDetailPage />);

      const makeOfferButton = screen.getByRole("button", {
        name: /Make Offer/i,
      });
      const contactButton = screen.getByRole("button", {
        name: /Contact Seller/i,
      });

      // Both should be in the same container (grid layout)
      const container = makeOfferButton.closest("div");
      expect(container).toContainElement(contactButton);
    });

    it("has proper icon and text for Contact Seller button", () => {
      render(<ListingDetailPage />);

      const contactButton = screen.getByRole("button", {
        name: /Contact Seller/i,
      });

      // Check for MessageSquare icon (aria-hidden)
      const icon = contactButton.querySelector('svg');
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });

    it("has proper icon and text for Make Offer button", () => {
      render(<ListingDetailPage />);

      const makeOfferButton = screen.getByRole("button", {
        name: /Make Offer/i,
      });

      // Check for HandCoins icon (aria-hidden)
      const icon = makeOfferButton.querySelector('svg');
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("Accessibility", () => {
    beforeEach(() => {
      (useAuthStore as unknown as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        user: {
          id: "buyer-456",
          email: "buyer@example.com",
          name: "Jane Smith",
          role: "buyer",
        },
      });
    });

    it("has proper ARIA labels for action buttons", () => {
      render(<ListingDetailPage />);

      const makeOfferButton = screen.getByRole("button", {
        name: /Make an offer on this listing/i,
      });
      expect(makeOfferButton).toHaveAttribute(
        "aria-label",
        "Make an offer on this listing"
      );

      const contactButton = screen.getByRole("button", {
        name: /Contact the seller/i,
      });
      expect(contactButton).toHaveAttribute(
        "aria-label",
        "Contact the seller"
      );
    });

    it("marks icons as decorative with aria-hidden", () => {
      render(<ListingDetailPage />);

      const contactButton = screen.getByRole("button", {
        name: /Contact the seller/i,
      });
      const contactIcon = contactButton.querySelector('svg');
      expect(contactIcon).toHaveAttribute("aria-hidden", "true");

      const makeOfferButton = screen.getByRole("button", {
        name: /Make an offer on this listing/i,
      });
      const offerIcon = makeOfferButton.querySelector('svg');
      expect(offerIcon).toHaveAttribute("aria-hidden", "true");
    });
  });
});
