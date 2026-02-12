import { render, screen } from "@testing-library/react";
import { OfferStatusBadge } from "../offer-status-badge";

describe("OfferStatusBadge", () => {
  it("renders pending status with correct styling", () => {
    render(<OfferStatusBadge status="pending" />);
    const badge = screen.getByText("Pending");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("border-yellow-500");
  });

  it("renders countered status", () => {
    render(<OfferStatusBadge status="countered" />);
    expect(screen.getByText("Countered")).toBeInTheDocument();
  });

  it("renders accepted status with correct styling", () => {
    render(<OfferStatusBadge status="accepted" />);
    const badge = screen.getByText("Accepted");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("border-green-500");
  });

  it("renders rejected status", () => {
    render(<OfferStatusBadge status="rejected" />);
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("renders withdrawn status", () => {
    render(<OfferStatusBadge status="withdrawn" />);
    expect(screen.getByText("Withdrawn")).toBeInTheDocument();
  });

  it("renders expired status", () => {
    render(<OfferStatusBadge status="expired" />);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <OfferStatusBadge status="pending" className="custom-class" />
    );
    const badge = container.querySelector(".custom-class");
    expect(badge).toBeInTheDocument();
  });
});
