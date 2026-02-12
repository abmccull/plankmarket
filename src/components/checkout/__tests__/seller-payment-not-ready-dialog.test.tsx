import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SellerPaymentNotReadyDialog } from "../seller-payment-not-ready-dialog";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";

jest.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: jest.fn(),
    payment: {
      nudgeSellerToOnboard: {
        useMutation: jest.fn(),
      },
    },
    watchlist: {
      add: {
        useMutation: jest.fn(),
      },
    },
    message: {
      getOrCreateConversation: {
        useMutation: jest.fn(),
      },
    },
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe("SellerPaymentNotReadyDialog", () => {
  const mockPush = jest.fn();
  const mockOnOpenChange = jest.fn();
  const mockNudgeMutateAsync = jest.fn();
  const mockAddToWatchlistMutateAsync = jest.fn();
  const mockGetOrCreateConversationMutateAsync = jest.fn();
  const mockInvalidate = jest.fn();

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    sellerId: "seller-123",
    sellerName: "Test Seller Co.",
    listingId: "listing-456",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
    (trpc.useUtils as jest.Mock).mockReturnValue({
      watchlist: {
        isWatchlisted: {
          invalidate: mockInvalidate,
        },
      },
    });
    (trpc.payment.nudgeSellerToOnboard.useMutation as jest.Mock).mockReturnValue({
      mutateAsync: mockNudgeMutateAsync,
    });
    (trpc.watchlist.add.useMutation as jest.Mock).mockReturnValue({
      mutateAsync: mockAddToWatchlistMutateAsync,
    });
    (trpc.message.getOrCreateConversation.useMutation as jest.Mock).mockReturnValue({
      mutateAsync: mockGetOrCreateConversationMutateAsync,
    });
  });

  it("renders dialog with correct title and description", () => {
    render(<SellerPaymentNotReadyDialog {...defaultProps} />);

    expect(screen.getByText("Payment Setup Needed")).toBeInTheDocument();
    expect(
      screen.getByText(/Test Seller Co\. hasn't finished setting up payment processing/i)
    ).toBeInTheDocument();
  });

  it("displays action buttons", () => {
    render(<SellerPaymentNotReadyDialog {...defaultProps} />);

    expect(screen.getByRole("button", { name: /contact seller/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /watch this listing/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /maybe later/i })).toBeInTheDocument();
  });

  it("handles contact seller action", async () => {
    const user = userEvent.setup();
    mockGetOrCreateConversationMutateAsync.mockResolvedValue({
      id: "conversation-789",
    });

    render(<SellerPaymentNotReadyDialog {...defaultProps} />);

    const contactButton = screen.getByRole("button", { name: /contact seller/i });
    await user.click(contactButton);

    await waitFor(() => {
      expect(mockGetOrCreateConversationMutateAsync).toHaveBeenCalledWith({
        listingId: "listing-456",
      });
      expect(mockNudgeMutateAsync).toHaveBeenCalledWith({
        sellerId: "seller-123",
        listingId: "listing-456",
      });
      expect(mockPush).toHaveBeenCalledWith("/messages?conversation=conversation-789");
    });
  });

  it("handles watch listing action", async () => {
    const user = userEvent.setup();
    mockAddToWatchlistMutateAsync.mockResolvedValue({});

    render(<SellerPaymentNotReadyDialog {...defaultProps} />);

    const watchButton = screen.getByRole("button", { name: /watch this listing/i });
    await user.click(watchButton);

    await waitFor(() => {
      expect(mockAddToWatchlistMutateAsync).toHaveBeenCalledWith({
        listingId: "listing-456",
      });
      expect(mockNudgeMutateAsync).toHaveBeenCalledWith({
        sellerId: "seller-123",
        listingId: "listing-456",
      });
      expect(mockInvalidate).toHaveBeenCalledWith({ listingId: "listing-456" });
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("disables buttons during loading", async () => {
    const user = userEvent.setup();
    mockAddToWatchlistMutateAsync.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    render(<SellerPaymentNotReadyDialog {...defaultProps} />);

    const watchButton = screen.getByRole("button", { name: /watch this listing/i });
    await user.click(watchButton);

    // Buttons should be disabled during the async operation
    expect(screen.getByRole("button", { name: /contact seller/i })).toBeDisabled();
    expect(watchButton).toBeDisabled();
    expect(screen.getByRole("button", { name: /maybe later/i })).toBeDisabled();
  });

  it("closes dialog when Maybe Later is clicked", async () => {
    const user = userEvent.setup();
    render(<SellerPaymentNotReadyDialog {...defaultProps} />);

    const maybeLaterButton = screen.getByRole("button", { name: /maybe later/i });
    await user.click(maybeLaterButton);

    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not render when open is false", () => {
    render(<SellerPaymentNotReadyDialog {...defaultProps} open={false} />);

    expect(screen.queryByText("Payment Setup Needed")).not.toBeInTheDocument();
  });
});
