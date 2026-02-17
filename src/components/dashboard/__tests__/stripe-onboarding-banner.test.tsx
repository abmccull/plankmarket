import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StripeOnboardingBanner } from "../stripe-onboarding-banner";
import { trpc } from "@/lib/trpc/client";

// Mock window.location
const originalLocation = window.location;
delete (window as { location?: Location }).location;
window.location = { ...originalLocation, href: "" } as Location;

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    payment: {
      getConnectStatus: {
        useQuery: vi.fn(),
      },
      createConnectAccount: {
        useMutation: vi.fn(),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("StripeOnboardingBanner", () => {
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.location.href = "";
    vi.mocked(trpc.payment.createConnectAccount.useMutation).mockReturnValue({
      mutateAsync: mockMutateAsync,
    } as unknown as ReturnType<typeof trpc.payment.createConnectAccount.useMutation>);
  });

  afterAll(() => {
    window.location = originalLocation;
  });

  it("renders banner when onboarding is not complete", () => {
    vi.mocked(trpc.payment.getConnectStatus.useQuery).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.payment.getConnectStatus.useQuery>);

    render(<StripeOnboardingBanner />);

    expect(
      screen.getByText("Set up payments to start receiving orders")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /set up now/i })).toBeInTheDocument();
  });

  it("does not render when onboarding is complete", () => {
    vi.mocked(trpc.payment.getConnectStatus.useQuery).mockReturnValue({
      data: { onboardingComplete: true },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.payment.getConnectStatus.useQuery>);

    render(<StripeOnboardingBanner />);

    expect(
      screen.queryByText("Set up payments to start receiving orders")
    ).not.toBeInTheDocument();
  });

  it("does not render when loading", () => {
    vi.mocked(trpc.payment.getConnectStatus.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof trpc.payment.getConnectStatus.useQuery>);

    render(<StripeOnboardingBanner />);

    expect(
      screen.queryByText("Set up payments to start receiving orders")
    ).not.toBeInTheDocument();
  });

  it("does not render when dismissed", () => {
    sessionStorage.setItem("stripe-onboarding-banner-dismissed", "true");
    vi.mocked(trpc.payment.getConnectStatus.useQuery).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.payment.getConnectStatus.useQuery>);

    render(<StripeOnboardingBanner />);

    expect(
      screen.queryByText("Set up payments to start receiving orders")
    ).not.toBeInTheDocument();
  });

  it("handles Set Up Now button click", async () => {
    const user = userEvent.setup();
    mockMutateAsync.mockResolvedValue({ url: "https://connect.stripe.com/setup" });
    vi.mocked(trpc.payment.getConnectStatus.useQuery).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.payment.getConnectStatus.useQuery>);

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
    vi.mocked(trpc.payment.getConnectStatus.useQuery).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.payment.getConnectStatus.useQuery>);

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
    vi.mocked(trpc.payment.getConnectStatus.useQuery).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.payment.getConnectStatus.useQuery>);

    render(<StripeOnboardingBanner />);

    const setupButton = screen.getByRole("button", { name: /set up now/i });
    await user.click(setupButton);

    // Should show loading text
    expect(screen.getByText(/setting up/i)).toBeInTheDocument();
    expect(setupButton).toBeDisabled();
  });

  it("renders with correct accessibility attributes", () => {
    vi.mocked(trpc.payment.getConnectStatus.useQuery).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.payment.getConnectStatus.useQuery>);

    render(<StripeOnboardingBanner />);

    const dismissButton = screen.getByRole("button", { name: /dismiss banner/i });
    expect(dismissButton).toHaveAttribute("aria-label", "Dismiss banner");

    // Icons should be hidden from screen readers (SVGs with aria-hidden)
    const banner = screen.getByText("Set up payments to start receiving orders").closest("[class*='border-amber']")!;
    const svgs = banner.querySelectorAll("svg[aria-hidden='true']");
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    });
  });
});
