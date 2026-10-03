import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListingCard } from "@/components/search/listing-card";
import { ListingTableView } from "@/components/search/listing-table-view";
import { SponsoredCarousel } from "@/components/promotions/sponsored-carousel";
import { PremiumHeroBanner } from "@/components/promotions/hero-banner";

vi.mock("@/components/listings/listing-image", () => ({ ListingImage: () => null }));
const premiumQuery = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock("@/lib/trpc/client", () => ({ trpc: { promotion: { getPremiumHero: { useQuery: () => premiumQuery } } } }));
afterEach(cleanup);

const listing = {
  id: "payment-proof-lot", slug: "payment-proof-lot", title: "Payment proof oak",
  materialType: "engineered", species: "Oak", condition: "new_overstock",
  totalSqFt: 1200, askPricePerSqFt: 2, buyNowPrice: 2, moq: 100, moqUnit: "sqft" as const,
  locationCity: null, locationState: "CO", viewsCount: 0, watchlistCount: 0,
  createdAt: "2026-10-02T00:00:00Z", freightEstimateStatus: "quote_request_ready" as const,
  freshnessStatus: "fresh" as const, media: [],
  purchaseTerms: { fullLotOnly: false, partialQuantityMarkupPercent: 0, sqFtPerBox: 20, boxesPerPallet: 30 },
  seller: { displayName: "Verified seller", verified: true, role: "seller", stripeOnboardingComplete: true },
};
const intent = { quantitySqFt: 501, zip: "80202" };

describe.each(["grid", "table", "sponsored", "premium"] as const)("%s purchase setup", (surface) => {
  function show(paymentSetupStatus?: "connected" | "incomplete") {
    const item = { ...listing, seller: { ...listing.seller, paymentSetupStatus } };
    if (surface === "grid") render(<ListingCard listing={item} purchaseIntent={intent} />);
    if (surface === "table") render(<ListingTableView items={[item]} purchaseIntent={intent} />);
    if (surface === "sponsored") render(<SponsoredCarousel listings={[item]} purchaseIntent={intent} />);
    if (surface === "premium") { premiumQuery.data = [item]; render(<PremiumHeroBanner purchaseIntent={intent} />); }
  }
  it("shows recorded connection without claiming checkout success", () => {
    show("connected");
    expect(screen.getByText("Seller payments connected")).toBeInTheDocument();
    expect(screen.queryByText(/ready to buy|guaranteed|checkout ready/i)).not.toBeInTheDocument();
  });
  it("exposes inquiry-only setup even for a verified, freight-ready lot", () => {
    show("incomplete");
    expect(screen.getByText("Inquiries only")).toBeInTheDocument();
    expect(screen.getByText("Seller payment setup needs attention.")).toBeInTheDocument();
    expect(screen.queryByText("Seller payments connected")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", expect.stringContaining("jobSqFt=501"));
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", expect.stringContaining("jobZip=80202"));
  });
  it("does not infer connected from an old payload's true completion flag", () => {
    show();
    expect(screen.getByText("Payment setup unconfirmed")).toBeInTheDocument();
    expect(screen.queryByText("Seller payments connected")).not.toBeInTheDocument();
    expect(screen.queryByText("Inquiries only")).not.toBeInTheDocument();
  });
});
