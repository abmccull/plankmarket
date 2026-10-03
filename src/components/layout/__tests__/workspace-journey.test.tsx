import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Header } from "@/components/layout/header";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { useAuthStore } from "@/lib/stores/auth-store";

const route = vi.hoisted(() => ({ pathname: "/seller", search: "", push: vi.fn() }));
const rpc = vi.hoisted(() => ({
  progress: vi.fn(() => ({ data: { steps: { business_verified: true, stripe_connected: false }, percentComplete: 20 }, isLoading: false })),
  invalidate: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
  useRouter: () => ({ push: route.push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
}));
vi.mock("@/hooks/use-sign-out", () => ({ useSignOut: () => ({ signOut: vi.fn(), pending: false, error: null }) }));
vi.mock("@/hooks/use-pro-status", () => ({ useProStatus: () => ({ isPro: false }) }));
vi.mock("@/lib/trpc/client", () => ({ trpc: {
  message: { getUnreadCount: { useQuery: () => ({ data: { count: 0 } }) } },
  auth: { getOnboardingProgress: { useQuery: rpc.progress } },
  notification: {
    getUnreadCount: { useQuery: () => ({ data: { count: 0 } }) },
    getLatest: { useQuery: () => ({ data: [] }) },
    markAsRead: { useMutation: () => ({ mutate: vi.fn() }) },
    markAllAsRead: { useMutation: () => ({ mutateAsync: vi.fn() }) },
    clearRead: { useMutation: () => ({ mutate: vi.fn() }) },
  },
  useUtils: () => ({ notification: { getUnreadCount: { invalidate: rpc.invalidate }, getLatest: { invalidate: rpc.invalidate } } }),
} }));

type Account = NonNullable<ReturnType<typeof useAuthStore.getState>["user"]>;
function account(id: string, role: Account["role"] = "seller"): Account {
  return { id, role, email: `${id}@example.invalid`, name: id, businessName: "Synthetic business", avatarUrl: null, verified: true, verificationStatus: "verified", stripeOnboardingComplete: false, zipCode: "80202" };
}
function signIn(id = "navigation-seller-a", role: Account["role"] = "seller") {
  act(() => useAuthStore.getState().setUser(account(id, role)));
}
function expectBuying(nav: HTMLElement) {
  expect(within(nav).getByRole("link", { name: /watchlist/i })).toHaveAttribute("href", "/buyer/watchlist");
  expect(within(nav).getByRole("link", { name: /purchases|my orders/i })).toHaveAttribute("href", "/buyer/orders");
  expect(within(nav).queryByRole("link", { name: /payments.*payouts/i })).not.toBeInTheDocument();
}
function expectSelling(nav: HTMLElement) {
  expect(within(nav).getByRole("link", { name: /my listings/i })).toHaveAttribute("href", "/seller/listings");
  expect(within(nav).queryByRole("link", { name: /watchlist/i })).not.toBeInTheDocument();
}

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); sessionStorage.clear(); route.pathname = "/seller"; route.search = "";
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
  act(() => useAuthStore.getState().logout());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("one business navigation through actual components", () => {
  it.each(["/buyer", "/buyer/orders/owned-order", "/buyer/samples"])("seller gets Buying navigation at %s", (pathname) => {
    signIn(); route.pathname = pathname; render(<Sidebar />);
    expectBuying(screen.getByRole("navigation", { name: "Workspace navigation" }));
  });
  it("preserves Buying on shared routes and same-tab remount, but a dedicated Selling URL wins", async () => {
    signIn(); route.pathname = "/buyer/orders"; const view = render(<Sidebar />);
    await waitFor(() => expectBuying(screen.getByRole("navigation", { name: "Workspace navigation" })));
    route.pathname = "/messages"; view.rerender(<Sidebar />); expectBuying(screen.getByRole("navigation", { name: "Workspace navigation" }));
    view.unmount(); render(<Sidebar />); expectBuying(screen.getByRole("navigation", { name: "Workspace navigation" }));
    cleanup(); route.pathname = "/seller/orders"; render(<Sidebar />); expectSelling(screen.getByRole("navigation", { name: "Workspace navigation" }));
  });
  it("does not infer a buying route from a partial segment", () => {
    signIn(); route.pathname = "/buyerish"; render(<Sidebar />); expectSelling(screen.getByRole("navigation", { name: "Workspace navigation" }));
  });
  it("retains the same actor context on profile refresh and fences it on a new account", async () => {
    signIn(); route.pathname = "/buyer"; const view = render(<Sidebar />);
    await waitFor(() => expectBuying(screen.getByRole("navigation", { name: "Workspace navigation" })));
    route.pathname = "/offers"; signIn(); view.rerender(<Sidebar />); expectBuying(screen.getByRole("navigation", { name: "Workspace navigation" }));
    signIn("navigation-seller-b"); view.rerender(<Sidebar />); expectSelling(screen.getByRole("navigation", { name: "Workspace navigation" }));
    signIn("navigation-buyer-c", "buyer"); view.rerender(<Sidebar />); expectBuying(screen.getByRole("navigation", { name: "Workspace navigation" }));
  });
  it("shows no previous workspace while the next account is hydrating", () => {
    signIn(); route.pathname = "/buyer"; const view = render(<Sidebar />);
    act(() => { useAuthStore.getState().setUser(null); useAuthStore.getState().setLoading(true); });
    route.pathname = "/messages"; view.rerender(<Sidebar />);
    expect(screen.queryByRole("navigation", { name: "Workspace navigation" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/confirming your account/i);
  });
  it("continues navigation when optional storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage denied"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage denied"); });
    signIn(); route.pathname = "/buyer"; const view = render(<Sidebar />);
    await waitFor(() => expectBuying(screen.getByRole("navigation", { name: "Workspace navigation" })));
    route.pathname = "/notifications"; view.rerender(<Sidebar />); expectBuying(screen.getByRole("navigation", { name: "Workspace navigation" }));
  });
  it("mobile uses the same buyer links", async () => {
    signIn(); route.pathname = "/buyer/orders"; const close = vi.fn(); render(<MobileNav onNavigate={close} />);
    const nav = screen.getByRole("navigation", { name: "Mobile workspace navigation" }); expectBuying(nav);
    await userEvent.setup().click(within(nav).getByRole("link", { name: /watchlist/i }));
    // Next Link onNavigate runs in the real browser; the browser module proves drawer closure.
  });
  it.each([["Dashboard", "/buyer"], ["Orders|Purchases", "/buyer/orders"], ["Settings", "/buyer/settings"]])("header %s follows Buying context", async (label, href) => {
    signIn(); route.pathname = "/buyer/orders"; render(<Header />);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Open user menu" }));
    await user.click(screen.getByRole("menuitem", { name: new RegExp(`^(${label})$`, "i") }));
    expect(route.push).toHaveBeenCalledWith(href);
  });
  it("seller can reach watchlist from the public inventory header", () => {
    signIn(); route.pathname = "/listings"; render(<Header />);
    expect(screen.getByRole("link", { name: "Watchlist" })).toHaveAttribute("href", "/buyer/watchlist");
  });
  it("Buying preferences link carries its form context", () => {
    signIn(); route.pathname = "/buyer"; render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Preferences", hidden: true })).toHaveAttribute("href", "/preferences?workspace=buyer");
  });
});

describe("onboarding display context", () => {
  it("Buying uses the common approval without requiring the purchasing seller's Stripe setup", () => {
    signIn(); render(<OnboardingChecklist variant="buyer" />);
    expect(rpc.progress).toHaveBeenCalledWith({ role: "buyer" }, expect.anything());
    expect(screen.getByText("Required setup complete")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Set up payments" })).not.toBeInTheDocument();
  });
  it("collapse is separate for Buying and Selling on the same account", async () => {
    signIn(); const view = render(<OnboardingChecklist variant="buyer" defaultCollapsed={false} />);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: /view setup and optional/i }));
    expect(screen.getByRole("button", { name: /view setup and optional/i })).toHaveAttribute("aria-expanded", "false");
    view.rerender(<OnboardingChecklist variant="seller" defaultCollapsed={false} />);
    expect(screen.getByRole("button", { name: /view setup and optional/i })).toHaveAttribute("aria-expanded", "true");
  });
  it("a previous business cannot collapse the next business's setup", async () => {
    signIn(); const view = render(<OnboardingChecklist variant="buyer" defaultCollapsed={false} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /view setup and optional/i }));
    signIn("navigation-seller-next"); view.rerender(<OnboardingChecklist variant="buyer" defaultCollapsed={false} />);
    expect(screen.getByRole("button", { name: /view setup and optional/i })).toHaveAttribute("aria-expanded", "true");
  });
});
