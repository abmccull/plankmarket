import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StripeOnboardingBanner } from "../stripe-onboarding-banner";
import { trpc } from "@/lib/trpc/client";

const mockPush = vi.fn();

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    payment: {
      getConnectStatus: {
        useQuery: vi.fn(),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("StripeOnboardingBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("renders when onboarding is incomplete", () => {
    vi.mocked(trpc.payment.getConnectStatus.useQuery).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.payment.getConnectStatus.useQuery>);

    render(<StripeOnboardingBanner />);

    expect(
      screen.getByText("Set up payments to start receiving orders"),
    ).toBeInTheDocument();
  });

  it("does not render when onboarding is complete", () => {
    vi.mocked(trpc.payment.getConnectStatus.useQuery).mockReturnValue({
      data: { onboardingComplete: true },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.payment.getConnectStatus.useQuery>);

    render(<StripeOnboardingBanner />);

    expect(
      screen.queryByText("Set up payments to start receiving orders"),
    ).not.toBeInTheDocument();
  });

  it("navigates to seller payments page on CTA", async () => {
    const user = userEvent.setup();
    vi.mocked(trpc.payment.getConnectStatus.useQuery).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.payment.getConnectStatus.useQuery>);

    render(<StripeOnboardingBanner />);
    await user.click(screen.getByRole("button", { name: /set up now/i }));

    expect(mockPush).toHaveBeenCalledWith("/seller/payments");
  });

  it("dismisses and persists dismissal", async () => {
    const user = userEvent.setup();
    vi.mocked(trpc.payment.getConnectStatus.useQuery).mockReturnValue({
      data: { onboardingComplete: false },
      isLoading: false,
    } as unknown as ReturnType<typeof trpc.payment.getConnectStatus.useQuery>);

    render(<StripeOnboardingBanner />);
    await user.click(screen.getByRole("button", { name: /dismiss banner/i }));

    expect(
      screen.queryByText("Set up payments to start receiving orders"),
    ).not.toBeInTheDocument();
    expect(sessionStorage.getItem("stripe-onboarding-banner-dismissed")).toBe(
      "true",
    );
  });
});
