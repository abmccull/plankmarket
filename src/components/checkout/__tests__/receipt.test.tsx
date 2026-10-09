import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { useAuthStore } from "@/lib/stores/auth-store";
import Receipt from "@/app/(marketplace)/listings/[id]/checkout/success/page";

const mocks = vi.hoisted(() => ({ query: vi.fn(), celebrate: vi.fn(), params: new URLSearchParams("orderId=11111111-1111-4111-8111-111111111111") }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params, usePathname: () => "/listings/synthetic-lot/checkout/success" }));
vi.mock("@/lib/utils/celebrate", () => ({ celebrateMilestone: mocks.celebrate }));
vi.mock("@/lib/trpc/client", () => ({ trpc: { order: { getById: { useQuery: mocks.query } } } }));
const order = { buyerId: "receipt-buyer", id: "11111111-1111-4111-8111-111111111111", orderNumber: "PM-TEST", createdAt: new Date(), status: "pending", paymentStatus: "pending", subtotal: 100, buyerFee: 5, buyerFreightCharge: 10, taxAmount: 2, totalPrice: 117 };

describe("checkout receipt rendering", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.params = new URLSearchParams("orderId=11111111-1111-4111-8111-111111111111");
    useAuthStore.getState().setUser({ id: "receipt-buyer", name: "Synthetic buyer", email: "buyer@example.invalid", role: "buyer", businessName: "Synthetic", avatarUrl: null, verified: true, verificationStatus: "verified", stripeOnboardingComplete: false, zipCode: "80202" });
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
  it.each(["other buyer", "logged out", "session loading", "old order reference"])("hides cached receipt during %s", kind => {
    mocks.query.mockReturnValue({ data: { ...order, status: "confirmed", paymentStatus: "succeeded" }, isLoading: false });
    if (kind === "other buyer") useAuthStore.getState().setUser({ ...useAuthStore.getState().user!, id: "other-buyer" });
    if (kind === "logged out") useAuthStore.getState().logout();
    if (kind === "session loading") useAuthStore.getState().setLoading(true);
    if (kind === "old order reference") mocks.params.set("orderId", "22222222-2222-4222-8222-222222222222");
    render(<Receipt />);
    expect(screen.queryByText("Order PM-TEST")).not.toBeInTheDocument();
    expect(screen.queryByText("Total paid")).not.toBeInTheDocument();
    expect(mocks.celebrate).not.toHaveBeenCalled();
    if (kind === "logged out" || kind === "session loading") expect(mocks.query.mock.calls[0][1].enabled).toBe(false);
    if (kind === "logged out") expect(screen.getByRole("link", { name: "Sign in to view receipt" })).toHaveAttribute("href", expect.stringContaining("redirect="));
  });

  it("removes visible receipt immediately when the buyer changes", () => {
    render(<Receipt />);
    expect(screen.getByText("Order PM-TEST")).toBeInTheDocument();
    act(() => useAuthStore.getState().setUser({ ...useAuthStore.getState().user!, id: "other-buyer" }));
    expect(screen.queryByText("Order PM-TEST")).not.toBeInTheDocument();
  });

  it("opens an uppercase UUID reference using the canonical database identity", () => {
    const canonical = "a1111111-b111-4111-8111-c11111111111";
    mocks.params.set("orderId", canonical.toUpperCase());
    mocks.query.mockReturnValue({ data: { ...order, id: canonical }, isLoading: false });
    render(<Receipt />);
    expect(screen.getByText("Order PM-TEST")).toBeInTheDocument();
    expect(mocks.query.mock.calls[0][0]).toEqual({ id: canonical });
  });

  it("supports a seller purchasing inventory as the order buyer", () => {
    useAuthStore.getState().setUser({ ...useAuthStore.getState().user!, role: "seller" });
    render(<Receipt />);
    expect(screen.getByText("Order PM-TEST")).toBeInTheDocument();
  });

  it("offers recovery when the order remains unavailable after the checking deadline", () => {
    vi.useFakeTimers();
    try {
      mocks.query.mockReturnValue({ isLoading: false, refetch: vi.fn() });
      render(<Receipt />);
      act(() => vi.advanceTimersByTime(60_000));
      expect(screen.getByRole("button", { name: "Check status again" })).toBeInTheDocument();
      expect(screen.queryByText("Total paid")).not.toBeInTheDocument();
    } finally { cleanup(); vi.useRealTimers(); }
  });

  it("shows a retry instead of success when the order cannot be loaded", () => {
    mocks.query.mockReturnValue({isError: true, isLoading: false, refetch: vi.fn()});
    render(<Receipt />);
    expect(screen.getByRole("button", {name: "Check status again"})).toBeInTheDocument();
    expect(screen.queryByText("Total paid")).not.toBeInTheDocument();
    expect(mocks.celebrate).not.toHaveBeenCalled();
  });
});
