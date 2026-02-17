import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SellerPaymentNotReadyDialog } from "../seller-payment-not-ready-dialog";
import { trpc } from "@/lib/trpc/client";
import { useRouter } from "next/navigation";

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: vi.fn(),
    payment: {
      nudgeSellerToOnboard: {
        useMutation: vi.fn(),
      },
    },
    watchlist: {
      add: {
        useMutation: vi.fn(),
      },
    },
    message: {
      getOrCreateConversation: {
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

describe("SellerPaymentNotReadyDialog", () => {
  const mockPush = vi.fn();
  const mockOnOpenChange = vi.fn();
  const mockNudgeMutateAsync = vi.fn();
  const mockAddToWatchlistMutateAsync = vi.fn();
  const mockGetOrCreateConversationMutateAsync = vi.fn();
  const mockInvalidate = vi.fn();

  const defaultProps = {
    open: true,
    onOpenChange: mockOnOpenChange,
    sellerId: "seller-123",
    sellerName: "Test Seller Co.",
    listingId: "listing-456",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as ReturnType<typeof useRouter>);
    vi.mocked(trpc.useUtils).mockReturnValue({
      watchlist: {
        isWatchlisted: {
          invalidate: mockInvalidate,
        },
      },
    } as unknown as ReturnType<typeof trpc.useUtils>);
    vi.mocked(trpc.payment.nudgeSellerToOnboard.useMutation).mockReturnValue({
      mutateAsync: mockNudgeMutateAsync,
    } as unknown as ReturnType<typeof trpc.payment.nudgeSellerToOnboard.useMutation>);
    vi.mocked(trpc.watchlist.add.useMutation).mockReturnValue({
      mutateAsync: mockAddToWatchlistMutateAsync,
    } as unknown as ReturnType<typeof trpc.watchlist.add.useMutation>);
    vi.mocked(trpc.message.getOrCreateConversation.useMutation).mockReturnValue({
      mutateAsync: mockGetOrCreateConversationMutateAsync,
    } as unknown as ReturnType<typeof trpc.message.getOrCreateConversation.useMutation>);
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
    let resolvePromise: () => void;
    mockAddToWatchlistMutateAsync.mockImplementation(
      () => new Promise<void>((resolve) => { resolvePromise = resolve; })
    );

    render(<SellerPaymentNotReadyDialog {...defaultProps} />);

    const watchButton = screen.getByRole("button", { name: /watch this listing/i });
    await user.click(watchButton);

    // Buttons should be disabled during the async operation
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /contact seller/i })).toBeDisabled();
      expect(watchButton).toBeDisabled();
      expect(screen.getByRole("button", { name: /maybe later/i })).toBeDisabled();
    });

    // Clean up: resolve the pending promise
    resolvePromise!();
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
