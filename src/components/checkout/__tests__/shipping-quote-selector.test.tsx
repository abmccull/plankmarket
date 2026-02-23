import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShippingQuoteSelector, {
  type SelectedShippingQuote,
} from "../shipping-quote-selector";
import { trpc } from "@/lib/trpc/client";
import { formatDate } from "@/lib/utils";

// Mock tRPC
vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    shipping: {
      getQuotes: {
        useQuery: vi.fn(),
      },
    },
  },
}));

// Mock query return type to avoid using any
interface MockQueryReturn {
  data: typeof mockQuotes | undefined | [];
  isLoading: boolean;
  isError: boolean;
  error: { message: string } | null;
  refetch: ReturnType<typeof vi.fn>;
}

const mockQuotes = [
  {
    quoteId: 1,
    carrierName: "FedEx Freight",
    carrierScac: "FXFE",
    shippingPrice: 250.0,
    transitDays: 3,
    estimatedDelivery: "2026-02-20T00:00:00.000Z",
    quoteExpiresAt: "2026-02-15T00:00:00.000Z",
  },
  {
    quoteId: 2,
    carrierName: "Old Dominion",
    carrierScac: "ODFL",
    shippingPrice: 285.0,
    transitDays: 2,
    estimatedDelivery: "2026-02-19T00:00:00.000Z",
    quoteExpiresAt: "2026-02-15T00:00:00.000Z",
  },
  {
    quoteId: 3,
    carrierName: "XPO Logistics",
    carrierScac: "XPOL",
    shippingPrice: 320.0,
    transitDays: 5,
    estimatedDelivery: "2026-02-22T00:00:00.000Z",
    quoteExpiresAt: "2026-02-15T00:00:00.000Z",
  },
];

