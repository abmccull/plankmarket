import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Inventory from "@/app/(dashboard)/seller/listings/page";
import { useAuthStore } from "@/lib/stores/auth-store";

const m = vi.hoisted(() => ({
  data: {} as Record<string, unknown>, query: vi.fn(), publish: vi.fn(), reset: vi.fn(),
  invalidate: vi.fn(), toast: vi.fn(), push: vi.fn(),
  published: null as null | ((result: { publishedCount: number; alreadyPublishedIds: string[]; alertsPending: boolean; skippedDetails: unknown[] }) => Promise<void>),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: m.push }), usePathname: () => "/seller/listings", useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: m.toast, error: m.toast, info: m.toast } }));
vi.mock("@/lib/feature-flags", () => ({ FEATURES: { promotions: false } }));
vi.mock("@/components/promotions/boost-modal", () => ({ BoostModal: () => null }));
vi.mock("@/components/listings/listing-image", () => ({ ListingImage: () => null }));
vi.mock("@/lib/trpc/client", () => ({ trpc: {
  useUtils: () => ({ listing: { getMyListings: { invalidate: m.invalidate }, getSellerStats: { invalidate: m.invalidate } } }),
  listing: {
    getMyListings: { useQuery: (...args: unknown[]) => { m.query(...args); return { data: m.data, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }; } },
    publishBulk: { useMutation: (options: { onSuccess: typeof m.published }) => { m.published = options.onSuccess; return { mutate: m.publish, reset: m.reset, isPending: false, error: null }; } },
    reconfirm: { useMutation: () => ({ mutate: vi.fn(), reset: m.reset, isPending: false, error: null }) },
  },
} }));
const listing = { id: "11111111-1111-4111-8111-111111111111", sellerId: "seller-a", title: "Private draft flooring", status: "draft", media: [{ url: "https://example.invalid/photo.png" }], totalSqFt: 1200, askPricePerSqFt: 2.75, condition: "new_overstock", updatedAt: new Date(), viewsCount: 0, watchlistCount: 0 };
function owner(id = "seller-a", status = "verified") {
  useAuthStore.getState().setUser({ id, role: "seller", name: "Synthetic seller", email: "seller@example.invalid", businessName: "Synthetic", avatarUrl: null, verified: status === "verified", verificationStatus: status, stripeOnboardingComplete: false, zipCode: "80202" });
}
beforeEach(() => {
  cleanup(); vi.clearAllMocks(); owner();
  m.data = { ownerId: "seller-a", items: [listing], total: 1, totalPages: 1, hasMore: false };
});
describe("seller inventory actor boundary", () => {
  it("renders owned inventory and opens publication review", async () => {
    render(<Inventory />);
    expect(screen.getByText(listing.title)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish listing" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it.each(["foreign response", "missing owner", "foreign row", "logged out", "loading"])("hides cached inventory for %s", kind => {
    if (kind === "foreign response") m.data.ownerId = "seller-b";
    if (kind === "missing owner") delete m.data.ownerId;
    if (kind === "foreign row") m.data.items = [{ ...listing, sellerId: "seller-b" }];
    if (kind === "logged out") useAuthStore.getState().logout();
    if (kind === "loading") useAuthStore.getState().setLoading(true);
    render(<Inventory />);
    expect(screen.queryByText(listing.title)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish listing" })).not.toBeInTheDocument();
  });
  it.each(["unverified", "pending", "rejected"])("routes %s seller to review before publication", status => {
    owner("seller-a", status); render(<Inventory />);
    expect(screen.queryByRole("button", { name: "Publish listing" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /verification|review status/i })).toHaveAttribute("href", "/seller/verification");
    expect(screen.getByRole("link", { name: "Prepare listing draft" })).toHaveAttribute("href", "/seller/listings/new");
    expect(m.query).not.toHaveBeenCalled();
  });
  it("drops the open action when the seller changes", async () => {
    render(<Inventory />);
    await userEvent.click(screen.getByRole("button", { name: "Publish listing" }));
    expect(within(screen.getByRole("dialog")).getByText(listing.title)).toBeInTheDocument();
    act(() => owner("seller-b"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(listing.title)).not.toBeInTheDocument();
  });
  it("ignores late publication success from the previous seller", async () => {
    render(<Inventory />);
    const accepted = m.published!;
    act(() => owner("seller-b"));
    await act(() => accepted({ publishedCount: 1, alreadyPublishedIds: [], alertsPending: false, skippedDetails: [] }));
    expect(m.toast).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("keeps owned empty inventory actionable", () => {
    m.data = { ownerId: "seller-a", items: [], total: 0, totalPages: 0, hasMore: false };
    render(<Inventory />);
    expect(screen.getByText("Start with your first listing")).toBeInTheDocument();
  });
});
