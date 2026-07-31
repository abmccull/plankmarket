import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewBuyerRequestPage from "../page";

const mockPush = vi.fn();
const mockTrack = vi.fn();
const mockInvalidate = vi.fn();
const mockCreate = vi.fn();
let currentParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => currentParams,
}));

vi.mock("@/lib/analytics/use-track", () => ({
  useTrack: () => mockTrack,
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      buyerRequest: { getMyRequests: { invalidate: mockInvalidate } },
    }),
    buyerRequest: {
      create: {
        useMutation: ({ onSuccess }: { onSuccess?: () => void }) => ({
          isPending: false,
          mutateAsync: async (input: unknown) => {
            const result = await mockCreate(input);
            onSuccess?.();
            return result;
          },
        }),
      },
    },
    upload: {
      deleteBuyerMedia: {
        useMutation: () => ({ mutateAsync: vi.fn() }),
      },
    },
  },
}));

vi.mock("@/lib/uploadthing", () => ({
  useUploadThing: () => ({ startUpload: vi.fn() }),
}));

vi.mock("react-dropzone", () => ({
  useDropzone: () => ({
    getRootProps: () => ({}),
    getInputProps: () => ({}),
    isDragActive: false,
  }),
}));

vi.mock("next/image", () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt ?? ""} />
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("NewBuyerRequestPage search-gap handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ id: "request-123" });
    currentParams = new URLSearchParams({
      source: "zero_results",
      materialTypes: "vinyl_lvp,engineered",
      minTotalSqFt: "750",
      maxTotalSqFt: "1500",
      priceMinPerSqFt: "1.25",
      priceMaxPerSqFt: "3.5",
      destinationZip: "84770",
      species: "oak",
      finishTypes: "matte,distressed",
      certifications: "FloorScore,FSC",
      notes: "Original marketplace search: Shaw Floorte Pro",
    });
  });

  it("prefills validated context and tracks request completion without ZIP data", async () => {
    const user = userEvent.setup();
    render(<NewBuyerRequestPage />);

    expect(
      screen.getByText("Your marketplace search is ready to refine."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vinyl / LVP" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText(/min square footage/i)).toHaveValue(750);
    expect(screen.getByLabelText(/max square footage/i)).toHaveValue(1500);
    expect(screen.getByLabelText(/max price/i)).toHaveValue(3.5);
    expect(screen.getByLabelText(/destination zip/i)).toHaveValue("84770");
    expect(screen.getByLabelText(/species/i)).toHaveValue("oak");
    expect(screen.getByLabelText(/additional notes/i)).toHaveValue(
      "Original marketplace search: Shaw Floorte Pro",
    );

    await user.click(screen.getByRole("button", { name: "Post Request" }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          materialTypes: ["vinyl_lvp", "engineered"],
          minTotalSqFt: 750,
          maxTotalSqFt: 1500,
          priceMinPerSqFt: 1.25,
          priceMaxPerSqFt: 3.5,
          destinationZip: "84770",
        }),
      );
    });
    expect(mockTrack).toHaveBeenCalledWith(
      "buyer_request_created",
      expect.objectContaining({
        request_id: "request-123",
        source: "zero_results",
        material_types: ["vinyl_lvp", "engineered"],
        min_total_sqft: 750,
        price_max_per_sqft: 3.5,
      }),
    );
    const completion = mockTrack.mock.calls.find(
      ([event]) => event === "buyer_request_created",
    )?.[1];
    expect(completion).not.toHaveProperty("destination_zip");
    expect(mockPush).toHaveBeenCalledWith("/buyer/requests");
  });
});
