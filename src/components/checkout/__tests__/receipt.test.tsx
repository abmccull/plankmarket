import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Receipt from "@/app/(marketplace)/listings/[id]/checkout/success/page";

const mocks = vi.hoisted(() => ({ query: vi.fn(), celebrate: vi.fn(), params: new URLSearchParams("orderId=11111111-1111-4111-8111-111111111111") }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
vi.mock("@/lib/utils/celebrate", () => ({ celebrateMilestone: mocks.celebrate }));
vi.mock("@/lib/trpc/client", () => ({ trpc: { order: { getById: { useQuery: mocks.query } } } }));
const order = { id: "11111111-1111-4111-8111-111111111111", orderNumber: "PM-TEST", createdAt: new Date(), status: "pending", paymentStatus: "pending", subtotal: 100, buyerFee: 5, buyerFreightCharge: 10, taxAmount: 2, totalPrice: 117 };

describe("checkout receipt rendering", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.query.mockReturnValue({data: order, isLoading: false, refetch: vi.fn()});
  });
  it("loads from durable orderId without Stripe URL secrets and never confirms pending payment", () => {
    render(<Receipt />);
    expect(screen.getByRole("heading", {name: "Awaiting payment confirmation"})).toBeInTheDocument();
    expect(screen.queryByText("Total paid")).not.toBeInTheDocument();
    expect(mocks.celebrate).not.toHaveBeenCalled();
    expect(mocks.query.mock.calls[0][1].enabled).toBe(true);
  });
  it("celebrates only an authoritative succeeded payment, once across refresh", () => {
    mocks.query.mockReturnValue({data: {...order, status: "confirmed", paymentStatus: "succeeded"}, isLoading: false});
    const first = render(<Receipt />);
    expect(screen.getByText("Total paid")).toBeInTheDocument();
    first.unmount();
    render(<Receipt />);
    expect(mocks.celebrate).toHaveBeenCalledTimes(1);
  });
  it("shows a retry instead of success when the order cannot be loaded", () => {
    mocks.query.mockReturnValue({isError: true, isLoading: false, refetch: vi.fn()});
    render(<Receipt />);
    expect(screen.getByRole("button", {name: "Check status again"})).toBeInTheDocument();
    expect(screen.queryByText("Total paid")).not.toBeInTheDocument();
    expect(mocks.celebrate).not.toHaveBeenCalled();
  });
});
