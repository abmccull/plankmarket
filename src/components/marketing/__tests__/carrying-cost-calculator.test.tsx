import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CarryingCostCalculator } from "../carrying-cost-calculator";

describe("CarryingCostCalculator accessibility", () => {
  it("gives the slider and inventory selector persistent accessible names", () => {
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
      screen.getByRole("combobox", { name: "Inventory type" }),
    ).toBeInTheDocument();
  });
});
