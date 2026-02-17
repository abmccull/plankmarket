import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MakeOfferModal } from "../make-offer-modal";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Mock dependencies
vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    offer: {
      createOffer: {
        useMutation: vi.fn(),
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("MakeOfferModal", () => {
  const mockRouter = {
    push: vi.fn(),
  };

  const mockMutateAsync = vi.fn();

  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    listingId: "test-listing-id",
    listingTitle: "Test Hardwood Flooring",
    askPricePerSqFt: 5.0,
    totalSqFt: 1000,
    moq: 500,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter as ReturnType<typeof useRouter>);
    vi.mocked(trpc.offer.createOffer.useMutation).mockReturnValue({
      mutateAsync: mockMutateAsync,
    } as unknown as ReturnType<typeof trpc.offer.createOffer.useMutation>);
  });

  it("renders the modal when open", () => {
    render(<MakeOfferModal {...defaultProps} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Make an Offer")).toBeInTheDocument();
    expect(
      screen.getByText(/Submit your offer for Test Hardwood Flooring/i)
    ).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<MakeOfferModal {...defaultProps} open={false} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("displays asking price and minimum order quantity", () => {
    render(<MakeOfferModal {...defaultProps} />);

    expect(screen.getByText("Asking Price")).toBeInTheDocument();
    expect(screen.getByText("$5.00/sq ft")).toBeInTheDocument();
    expect(screen.getByText("Minimum Order")).toBeInTheDocument();
    expect(screen.getByText("500 sq ft")).toBeInTheDocument();
  });

  it("pre-fills form with default values", () => {
    render(<MakeOfferModal {...defaultProps} />);

    const priceInput = screen.getByLabelText(/Your Offer \(per sq ft\)/i);
    const quantityInput = screen.getByLabelText(/Quantity \(sq ft\)/i);

    // Default to 10% below asking (4.5)
    expect(priceInput).toHaveValue(4.5);
    // Default to total available
    expect(quantityInput).toHaveValue(1000);
  });

  it("calculates subtotal, buyer fee, and total correctly", async () => {
    const user = userEvent.setup();
    render(<MakeOfferModal {...defaultProps} />);

    const priceInput = screen.getByLabelText(/Your Offer \(per sq ft\)/i);
    const quantityInput = screen.getByLabelText(/Quantity \(sq ft\)/i);

    // Clear and enter new values: $4.00/sqft * 800 sqft = $3,200
    await user.clear(priceInput);
    await user.type(priceInput, "4.00");

    await user.clear(quantityInput);
    await user.type(quantityInput, "800");

    // Wait for calculations to update
    await waitFor(() => {
      // Subtotal: $3,200
      expect(screen.getByText("$3,200.00")).toBeInTheDocument();
      // Buyer fee (3%): $96
      expect(screen.getByText("$96.00")).toBeInTheDocument();
      // Total: $3,296
      expect(screen.getByText("$3,296.00")).toBeInTheDocument();
    });
  });

  it("shows warning when quantity is below MOQ", async () => {
    const user = userEvent.setup();
    render(<MakeOfferModal {...defaultProps} />);

    const quantityInput = screen.getByLabelText(/Quantity \(sq ft\)/i);

    await user.clear(quantityInput);
    await user.type(quantityInput, "400");

    await waitFor(() => {
      expect(
        screen.getByText(
          /Note: This is below the seller's minimum order quantity of 500 sq ft/i
        )
      ).toBeInTheDocument();
    });
  });

  it("validates required fields", async () => {
    const user = userEvent.setup();
    render(<MakeOfferModal {...defaultProps} />);

    const priceInput = screen.getByLabelText(/Your Offer \(per sq ft\)/i);
    const quantityInput = screen.getByLabelText(/Quantity \(sq ft\)/i);
    const submitButton = screen.getByRole("button", { name: /Submit Offer/i });

    // Clear required fields
    await user.clear(priceInput);
    await user.clear(quantityInput);

    await user.click(submitButton);

    await waitFor(() => {
      // When number inputs are cleared, valueAsNumber produces NaN
      // Zod reports "expected number, received NaN" for NaN inputs
      const errors = screen.getAllByText(/expected number, received NaN/i);
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("validates price constraints", async () => {
    const user = userEvent.setup();
    render(<MakeOfferModal {...defaultProps} />);

    const priceInput = screen.getByLabelText(/Your Offer \(per sq ft\)/i);
    const submitButton = screen.getByRole("button", { name: /Submit Offer/i });

    // Test negative price
    await user.clear(priceInput);
    await user.type(priceInput, "-5");
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Price per sq ft must be positive/i)
      ).toBeInTheDocument();
    });

    // Test price too high
    await user.clear(priceInput);
    await user.type(priceInput, "1500");
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Price seems too high/i)).toBeInTheDocument();
    });
  });

  it("validates quantity constraints", async () => {
    const user = userEvent.setup();
    render(<MakeOfferModal {...defaultProps} />);

    const quantityInput = screen.getByLabelText(/Quantity \(sq ft\)/i);
    const submitButton = screen.getByRole("button", { name: /Submit Offer/i });

    // Test negative quantity
    await user.clear(quantityInput);
    await user.type(quantityInput, "-100");
    await user.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText(/Quantity must be positive/i)
      ).toBeInTheDocument();
    });

    // Test quantity too high
    await user.clear(quantityInput);
    await user.type(quantityInput, "2000000");
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Quantity seems too high/i)).toBeInTheDocument();
    });
  });

  it("submits offer successfully", async () => {
    const user = userEvent.setup();
    const mockOfferId = "new-offer-id";

    mockMutateAsync.mockResolvedValue({ id: mockOfferId });

    render(<MakeOfferModal {...defaultProps} />);

    const priceInput = screen.getByLabelText(/Your Offer \(per sq ft\)/i);
    const quantityInput = screen.getByLabelText(/Quantity \(sq ft\)/i);
    const messageInput = screen.getByLabelText(/Message \(optional\)/i);
    const submitButton = screen.getByRole("button", { name: /Submit Offer/i });

    await user.clear(priceInput);
    await user.type(priceInput, "4.50");

    await user.clear(quantityInput);
    await user.type(quantityInput, "750");

    await user.type(messageInput, "I'm interested in this flooring.");

    await user.click(submitButton);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        listingId: "test-listing-id",
        offerPricePerSqFt: 4.5,
        quantitySqFt: 750,
        message: "I'm interested in this flooring.",
      });
    });

    expect(toast.success).toHaveBeenCalledWith("Offer submitted successfully");
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    expect(mockRouter.push).toHaveBeenCalledWith(`/offers/${mockOfferId}`);
  });

  it("handles submission errors gracefully", async () => {
    const user = userEvent.setup();
    const errorMessage = "Failed to create offer";

    mockMutateAsync.mockRejectedValue(new Error(errorMessage));

    render(<MakeOfferModal {...defaultProps} />);

    const submitButton = screen.getByRole("button", { name: /Submit Offer/i });

    await user.click(submitButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(errorMessage);
    });

    expect(defaultProps.onOpenChange).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("disables form during submission", async () => {
    const user = userEvent.setup();

    mockMutateAsync.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(<MakeOfferModal {...defaultProps} />);

    const priceInput = screen.getByLabelText(/Your Offer \(per sq ft\)/i);
    const quantityInput = screen.getByLabelText(/Quantity \(sq ft\)/i);
    const messageInput = screen.getByLabelText(/Message \(optional\)/i);
    const submitButton = screen.getByRole("button", { name: /Submit Offer/i });
    const cancelButton = screen.getByRole("button", { name: /Cancel/i });

    await user.click(submitButton);

    // Check that inputs are disabled during submission
    expect(priceInput).toBeDisabled();
    expect(quantityInput).toBeDisabled();
    expect(messageInput).toBeDisabled();
    expect(submitButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();

    expect(screen.getByText(/Submitting\.\.\./i)).toBeInTheDocument();
  });

  it("allows canceling the modal", async () => {
    const user = userEvent.setup();
    render(<MakeOfferModal {...defaultProps} />);

    const cancelButton = screen.getByRole("button", { name: /Cancel/i });

    await user.click(cancelButton);

    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("has proper accessibility attributes", () => {
    render(<MakeOfferModal {...defaultProps} />);

    const priceInput = screen.getByLabelText(/Your Offer \(per sq ft\)/i);
    const quantityInput = screen.getByLabelText(/Quantity \(sq ft\)/i);

    expect(priceInput).toHaveAttribute("id", "offerPricePerSqFt");
    expect(priceInput).toHaveAttribute("type", "number");
    expect(priceInput).toHaveAttribute("aria-invalid", "false");

    expect(quantityInput).toHaveAttribute("id", "quantitySqFt");
    expect(quantityInput).toHaveAttribute("type", "number");
    expect(quantityInput).toHaveAttribute("aria-invalid", "false");
  });

  it("handles optional message field correctly", async () => {
    const user = userEvent.setup();
    const mockOfferId = "new-offer-id";

    mockMutateAsync.mockResolvedValue({ id: mockOfferId });

    render(<MakeOfferModal {...defaultProps} />);

    const submitButton = screen.getByRole("button", { name: /Submit Offer/i });

    // Submit without message
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        listingId: "test-listing-id",
        offerPricePerSqFt: 4.5,
        quantitySqFt: 1000,
        message: "",
      });
    });
  });
});
