import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VerificationForm } from "@/components/verification/verification-form";
import { useAuthStore } from "@/lib/stores/auth-store";

const rpc = vi.hoisted(() => ({
  profile: { id: "verification-seller", role: "seller", active: true, verificationStatus: "verified", verificationRequestedAt: null },
  refetch: vi.fn(), cancel: vi.fn().mockResolvedValue(undefined),
}));
const utils = { client: { auth: {
  getProfile: { query: async () => ({ ...rpc.profile }) },
  getVerificationDraft: { query: async () => { throw new Error("Read-only continuation must not load an editable draft"); } },
} } };
vi.mock("@/lib/trpc/client", () => ({ trpc: {
  auth: {
    getProfile: { _def: () => ({ path: ["auth", "getProfile"] }) },
    getVerificationDraft: { _def: () => ({ path: ["auth", "getVerificationDraft"] }) },
  },
  useUtils: () => utils,
} }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
const checkout = "/listings/22222222-2222-4222-8222-222222222222/checkout?offerId=33333333-3333-4333-8333-333333333333&jobSqFt=900&jobZip=80202";
let client: QueryClient;
function renderVerification(returnPath: string) {
  render(<QueryClientProvider client={client}><VerificationForm returnPath={returnPath} /></QueryClientProvider>);
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.clearAllMocks(); rpc.profile = { id: "verification-seller", role: "seller", active: true, verificationStatus: "verified", verificationRequestedAt: null };
  act(() => useAuthStore.getState().setUser({ id: rpc.profile.id, role: "seller", name: "Synthetic seller", email: "seller@example.invalid", businessName: "Synthetic business", avatarUrl: null, verified: true, verificationStatus: "verified", stripeOnboardingComplete: false, zipCode: "80202" }));
});
afterEach(() => { cleanup(); client.clear(); });
it("verified seller returns to the exact safe purchase continuation", async () => {
  renderVerification(checkout);
  expect(await screen.findByRole("link", { name: "Continue to checkout" })).toHaveAttribute("href", checkout);
});
it("pending seller returns to its selected lot while approval is pending", async () => {
  rpc.profile.verificationStatus = "pending"; renderVerification(checkout);
  const href = (await screen.findByRole("link", { name: "Return to selected lot" })).getAttribute("href");
  const url = new URL(href!, "https://fixture.invalid");
  expect(url.pathname).toBe("/listings/22222222-2222-4222-8222-222222222222");
  expect(url.searchParams.get("jobSqFt")).toBe("900"); expect(url.searchParams.get("jobZip")).toBe("80202");
});
it.each(["https://evil.invalid", "//evil.invalid", "/%2f%2fevil.invalid", "/seller/orders/private"])("ignores unsupported purchase continuation %s", async (returnPath) => {
  renderVerification(returnPath);
  expect(await screen.findByRole("link", { name: /open seller dashboard/i })).toHaveAttribute("href", "/seller");
  expect(screen.queryByRole("link", { name: /continue to checkout/i })).not.toBeInTheDocument();
});
it("does not display another profile's approved return controls", async () => {
  rpc.profile.id = "other-seller"; renderVerification(checkout);
  expect(await screen.findByText("Verification status unavailable")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /continue to checkout/i })).not.toBeInTheDocument();
});
