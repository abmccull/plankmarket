import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  AutomaticMarkdownPreview,
  SellerCommercialFulfillmentFields,
  StateBadgeSelector,
  getCommercialReviewSummary,
  getFreightPersistenceValues,
  getFreightUiMode,
} from "@/components/marketplace/seller-commercial-fields";

describe("seller commercial fields helpers", () => {
  it("derives buyer-pays freight mode by default", () => {
    expect(getFreightUiMode({ freightPaymentMode: "buyer_pays" })).toBe(
      "buyer_pays",
    );
  });

  it("distinguishes seller-paid all states vs selected states", () => {
    expect(
      getFreightUiMode({
        freightPaymentMode: "seller_pays",
        sellerFreightStates: [],
      }),
    ).toBe("seller_pays_all");

    expect(
      getFreightUiMode({
        freightPaymentMode: "seller_pays",
        sellerFreightStates: ["TX"],
      }),
    ).toBe("seller_pays_selected");
  });

  it("maps freight ui state back to persistence fields", () => {
    expect(getFreightPersistenceValues("buyer_pays", ["TX"])).toEqual({
      freightPaymentMode: "buyer_pays",
      sellerFreightStates: [],
    });

    expect(
      getFreightPersistenceValues("seller_pays_selected", ["TX", "CO"]),
    ).toEqual({
      freightPaymentMode: "seller_pays",
      sellerFreightStates: ["TX", "CO"],
    });
  });

  it("builds a concise commercial review summary", () => {
    expect(
      getCommercialReviewSummary({
        fullLotOnly: false,
        partialQuantityMarkupPercent: 20,
        automaticMarkdownEnabled: true,
        automaticMarkdownFloorPercent: 60,
        automaticMarkdownIntervalDays: 21,
        allowOffers: true,
        floorPrice: 2.1,
        allowSampleRequests: true,
        territoryMode: "allowed_states",
        allowedDestinationStates: ["CO", "TX"],
        freightPaymentMode: "seller_pays",
        sellerFreightStates: ["CO", "TX"],
        freightDropCharge: 95,
      }),
    ).toEqual([
      { label: "Lot strategy", value: "Partial quantities allowed at +20%" },
      {
        label: "Automatic markdown",
        value: "Every 21 days down to 60% of the original ask",
      },
      {
        label: "Offers",
        value: "On with hidden floor at $2.10/sq ft",
      },
      { label: "Samples", value: "Enabled" },
      { label: "Territory", value: "CO, TX" },
      {
        label: "Freight funding",
        value:
          "Seller sponsors freight in CO, TX - Buyer pays $95.00 toward each shipment",
      },
    ]);
  });
});

describe("AutomaticMarkdownPreview", () => {
  it("renders the five-step schedule", () => {
    render(
      <AutomaticMarkdownPreview
        baseUnitPrice={2.99}
        floorPercent={60}
        intervalDays={21}
      />,
    );

    expect(screen.getByText("Starts immediately")).toBeInTheDocument();
    expect(screen.getByText("After 84 days")).toBeInTheDocument();
    expect(screen.getByText("$2.99")).toBeInTheDocument();
    expect(screen.getByText("$1.79")).toBeInTheDocument();
  });
});

describe("StateBadgeSelector", () => {
  it("supports one-click regional selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <StateBadgeSelector
        label="Allowed destination states"
        selected={[]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "West" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining(["AZ", "CO", "UT", "CA", "OR", "WA"]),
    );
  });

  it("supports keyboard activation for region and state toggles", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <StateBadgeSelector
        label="Allowed destination states"
        selected={[]}
        onChange={onChange}
      />,
    );

    await user.tab();
    expect(screen.getByRole("button", { name: /select all/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: /clear/i })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Northeast" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "Midwest" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("button", { name: "South" })).toHaveFocus();

    await user.keyboard("[Space]");
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining(["FL", "GA", "TX"]),
    );
  });
});

describe("SellerCommercialFulfillmentFields", () => {
  it("routes shared commercial controls through the provided callbacks", () => {
    const onTerritoryChange = vi.fn();
    const onFreightChange = vi.fn();
    const onSampleChange = vi.fn();
    const onDropChargeChange = vi.fn();

    render(
      <SellerCommercialFulfillmentFields
        sampleRequests={{
          id: "samples",
          enabled: false,
          onChange: onSampleChange,
        }}
        territory={{
          mode: "allowed_states",
          selectedStates: ["CO"],
          onChange: onTerritoryChange,
        }}
        freight={{
          mode: "seller_pays_selected",
          selectedStates: ["CO"],
          onChange: onFreightChange,
          dropChargeInputId: "drop-charge",
          dropChargeValue: "95",
          onDropChargeChange,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /nationwide/i }));
    expect(onTerritoryChange).toHaveBeenCalledWith({
      mode: "unrestricted",
      selectedStates: [],
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: /seller sponsors freight everywhere/i,
      }),
    );
    expect(onFreightChange).toHaveBeenCalledWith({
      mode: "seller_pays_all",
      selectedStates: [],
      persistence: {
        freightPaymentMode: "seller_pays",
        sellerFreightStates: [],
      },
      shouldClearDropCharge: false,
    });

    fireEvent.change(screen.getByLabelText(/buyer drop charge/i), {
      target: { value: "955" },
    });
    expect(onDropChargeChange).toHaveBeenLastCalledWith("955");

    fireEvent.click(
      screen.getByRole("switch", { name: /allow sample requests/i }),
    );
    expect(onSampleChange).toHaveBeenCalledWith(true);
  });
});
