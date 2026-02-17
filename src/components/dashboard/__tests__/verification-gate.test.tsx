import { render, screen } from "@testing-library/react";
import { VerificationGate } from "../verification-gate";
import { useAuthStore } from "@/lib/stores/auth-store";

// Mock the auth store
vi.mock("@/lib/stores/auth-store");
const mockUseAuthStore = vi.mocked(useAuthStore);

// Mock tRPC to avoid "Unable to find tRPC Context" error
vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    auth: {
      getSession: {
        useQuery: vi.fn().mockReturnValue({ data: null }),
      },
    },
  },
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn().mockReturnValue("/dashboard"),
}));

// Mock celebrate utility
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
        email: "test@example.com",
        name: "Test User",
        role: "buyer",
        businessName: "Test Business",
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
      </VerificationGate>
    );

    expect(screen.getByText("Dashboard Content")).toBeInTheDocument();
  });

  it("renders children for admin users regardless of verification status", () => {
    mockUseAuthStore.mockReturnValue({
      user: {
        id: "1",
        email: "admin@example.com",
        name: "Admin User",
        role: "admin",
        businessName: "Admin Business",
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
        <div>Admin Dashboard</div>
      </VerificationGate>
    );

    expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
  });

  it("shows pending review screen for pending verification status", () => {
    mockUseAuthStore.mockReturnValue({
      user: {
        id: "1",
        email: "test@example.com",
        name: "Test User",
        role: "seller",
        businessName: "Test Business",
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
        <div>Dashboard Content</div>
      </VerificationGate>
    );

    expect(
      screen.getByText("Your Business Verification is Under Review")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/usually verified within minutes/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Dashboard Content")).not.toBeInTheDocument();
  });

  it("shows rejected screen for rejected verification status", () => {
    mockUseAuthStore.mockReturnValue({
      user: {
        id: "1",
        email: "test@example.com",
        name: "Test User",
        role: "seller",
        businessName: "Test Business",
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
        <div>Dashboard Content</div>
      </VerificationGate>
    );

    expect(
      screen.getByText("Your Business Verification Was Not Approved")
    ).toBeInTheDocument();
    expect(screen.getByText("Contact Support")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard Content")).not.toBeInTheDocument();
  });

  it("shows unverified screen for unverified status", () => {
    mockUseAuthStore.mockReturnValue({
      user: {
        id: "1",
        email: "test@example.com",
        name: "Test User",
        role: "buyer",
        businessName: "Test Business",
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
        <div>Dashboard Content</div>
      </VerificationGate>
    );

    expect(
      screen.getByText("Complete Your Business Verification")
    ).toBeInTheDocument();
    expect(screen.getByText("Complete Verification")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard Content")).not.toBeInTheDocument();
  });

  it("renders nothing when loading", () => {
    mockUseAuthStore.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      setUser: vi.fn(),
      setLoading: vi.fn(),
      logout: vi.fn(),
    });

    const { container } = render(
      <VerificationGate>
        <div>Dashboard Content</div>
      </VerificationGate>
    );

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when no user", () => {
    mockUseAuthStore.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      setUser: vi.fn(),
      setLoading: vi.fn(),
      logout: vi.fn(),
    });

    const { container } = render(
      <VerificationGate>
        <div>Dashboard Content</div>
      </VerificationGate>
    );

    expect(container.firstChild).toBeNull();
  });

  it("has proper ARIA attributes for pending state", () => {
    mockUseAuthStore.mockReturnValue({
      user: {
        id: "1",
        email: "test@example.com",
        name: "Test User",
        role: "seller",
        businessName: "Test Business",
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
        <div>Dashboard Content</div>
      </VerificationGate>
    );

    // Check that decorative icons have aria-hidden (SVGs with aria-hidden)
    const container = screen.getByText("Your Business Verification is Under Review").closest("div")!;
    const svgs = container.parentElement!.querySelectorAll("svg[aria-hidden='true']");
    expect(svgs.length).toBeGreaterThan(0);
  });
});
