import { render, screen } from "@testing-library/react";
import { OfferCard } from "../offer-card";
import type { OfferListItem } from "@/lib/types/offer";

const mockOffer = {
  id: "offer-1",
  listingId: "listing-1",
  buyerId: "buyer-1",
  sellerId: "seller-1",
  status: "pending" as const,
  currentRound: 1,
  offerPricePerSqFt: 5.5,
  counterPricePerSqFt: null,
  quantitySqFt: 1000,
  totalPrice: 5500,
  lastActorId: "buyer-1",
  message: null,
  counterMessage: null,
  orderId: null,
  expiresAt: null,
  createdAt: new Date("2024-01-15T09:00:00Z"),
  updatedAt: new Date("2024-01-15T10:00:00Z"),
  listing: {
    id: "listing-1",
    title: "Oak Hardwood Flooring",
    status: "active" as const,
    askPricePerSqFt: 6,
  },
  buyer: {
    id: "buyer-1",
    name: "Buyer Company",
    role: "buyer",
    businessCity: null,
    businessState: "TX",
    verificationStatus: "verified",
    verified: true,
    identityRevealed: false,
    displayName: "Verified Buyer in TX",
  },
  seller: {
    id: "seller-1",
    name: "Seller Company",
    role: "seller",
    businessCity: null,
    businessState: "FL",
    verificationStatus: "verified",
    verified: true,
    identityRevealed: false,
    displayName: "Verified Seller in FL",
  },
} satisfies OfferListItem;

describe("OfferCard", () => {
  it("renders offer details correctly", () => {
    render(
      <OfferCard
        offer={mockOffer}
        currentUserId="seller-1"
        userRole="seller"
      />
    );

    expect(screen.getByText("Oak Hardwood Flooring")).toBeInTheDocument();
    expect(screen.getByText(/Verified Buyer in TX/)).toBeInTheDocument();
    expect(screen.getByText(/\$5\.50\/sq ft/)).toBeInTheDocument();
    expect(screen.getByText(/1,000 sq ft/)).toBeInTheDocument();
  });

  it("shows 'Your Turn' badge when it's user's turn", () => {
    render(
      <OfferCard
        offer={mockOffer}
        currentUserId="seller-1"
        userRole="seller"
      />
    );

    expect(screen.getByText("Your Turn")).toBeInTheDocument();
  });

  it("does not show 'Your Turn' badge when it's not user's turn", () => {
    render(
      <OfferCard
        offer={mockOffer}
        currentUserId="buyer-1"
        userRole="buyer"
      />
    );

    expect(screen.queryByText("Your Turn")).not.toBeInTheDocument();
  });

  it("displays counter price when available", () => {
    const offerWithCounter = {
      ...mockOffer,
      counterPricePerSqFt: 6.0,
    };

    render(
      <OfferCard
        offer={offerWithCounter}
        currentUserId="seller-1"
        userRole="seller"
      />
    );

    expect(screen.getByText(/\$6\.00\/sq ft/)).toBeInTheDocument();
  });

  it("shows the server-approved buyer display name to the seller", () => {
    render(
      <OfferCard
        offer={mockOffer}
        currentUserId="seller-1"
        userRole="seller"
      />
    );

    expect(screen.getByText(/Buyer:.*Verified Buyer in TX/)).toBeInTheDocument();
  });

  it("shows the server-approved seller display name to the buyer", () => {
    render(
      <OfferCard
        offer={mockOffer}
        currentUserId="buyer-1"
        userRole="buyer"
      />
    );

    expect(screen.getByText(/Seller:.*Verified Seller in FL/)).toBeInTheDocument();
  });

  it("displays round number", () => {
    render(
      <OfferCard
        offer={mockOffer}
        currentUserId="seller-1"
        userRole="seller"
      />
    );

    expect(screen.getByText("Round 1")).toBeInTheDocument();
  });

  it("renders as a link to offer detail page", () => {
    const { container } = render(
      <OfferCard
        offer={mockOffer}
        currentUserId="seller-1"
        userRole="seller"
      />
    );

    const link = container.querySelector('a[href="/offers/offer-1"]');
    expect(link).toBeInTheDocument();
  });
});
