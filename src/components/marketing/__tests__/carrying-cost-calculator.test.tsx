import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CarryingCostCalculator } from "../carrying-cost-calculator";

describe("CarryingCostCalculator accessibility", () => {
  it("gives the holding slider and cost assumptions persistent accessible names", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    render(<CarryingCostCalculator />);

    expect(
      screen.getByRole("slider", { name: "Months holding" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Monthly storage allocation ($)"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Annual capital or opportunity cost (%)"),
    ).toBeInTheDocument();
  });
});