describe("ShippingQuoteSelector", () => {
  const defaultProps = {
    listingId: "listing-123",
    destinationZip: "12345",
    quantitySqFt: 1000,
    selectedQuote: null,
    onSelectQuote: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when destinationZip is less than 5 characters", () => {
    vi.mocked(trpc.shipping.getQuotes.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as MockQueryReturn);

    const { container } = render(
      <ShippingQuoteSelector {...defaultProps} destinationZip="123" />
    );

    expect(container.firstChild).toBeNull();
  });

  it("shows loading spinner while fetching quotes", () => {
    vi.mocked(trpc.shipping.getQuotes.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as MockQueryReturn);

    render(<ShippingQuoteSelector {...defaultProps} />);

    expect(screen.getByText("Loading shipping quotes")).toBeInTheDocument();
    expect(screen.getByText("Shipping Options")).toBeInTheDocument();
  });

  it("shows error message with retry button on error", async () => {
    const mockRefetch = vi.fn();
    vi.mocked(trpc.shipping.getQuotes.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { message: "Network error" },
      refetch: mockRefetch,
    } as MockQueryReturn);

    const user = userEvent.setup();
    render(<ShippingQuoteSelector {...defaultProps} />);

    expect(screen.getByText("Network error")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: /retry loading shipping quotes/i });
    await user.click(retryButton);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows no quotes message when quotes array is empty", () => {
    vi.mocked(trpc.shipping.getQuotes.useQuery).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as MockQueryReturn);

    render(<ShippingQuoteSelector {...defaultProps} />);

    expect(
      screen.getByText("No shipping quotes available for this destination")
    ).toBeInTheDocument();
  });

  it("renders list of shipping quotes with correct information", () => {
    vi.mocked(trpc.shipping.getQuotes.useQuery).mockReturnValue({
      data: mockQuotes,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as MockQueryReturn);

    render(<ShippingQuoteSelector {...defaultProps} />);

    // Check all carriers are rendered
    expect(screen.getByText("FedEx Freight")).toBeInTheDocument();
    expect(screen.getByText("Old Dominion")).toBeInTheDocument();
    expect(screen.getByText("XPO Logistics")).toBeInTheDocument();

    // Check transit days
    expect(screen.getByText("3 business days")).toBeInTheDocument();
    expect(screen.getByText("2 business days")).toBeInTheDocument();
    expect(screen.getByText("5 business days")).toBeInTheDocument();

    // Check prices
    expect(screen.getByText("$250.00")).toBeInTheDocument();
    expect(screen.getByText("$285.00")).toBeInTheDocument();
    expect(screen.getByText("$320.00")).toBeInTheDocument();

    // Check info note
    expect(
      screen.getByText(/prices include all freight charges/i)
    ).toBeInTheDocument();
  });

  it("calls onSelectQuote when a quote is clicked", async () => {
    const mockOnSelectQuote = vi.fn();
    vi.mocked(trpc.shipping.getQuotes.useQuery).mockReturnValue({
      data: mockQuotes,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as MockQueryReturn);

    const user = userEvent.setup();
    render(
      <ShippingQuoteSelector
        {...defaultProps}
        onSelectQuote={mockOnSelectQuote}
      />
    );

    const firstQuote = screen.getByRole("radio", {
      name: /fedex freight, 3 business days, \$250\.00/i,
    });

    await user.click(firstQuote);

    expect(mockOnSelectQuote).toHaveBeenCalledTimes(1);
    expect(mockOnSelectQuote).toHaveBeenCalledWith(mockQuotes[0]);
  });

  it("highlights the selected quote", () => {
    const selectedQuote: SelectedShippingQuote = mockQuotes[1];

    vi.mocked(trpc.shipping.getQuotes.useQuery).mockReturnValue({
      data: mockQuotes,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as MockQueryReturn);

    render(
      <ShippingQuoteSelector
        {...defaultProps}
        selectedQuote={selectedQuote}
      />
    );

    const selectedRadio = screen.getByRole("radio", {
      name: /old dominion, 2 business days, \$285\.00/i,
    });

    expect(selectedRadio).toHaveAttribute("aria-checked", "true");
  });

  it("enables query only when destinationZip is 5+ characters", () => {
    render(<ShippingQuoteSelector {...defaultProps} destinationZip="12345" />);

    expect(trpc.shipping.getQuotes.useQuery).toHaveBeenCalledWith(
      {
        listingId: "listing-123",
        destinationZip: "12345",
        quantitySqFt: 1000,
      },
      {
        enabled: true,
      }
    );
  });

  it("shows singular 'business day' for 1-day transit", () => {
    const singleDayQuote = [
      {
        ...mockQuotes[0],
        transitDays: 1,
      },
    ];

    vi.mocked(trpc.shipping.getQuotes.useQuery).mockReturnValue({
      data: singleDayQuote,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as MockQueryReturn);

    render(<ShippingQuoteSelector {...defaultProps} />);

    expect(screen.getByText("1 business day")).toBeInTheDocument();
  });

  it("formats estimated delivery dates correctly", () => {
    vi.mocked(trpc.shipping.getQuotes.useQuery).mockReturnValue({
      data: mockQuotes,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as MockQueryReturn);

    render(<ShippingQuoteSelector {...defaultProps} />);

    // Check that delivery dates are formatted (use formatDate to match timezone-dependent output)
    const expected0 = formatDate(mockQuotes[0].estimatedDelivery);
    const expected1 = formatDate(mockQuotes[1].estimatedDelivery);
    const expected2 = formatDate(mockQuotes[2].estimatedDelivery);
    expect(screen.getByText(new RegExp(`Estimated delivery: ${expected0}`, "i"))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Estimated delivery: ${expected1}`, "i"))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Estimated delivery: ${expected2}`, "i"))).toBeInTheDocument();
  });

  it("has proper accessibility attributes for radiogroup", () => {
    vi.mocked(trpc.shipping.getQuotes.useQuery).mockReturnValue({
      data: mockQuotes,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as MockQueryReturn);

    render(<ShippingQuoteSelector {...defaultProps} />);

    const radioGroup = screen.getByRole("radiogroup", { name: /shipping options/i });
    expect(radioGroup).toBeInTheDocument();

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);

    radios.forEach((radio) => {
      expect(radio).toHaveAttribute("aria-checked");
    });
  });
});
