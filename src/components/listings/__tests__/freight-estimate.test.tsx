import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FreightEstimate } from "@/components/listings/freight-estimate";

describe("FreightEstimate", () => {
  it("does not present a made-up freight price range", () => {
    render(<FreightEstimate originZip="84101" weightLbs={1600} />);

    const button = screen.getByRole("button", { name: "Review quote steps" });
    expect(button).toBeDisabled();
    expect(screen.queryByText("Estimated Freight Cost")).not.toBeInTheDocument();
    expect(screen.queryByText("Calculate Estimate")).not.toBeInTheDocument();
  });

  it("routes the user toward checkout-backed Priority1 quotes", () => {
    render(<FreightEstimate originZip="84101" weightLbs={1600} />);

    fireEvent.change(screen.getByLabelText("Destination ZIP Code"), {
      target: { value: "97201" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review quote steps" }));

    expect(
      screen.getByText("Exact freight quote available at checkout"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Use ZIP 97201 during authenticated checkout/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This page does not invent a freight rate\./i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Estimated Freight Cost")).not.toBeInTheDocument();
  });
});
