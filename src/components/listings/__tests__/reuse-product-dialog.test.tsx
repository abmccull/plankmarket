// Written before product implementation. Real browser acceptance covers the editor integration.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReuseProductDialog } from "@/components/listings/reuse-product-dialog";
const state = vi.hoisted(() => ({ data: undefined as unknown, isFetching: false, isError: false, refetch: vi.fn(), input: undefined as unknown }));
vi.mock("@/lib/trpc/client", () => ({ trpc: { listing: { getReusableProducts: { useQuery: (input: unknown) => { state.input = input; return state; } } } } }));
const owner = "11505a86-5675-48fb-bfc5-10f50c8d882a";
const row = { id: "09b72a6d-8bfb-40d8-8391-51dce62b8730", title: "Earlier white oak lot", status: "sold", product: { materialType: "engineered", brand: "Test Mill", modelNumber: "OAK-7", width: 7, certifications: ["fsc"] }, omittedFields: [] };
beforeEach(() => { state.data = { ownerId: owner, items: [row], page: 1, hasMore: false }; state.isFetching = false; state.isError = false; state.refetch.mockReset(); });
afterEach(cleanup);
function open(onApply = vi.fn(() => true), disabled = false) { const result = render(<ReuseProductDialog sellerId={owner} disabled={disabled} onApply={onApply} />); fireEvent.click(screen.getByRole("button", { name: "Use a previous product" })); return { ...result, onApply }; }
describe("product reuse dialog", () => {
  it("does not change a draft until a product is reviewed and applied", () => {
    const { onApply } = open(); expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Apply product details" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Earlier white oak lot/ }));
    expect(onApply).not.toHaveBeenCalled(); expect(screen.getByText("OAK-7")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply product details" }));
    expect(onApply).toHaveBeenCalledWith(row.product); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("cancel never applies", () => { const {onApply}=open(); fireEvent.click(screen.getByRole("button",{name:/Earlier white oak lot/})); fireEvent.click(screen.getByRole("button",{name:"Cancel"})); expect(onApply).not.toHaveBeenCalled(); });
  it("does not display or apply another owner's cached response", () => { state.data = {ownerId:"different-owner",items:[row],page:1,hasMore:false}; open(); expect(screen.queryByRole("button",{name:/Earlier white oak lot/})).not.toBeInTheDocument(); expect(screen.getByRole("button",{name:"Apply product details"})).toBeDisabled(); });
  it("does not apply during a loading refresh", () => { state.isFetching=true; open(); expect(screen.getByRole("button",{name:"Apply product details"})).toBeDisabled(); });
  it("preserves the dialog when the current editor rejects a late selection", () => { const {onApply}=open(vi.fn(()=>false)); fireEvent.click(screen.getByRole("button",{name:/Earlier white oak lot/})); fireEvent.click(screen.getByRole("button",{name:"Apply product details"})); expect(onApply).toHaveBeenCalledOnce(); expect(screen.getByRole("dialog")).toBeInTheDocument(); expect(screen.getByRole("alert")).toHaveTextContent(/draft|account/i); });
  it("shows a retry for query errors without changing the draft", () => { state.isError=true; const {onApply}=open(); fireEvent.click(screen.getByRole("button",{name:/Retry/})); expect(state.refetch).toHaveBeenCalled(); expect(onApply).not.toHaveBeenCalled(); });
  it("explains empty inventory", () => { state.data={ownerId:owner,items:[],page:1,hasMore:false}; open(); expect(screen.getByText(/No previous products yet/)).toBeInTheDocument(); });
  it("clears the selection when a new search is submitted", () => { open(); fireEvent.click(screen.getByRole("button",{name:/Earlier white oak lot/})); fireEvent.change(screen.getByRole("textbox",{name:"Search previous products"}),{target:{value:"Another"}}); fireEvent.click(screen.getByRole("button",{name:"Search"})); expect(state.input).toMatchObject({expectedOwnerId:owner,query:"Another",page:1}); expect(screen.getByRole("button",{name:"Apply product details"})).toBeDisabled(); });
  it("requires a new review after changing page", () => { state.data={ownerId:owner,items:[row],page:1,hasMore:true}; open(); fireEvent.click(screen.getByRole("button",{name:/Earlier white oak lot/})); fireEvent.click(screen.getByRole("button",{name:"Next products"})); expect(state.input).toMatchObject({page:2}); expect(screen.getByRole("button",{name:"Apply product details"})).toBeDisabled(); });
  it("disables the entry point while the editor is busy", () => { open(undefined,true); expect(screen.getByRole("button",{name:"Use a previous product"})).toBeDisabled(); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); });
  it("cannot apply when the editor becomes busy after selection", () => { const {rerender,onApply}=open(); fireEvent.click(screen.getByRole("button",{name:/Earlier white oak lot/})); rerender(<ReuseProductDialog sellerId={owner} disabled onApply={onApply} />); expect(screen.getByRole("button",{name:"Apply product details"})).toBeDisabled(); fireEvent.click(screen.getByRole("button",{name:"Apply product details"})); expect(onApply).not.toHaveBeenCalled(); });
  it("identifies unsupported previous specifications for manual confirmation", () => { state.data={ownerId:owner,items:[{...row,omittedFields:["wearLayer"]}],page:1,hasMore:false}; open(); fireEvent.click(screen.getByRole("button",{name:/Earlier white oak lot/})); expect(screen.getByText(/Confirm manually/)).toHaveTextContent(/Wear layer/i); });
});
