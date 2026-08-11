import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ListingEvidence } from "@/components/listings/listing-evidence";

const listing = {
  totalSqFt: 12_500,
  moq: 2,
  moqUnit: "pallets" as const,
  condition: "new_overstock",
  locationCity: "Denver",
  locationState: "CO",
  freightEstimateStatus: "quote_request_ready" as const,
  freshnessStatus: "fresh" as const,
  lastConfirmedAt: "2026-07-29T18:00:00.000Z",
  media: [{}, {}, {}],
  seller: { verified: true },
};

describe("ListingEvidence", () => {
  it("renders decision evidence from listing data", () => {
    render(<ListingEvidence listing={listing} />);

    expect(screen.getByText("Known now")).toBeInTheDocument();
    expect(screen.getByText("Calculated later")).toBeInTheDocument();
    expect(screen.getByText("12,500 sq ft")).toBeInTheDocument();
    expect(screen.getByText("2 pallets")).toBeInTheDocument();
    expect(screen.getByText("New overstock")).toBeInTheDocument();
    expect(screen.getByText("Denver, CO")).toBeInTheDocument();
    expect(screen.getByText("Verified business")).toBeInTheDocument();
    expect(screen.getAllByText("Confirmed Jul 29").length).toBeGreaterThan(0);
    expect(screen.getByText("3 listing photos")).toBeInTheDocument();
    expect(
      screen.getByText("Calculated after destination details are entered at checkout"),
    ).toBeInTheDocument();
  });

  it("shows missing evidence instead of making a positive claim", () => {
    render(
      <ListingEvidence
        listing={{
          ...listing,
          freightEstimateStatus: "seller_setup_required",
          freshnessStatus: "unconfirmed",
          lastConfirmedAt: null,
          media: [],
          seller: { verified: false },
        }}
      />,
    );

    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Warning").length).toBeGreaterThan(0);
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    expect(screen.getByText("Seller confirmation pending")).toBeInTheDocument();
    expect(screen.getAllByText("No listing photos").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Blocked until seller freight setup is complete"),
    ).toBeInTheDocument();
  });
});
