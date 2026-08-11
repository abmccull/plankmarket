import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { Sidebar } from "../sidebar";
import { useAuthStore } from "@/lib/stores/auth-store";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("@/lib/stores/auth-store");

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    message: {
      getUnreadCount: {
        useQuery: vi.fn().mockReturnValue({ data: { count: 0 } }),
      },
    },
  },
}));

const mockUsePathname = vi.mocked(usePathname);
const mockUseAuthStore = vi.mocked(useAuthStore);

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a protected loading shell while auth is hydrating", () => {
    mockUsePathname.mockReturnValue("/seller/orders");
    mockUseAuthStore.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      setUser: vi.fn(),
      setLoading: vi.fn(),
      logout: vi.fn(),
    });

    render(<Sidebar />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /protected navigation is loading/i,
    );
    expect(screen.queryByText(/seller dashboard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/buyer dashboard/i)).not.toBeInTheDocument();
  });

  it("shows a secure handoff shell when no dashboard user is available", () => {
    mockUsePathname.mockReturnValue("/buyer");
    mockUseAuthStore.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      setUser: vi.fn(),
      setLoading: vi.fn(),
      logout: vi.fn(),
    });

    render(<Sidebar />);

    expect(screen.getByText(/secure dashboard/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /protected navigation is loading/i,
    );
    expect(screen.queryByRole("link", { name: /dashboard/i })).not.toBeInTheDocument();
  });

  it("uses the authenticated seller role on shared routes", () => {
    mockUsePathname.mockReturnValue("/messages");
    mockUseAuthStore.mockReturnValue({
      user: {
        id: "seller-1",
        email: "seller@example.com",
        name: "Seller User",
        role: "seller",
        businessName: "Seller Co",
        avatarUrl: null,
        verified: true,
        verificationStatus: "verified",
        stripeOnboardingComplete: true,
        zipCode: "80202",
      },
      isAuthenticated: true,
      isLoading: false,
      setUser: vi.fn(),
      setLoading: vi.fn(),
      logout: vi.fn(),
    });

    render(<Sidebar />);

    expect(screen.getByText(/seller dashboard/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /my listings/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /watchlist/i })).not.toBeInTheDocument();
  });
});
