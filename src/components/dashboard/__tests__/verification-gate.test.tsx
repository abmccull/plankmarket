import { render, screen } from "@testing-library/react";
import { VerificationGate } from "../verification-gate";
import { useAuthStore } from "@/lib/stores/auth-store";

vi.mock("@/lib/stores/auth-store");
const mockUseAuthStore = vi.mocked(useAuthStore);

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    auth: {
      getSession: {
        useQuery: vi.fn().mockReturnValue({ data: null }),
      },
    },
  },
}));

vi.mock("@/lib/utils/celebrate", () => ({
  celebrateMilestone: vi.fn(),
}));

describe("VerificationGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders children for verified users", () => {
    mockUseAuthStore.mockReturnValue({
      user: {
        id: "1",
        email: "buyer@example.com",
        name: "Buyer",
        role: "buyer",
        businessName: "Buyer Inc",
        avatarUrl: null,
        verified: true,
        verificationStatus: "verified",
        stripeOnboardingComplete: false,
        zipCode: "75001",
      },
      isAuthenticated: true,
      isLoading: false,
      setUser: vi.fn(),
      setLoading: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <VerificationGate>
        <div>Dashboard Content</div>
      </VerificationGate>,
    );

    expect(screen.getByText("Dashboard Content")).toBeInTheDocument();
    expect(
      screen.queryByText("Verification Required for Transactions"),
    ).not.toBeInTheDocument();
  });

  it("shows pending banner and still renders children", () => {
    mockUseAuthStore.mockReturnValue({
      user: {
        id: "1",
        email: "seller@example.com",
        name: "Seller",
        role: "seller",
        businessName: "Seller Inc",
        avatarUrl: null,
        verified: false,
        verificationStatus: "pending",
        stripeOnboardingComplete: false,
        zipCode: "75001",
      },
      isAuthenticated: true,
      isLoading: false,
      setUser: vi.fn(),
      setLoading: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <VerificationGate>
        <div>Seller Dashboard</div>
      </VerificationGate>,
    );

    expect(
      screen.getByText(/verification pending/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Seller Dashboard")).toBeInTheDocument();
  });

  it("shows verification CTA for unverified buyers and renders children", () => {
    mockUseAuthStore.mockReturnValue({
      user: {
        id: "1",
        email: "buyer@example.com",
        name: "Buyer",
        role: "buyer",
        businessName: "Buyer Inc",
        avatarUrl: null,
        verified: false,
        verificationStatus: "unverified",
        stripeOnboardingComplete: false,
        zipCode: "75001",
      },
      isAuthenticated: true,
      isLoading: false,
      setUser: vi.fn(),
      setLoading: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <VerificationGate>
        <div>Buyer Dashboard</div>
      </VerificationGate>,
    );

    expect(
      screen.getByText("Verification Required for Transactions"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /submit buyer verification/i }),
    ).toHaveAttribute("href", "/buyer/settings");
    expect(screen.getByText("Buyer Dashboard")).toBeInTheDocument();
  });

  it("shows verification CTA for rejected sellers and renders children", () => {
    mockUseAuthStore.mockReturnValue({
      user: {
        id: "1",
        email: "seller@example.com",
        name: "Seller",
        role: "seller",
        businessName: "Seller Inc",
        avatarUrl: null,
        verified: false,
        verificationStatus: "rejected",
        stripeOnboardingComplete: false,
        zipCode: "75001",
      },
      isAuthenticated: true,
      isLoading: false,
      setUser: vi.fn(),
      setLoading: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <VerificationGate>
        <div>Seller Dashboard</div>
      </VerificationGate>,
    );

    expect(screen.getByText("Verification Rejected")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /submit seller verification/i }),
    ).toHaveAttribute("href", "/seller/verification");
    expect(screen.getByText("Seller Dashboard")).toBeInTheDocument();
  });
});
