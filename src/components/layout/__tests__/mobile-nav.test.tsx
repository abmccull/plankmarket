import { render, screen } from "@testing-library/react";
import { usePathname, useRouter } from "next/navigation";
import { MobileNav } from "../mobile-nav";
import { useAuthStore } from "@/lib/stores/auth-store";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock("@/lib/stores/auth-store");

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: vi.fn().mockReturnValue({
      invalidate: vi.fn(),
    }),
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn().mockReturnValue({
    auth: {
      signOut: vi.fn(),
    },
  }),
}));

vi.mock("@/components/ui/sheet", () => ({
  SheetClose: ({ children }: { children: React.ReactNode }) => children,
}));

const mockUsePathname = vi.mocked(usePathname);
const mockUseRouter = vi.mocked(useRouter);
const mockUseAuthStore = vi.mocked(useAuthStore);

describe("MobileNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRouter.mockReturnValue({
      back: vi.fn(),
      forward: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    });
  });

  it("shows a protected loading shell on dashboard routes during auth hydration", () => {
    mockUsePathname.mockReturnValue("/messages");
    mockUseAuthStore.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      setUser: vi.fn(),
      setLoading: vi.fn(),
      logout: vi.fn(),
    });

    render(<MobileNav />);

    expect(screen.getByRole("status")).toHaveTextContent(/checking access/i);
    expect(screen.queryByText(/sign in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/browse/i)).not.toBeInTheDocument();
  });

  it("keeps public navigation on public routes without a user", () => {
    mockUsePathname.mockReturnValue("/pricing");
    mockUseAuthStore.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      setUser: vi.fn(),
      setLoading: vi.fn(),
      logout: vi.fn(),
    });

    render(<MobileNav />);

    expect(screen.getByRole("link", { name: /pricing/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("uses the authenticated buyer role on shared protected routes", () => {
    mockUsePathname.mockReturnValue("/offers");
    mockUseAuthStore.mockReturnValue({
      user: {
        id: "buyer-1",
        email: "buyer@example.com",
        name: "Buyer User",
        role: "buyer",
        businessName: "Buyer Co",
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

    render(<MobileNav />);

    expect(screen.getByRole("link", { name: /my orders/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /watchlist/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /my listings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
  });
});
