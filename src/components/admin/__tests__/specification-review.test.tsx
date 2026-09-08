import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const mutate = vi.fn();
vi.mock("@/lib/trpc/client", () => ({ trpc: { listing: {
  getSpecificationReview: { useQuery: () => ({ data: { id: "listing", title: "Test product", updatedAt: new Date("2026-09-08"), specificationProvenance: "seller_declared", waterResistance: "waterproof", media: [{ id: "image", fileName: "manufacturer-label.jpg", url: "https://example.com/attached.jpg" }] } }) },
  reviewSpecifications: { useMutation: () => ({ mutate, isPending: false }) }
} } }));
import { SpecificationReview } from "../specification-review";
describe("admin specification review", () => {
  it("requires attached evidence, notes and explicit reviewer confirmation", () => {
    render(<SpecificationReview listingId="listing" onComplete={() => {}} />);
    const button = screen.getByRole("button", { name: "Mark specifications evidence-reviewed" });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Attached manufacturer evidence"), { target: { value: "image" } });
    expect(screen.getByRole("link", { name: /Open attached evidence/ })).toHaveAttribute("href", "https://example.com/attached.jpg");
    fireEvent.change(screen.getByLabelText("Review notes"), { target: { value: "Manufacturer label confirms each declared specification." } });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ listingId: "listing", evidenceMediaId: "image" }));
  });
});
