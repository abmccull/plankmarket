import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ListingStatusBadge,
  OrderStatusBadge,
} from "@/components/dashboard/status-badge";

describe("dashboard status badges", () => {
  it("exposes listing status without relying on color or iconography", () => {
    render(<ListingStatusBadge status="active" />);

    expect(screen.getByLabelText("Active listing status")).toHaveTextContent(
      "Active",
    );
  });

  it("labels in-progress order status and shows motion only as decoration", () => {
    render(<OrderStatusBadge status="processing" />);

    const badge = screen.getByLabelText("Processing order status");
    expect(badge).toHaveTextContent("Processing");
    expect(badge.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(badge.querySelector("svg")).toHaveClass("animate-spin");
  });
});
