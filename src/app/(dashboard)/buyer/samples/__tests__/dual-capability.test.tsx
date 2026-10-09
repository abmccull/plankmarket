import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BuyerSamplesPage from "@/app/(dashboard)/buyer/samples/page";
import { useAuthStore } from "@/lib/stores/auth-store";
const rpc = vi.hoisted(() => ({ act: vi.fn(), setData: vi.fn(), cancel: vi.fn().mockResolvedValue(undefined), query: vi.fn(), read: vi.fn() }));
const request = { id: "33333333-3333-4333-8333-333333333333", listingId: "22222222-2222-4222-8222-222222222222", listingTitle: "Synthetic sample lot", status: "requested", allowedActions: ["cancel"], createdAt: new Date("2026-09-01"), shippingAddress: null, buyerMessage: null };
const utils = { sampleRequest: { getMyRequests: { cancel: rpc.cancel, setData: rpc.setData } }, client: { sampleRequest: { getMyRequests: { query: rpc.query }, getById: { query: rpc.read } } } };
vi.mock("@/lib/trpc/client", () => ({ trpc: { sampleRequest: {
  getMyRequests: { useQuery: () => ({ data: [request], isLoading: false, isFetching: false, isError: false }) },
  act: { useMutation: () => ({ mutateAsync: rpc.act }) },
}, useUtils: () => utils } }));
function signIn(id = "sample-seller-a", role: "seller" | "buyer" = "seller") {
  act(() => useAuthStore.getState().setUser({ id, role, name: id, email: `${id}@example.invalid`, businessName: "Synthetic business", avatarUrl: null, verified: true, verificationStatus: "verified", stripeOnboardingComplete: false, zipCode: "80202" }));
}
beforeEach(() => { vi.clearAllMocks(); rpc.cancel.mockResolvedValue(undefined); rpc.query.mockResolvedValue([{ ...request, status: "cancelled", allowedActions: [] }]); signIn(); });
afterEach(cleanup);
it("renders a seller's purchased sample queue instead of indefinite loading", () => {
  render(<BuyerSamplesPage />); expect(screen.getByRole("heading", { name: "Samples" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Synthetic sample lot" })).toBeInTheDocument();
});
it("seller can perform its allowed buyer-side action and reconcile the confirmed result", async () => {
  rpc.act.mockResolvedValue({ request: { ...request, status: "cancelled", allowedActions: [] }, result: { kind: "transition" } });
  render(<BuyerSamplesPage />); await userEvent.setup().click(screen.getByRole("button", { name: "Cancel Request" }));
  await waitFor(() => expect(rpc.act).toHaveBeenCalledWith({ requestId: request.id, action: "cancel", reason: "Buyer cancelled the sample request" }));
  expect(await screen.findByText(/sample request cancelled/i)).toBeInTheDocument(); expect(rpc.setData).toHaveBeenCalled(); expect(rpc.query).toHaveBeenCalledTimes(1);
});
it("a late response after account change cannot write a receipt or another account's cache", async () => {
  // Use the already-supported buyer outer gate so this control fails only on a regression, not before the new seller gate opens.
  signIn("sample-buyer-a", "buyer"); let finish!: (value: unknown) => void;
  rpc.act.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const view = render(<BuyerSamplesPage />); await userEvent.setup().click(screen.getByRole("button", { name: "Cancel Request" }));
  expect(rpc.act).toHaveBeenCalledTimes(1); signIn("sample-buyer-b", "buyer"); view.rerender(<BuyerSamplesPage />);
  await act(async () => { finish({ request: { ...request, status: "cancelled", allowedActions: [] }, result: { kind: "transition" } }); });
  expect(rpc.setData).not.toHaveBeenCalled(); expect(rpc.query).not.toHaveBeenCalled(); expect(screen.queryByText(/sample request cancelled/i)).not.toBeInTheDocument();
});
