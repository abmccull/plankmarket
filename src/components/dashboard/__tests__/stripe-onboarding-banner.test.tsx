import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StripeOnboardingBanner } from "../stripe-onboarding-banner";
import { trpc } from "@/lib/trpc/client";

// Mock window.location
const originalLocation = window.location;
delete (window as { location?: Location }).location;
window.location = { ...originalLocation, href: "" } as Location;

jest.mock("@/lib/trpc/client", () => ({
  trpc: {
    payment: {
      getConnectStatus: {
        useQuery: jest.fn(),
      },
      createConnectAccount: {
        useMutation: jest.fn(),
      },
    },
  },
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("StripeOnboardingBanner", () => {
  const mockMutateAsync = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    window.location.href = "";
    (trpc.payment.createConnectAccount.useMutation as jest.Mock).mockReturnValue({
      mutateAsync: mockMutateAsync,
    });
  });

  afterAll(() => {
    window.location = originalLocation;
  });

  it("renders banner when onboarding is not complete", () => {
    (trpc.payment.getConnectStatus.useQuery as jest.Mock).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    });

    render(<StripeOnboardingBanner />);

    expect(
      screen.getByText("Set up payments to start receiving orders")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set up now/i })).toBeInTheDocument();
  });

  it("does not render when onboarding is complete", () => {
    (trpc.payment.getConnectStatus.useQuery as jest.Mock).mockReturnValue({
      data: { onboardingComplete: true },
      isLoading: false,
    });

    render(<StripeOnboardingBanner />);

    expect(
      screen.queryByText("Set up payments to start receiving orders")
    ).not.toBeInTheDocument();
  });

  it("does not render when loading", () => {
    (trpc.payment.getConnectStatus.useQuery as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
    });

    render(<StripeOnboardingBanner />);

    expect(
      screen.queryByText("Set up payments to start receiving orders")
    ).not.toBeInTheDocument();
  });

  it("does not render when dismissed", () => {
    sessionStorage.setItem("stripe-onboarding-banner-dismissed", "true");
    (trpc.payment.getConnectStatus.useQuery as jest.Mock).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    });

    render(<StripeOnboardingBanner />);

    expect(
      screen.queryByText("Set up payments to start receiving orders")
    ).not.toBeInTheDocument();
  });

  it("handles Set Up Now button click", async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockResolvedValue({ url: "https://connect.stripe.com/setup" });
    (trpc.payment.getConnectStatus.useQuery as jest.Mock).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    });

    render(<StripeOnboardingBanner />);

    const setupButton = screen.getByRole("button", { name: /set up now/i });
    await user.click(setupButton);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
      expect(window.location.href).toBe("https://connect.stripe.com/setup");
    });
  });

  it("handles dismiss button click", async () => {
    const user = userEvent.setup();
    (trpc.payment.getConnectStatus.useQuery as jest.Mock).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    });

    render(<StripeOnboardingBanner />);

    const dismissButton = screen.getByRole("button", { name: /dismiss banner/i });
    await user.click(dismissButton);

    expect(sessionStorage.getItem("stripe-onboarding-banner-dismissed")).toBe("true");

    // Banner should not be visible after dismissal
    await waitFor(() => {
      expect(
        screen.queryByText("Set up payments to start receiving orders")
      ).not.toBeInTheDocument();
    });
  });

  it("displays loading state during setup", async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ url: "https://stripe.com" }), 100))
    );
    (trpc.payment.getConnectStatus.useQuery as jest.Mock).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    });

    render(<StripeOnboardingBanner />);

    const setupButton = screen.getByRole("button", { name: /set up now/i });
    await user.click(setupButton);

    // Should show loading text
    expect(screen.getByText(/setting up/i)).toBeInTheDocument();
    expect(setupButton).toBeDisabled();
  });

  it("renders with correct accessibility attributes", () => {
    (trpc.payment.getConnectStatus.useQuery as jest.Mock).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    });

    render(<StripeOnboardingBanner />);

    const dismissButton = screen.getByRole("button", { name: /dismiss banner/i });
    expect(dismissButton).toHaveAttribute("aria-label", "Dismiss banner");

    // Icons should be hidden from screen readers
    const icons = screen.getAllByRole("img", { hidden: true });
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });
  });
});
