import { render, screen } from "@testing-library/react";
import { OfferCard } from "../offer-card";

const mockOffer = {
  id: "offer-1",
  status: "pending" as const,
  currentRound: 1,
  offerPricePerSqFt: 5.5,
  counterPricePerSqFt: null,
  quantitySqFt: 1000,
  totalPrice: 5500,
  lastActorId: "buyer-1",
  updatedAt: new Date("2024-01-15T10:00:00Z"),
  listing: {
    id: "listing-1",
    title: "Oak Hardwood Flooring",
  },
  buyer: {
    id: "buyer-1",
    name: "John Doe",
    businessName: "Doe Flooring Inc",
  },
  seller: {
    id: "seller-1",
    name: "Jane Smith",
    businessName: "Smith Supply Co",
  },
};

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
    expect(screen.getByText(/Doe Flooring Inc/)).toBeInTheDocument();
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

  it("shows buyer name to seller", () => {
    render(
      <OfferCard
        offer={mockOffer}
        currentUserId="seller-1"
        userRole="seller"
      />
    );

    expect(screen.getByText(/Buyer: Doe Flooring Inc/)).toBeInTheDocument();
  });

  it("shows seller name to buyer", () => {
    render(
      <OfferCard
        offer={mockOffer}
        currentUserId="buyer-1"
        userRole="buyer"
      />
    );

    expect(screen.getByText(/Seller: Smith Supply Co/)).toBeInTheDocument();
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
