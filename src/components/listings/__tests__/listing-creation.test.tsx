import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Mock } from "vitest";

// ──────────────────────────────────────────────────────────────
// Part 1: validateStep unit tests (pure logic, no rendering)
// ──────────────────────────────────────────────────────────────

import { validateStep } from "@/lib/validators/listing-steps";

describe("validateStep", () => {
  describe("step 1 - Product Details", () => {
    it("passes with valid title and materialType", () => {
      const result = validateStep(1, {
        title: "Premium White Oak Hardwood",
        materialType: "hardwood",
      });
      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("fails when title is too short", () => {
      const result = validateStep(1, {
        title: "Hi",
        materialType: "hardwood",
      });
      expect(result.success).toBe(false);
      expect(result.errors?.title).toBeDefined();
    });

    it("fails when materialType is missing", () => {
      const result = validateStep(1, {
        title: "Valid Title Here",
      });
      expect(result.success).toBe(false);
      expect(result.errors?.materialType).toBeDefined();
    });

    it("fails when materialType is invalid", () => {
      const result = validateStep(1, {
        title: "Valid Title Here",
        materialType: "carpet",
      });
      expect(result.success).toBe(false);
      expect(result.errors?.materialType).toBeDefined();
    });
  });

  describe("step 2 - Lot Details", () => {
    const validStep2 = {
      totalSqFt: 2500,
      totalPallets: 5,
      palletWeight: 1200,
      palletLength: 48,
      palletWidth: 40,
      palletHeight: 48,
    };

    it("passes with all required fields", () => {
      const result = validateStep(2, validStep2);
      expect(result.success).toBe(true);
    });

    it("fails when totalSqFt is zero", () => {
      const result = validateStep(2, { ...validStep2, totalSqFt: 0 });
      expect(result.success).toBe(false);
      expect(result.errors?.totalSqFt).toBeDefined();
    });

    it("fails when palletWeight exceeds 5000 lbs", () => {
      const result = validateStep(2, { ...validStep2, palletWeight: 6000 });
      expect(result.success).toBe(false);
      expect(result.errors?.palletWeight).toBeDefined();
    });
  });

  describe("step 3 - Pricing", () => {
    it("passes with valid askPricePerSqFt", () => {
      const result = validateStep(3, { askPricePerSqFt: 2.5 });
      expect(result.success).toBe(true);
    });

    it("fails when askPricePerSqFt is zero", () => {
      const result = validateStep(3, { askPricePerSqFt: 0 });
      expect(result.success).toBe(false);
      expect(result.errors?.askPricePerSqFt).toBeDefined();
    });

    it("fails when askPricePerSqFt exceeds 1000", () => {
      const result = validateStep(3, { askPricePerSqFt: 1500 });
      expect(result.success).toBe(false);
      expect(result.errors?.askPricePerSqFt).toBeDefined();
    });
  });

  describe("step 4 - Condition", () => {
    it("passes with valid condition", () => {
      const result = validateStep(4, { condition: "new_overstock" });
      expect(result.success).toBe(true);
    });

    it("fails when condition is missing", () => {
      const result = validateStep(4, {});
      expect(result.success).toBe(false);
      expect(result.errors?.condition).toBeDefined();
    });
  });

  describe("step 5 - Photos", () => {
    it("passes with at least one photo", () => {
      const result = validateStep(5, {
        photos: ["https://example.com/photo.jpg"],
      });
      expect(result.success).toBe(true);
    });

    it("fails with empty photos array", () => {
      const result = validateStep(5, { photos: [] });
      expect(result.success).toBe(false);
      expect(result.errors?.photos).toBeDefined();
    });
  });

  describe("step 6 - Review", () => {
    it("always passes (no validation needed)", () => {
      const result = validateStep(6, {});
      expect(result.success).toBe(true);
    });
  });

  describe("invalid step number", () => {
    it("returns error for step 0", () => {
      const result = validateStep(0, {});
      expect(result.success).toBe(false);
      expect(result.errors?.general).toBe("Invalid step number");
    });

    it("returns error for step 7", () => {
      const result = validateStep(7, {});
      expect(result.success).toBe(false);
      expect(result.errors?.general).toBe("Invalid step number");
    });
  });
});

// ──────────────────────────────────────────────────────────────
// Part 2: CreateListingPage component rendering tests
// ──────────────────────────────────────────────────────────────

// --- Store state we control per-test ---

let mockStoreState = {
  saveError: null as string | null,
  restoreError: null as string | null,
  storageReadBlocked: false,
  defaultsApplied: false,
  publishedListingId: null as string | null,
  currentStep: 1,
  formData: { allowOffers: true, certifications: [] as string[] },
  uploadedMediaIds: [] as string[],
  setStep: vi.fn(),
  nextStep: vi.fn(),
  prevStep: vi.fn(),
  updateFormData: vi.fn(),
  addMediaId: vi.fn(),
  removeMediaId: vi.fn(),
  setMediaIds: vi.fn(),
  reset: vi.fn().mockReturnValue(true),
  retryRestore: vi.fn().mockReturnValue(true),
  saveDraft: vi.fn().mockReturnValue(true),
  continueWithoutSaving: vi.fn(),
  completePublication: vi.fn(),
  markDefaultsApplied: vi.fn(),
};

// --- Mocks ---

vi.mock("@/lib/stores/listing-form-store", () => ({
  useListingFormStore: Object.assign(() => ({ ...mockStoreState, sellerId: "seller-1" }), { getState: () => ({ ...mockStoreState, sellerId: "seller-1", bindSeller: vi.fn() }) }),
}));

// These existing cases render a ready form; real account synchronization has separate DB/browser proofs.
vi.mock("@/hooks/use-account-listing-draft", () => ({
  useAccountListingDraft: vi.fn(),
}));

vi.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: Object.assign(vi.fn(), { getState: vi.fn(), subscribe: vi.fn(() => vi.fn()) }),
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    warehouse: { list: { useQuery: () => ({ data: { ownerId: "seller-1", warehouses: [], listings: [] }, isFetchedAfterMount: true, isError: false, isFetching: false, refetch: vi.fn() }) } },
    auth: { getSession: { useQuery: vi.fn() } },
    listing: {
      create: { useMutation: vi.fn() },
      getSellerStats: { useQuery: vi.fn() },
    },
    preferences: {
      get: { useQuery: vi.fn() },
    },
    useUtils: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), message: vi.fn() },
}));

// Keep these page-render cases at the uploader boundary; private photo behavior has browser proofs.
vi.mock("@/components/listings/private-photo-upload", () => ({
  PrivatePhotoUpload: ({
    account,
    disabled = false,
    onImagesChange,
  }: React.ComponentProps<typeof import("@/components/listings/private-photo-upload").PrivatePhotoUpload>) => (
    <div data-testid="photo-upload">
      <button
        type="button"
        disabled={disabled || account.photoBlocked || !account.canEdit()}
        onClick={() => onImagesChange(["mock-media-id"])}
      >
        Upload Photo
      </button>
    </div>
  ),
}));

vi.mock("@/components/ui/onboarding-tip", () => ({
  OnboardingTip: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="onboarding-tip">{children}</div>
  ),
}));

vi.mock("@/lib/utils/celebrate", () => ({
  celebrateMilestone: vi.fn(),
}));

// --- Imports after mocks ---

import { trpc } from "@/lib/trpc/client";
import { useAccountListingDraft } from "@/hooks/use-account-listing-draft";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useRouter } from "next/navigation";
import CreateListingPage from "@/app/(dashboard)/seller/listings/new/page";

// --- Helpers ---

function setupMocks(overrides: { currentStep?: number } = {}) {
  const pushFn = vi.fn();
  (useRouter as Mock).mockReturnValue({ push: pushFn });
  const authState = {
    user: {
      id: "seller-1",
      role: "seller",
      verificationStatus: "verified",
      stripeOnboardingComplete: true,
    },
    isAuthenticated: true,
    isLoading: false,
  };
  (useAuthStore as unknown as Mock).mockReturnValue(authState);
  (useAuthStore.getState as unknown as Mock).mockReturnValue(authState);

  const trpcMock = trpc as unknown as {
    auth: { getSession: { useQuery: Mock } };
    listing: {
      create: { useMutation: Mock };
      getSellerStats: { useQuery: Mock };
    };
    preferences: {
      get: { useQuery: Mock };
    };
    useUtils: Mock;
  };
  trpcMock.auth.getSession.useQuery.mockReturnValue({
    data: { isAuthenticated: true, user: authState.user },
    isFetchedAfterMount: true,
    isError: false,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  });
  trpcMock.listing.create.useMutation.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ id: "new-listing-id" }),
  });
  trpcMock.listing.getSellerStats.useQuery.mockReturnValue({
    data: [
      { status: "active", count: 0 },
      { status: "draft", count: 0 },
    ],
  });
  trpcMock.preferences.get.useQuery.mockReturnValue({ data: undefined });
  trpcMock.useUtils.mockReturnValue({});
  (useAccountListingDraft as Mock).mockReturnValue({
    phase: "ready",
    message: null,
    generation: 0,
    resolved: true,
    mediaWarning: false,
    unavailableMediaIds: [],
    remoteState: "editing",
    saveNow: vi.fn().mockResolvedValue(null),
    retry: vi.fn(),
    useAccountVersion: vi.fn(),
    keepThisVersion: vi.fn(),
    startNew: vi.fn().mockResolvedValue(false),
    exportLocal: vi.fn(),
    canEdit: vi.fn().mockReturnValue(true),
    removeUnavailablePhotos: vi.fn(),
    accountDraftId: null,
    photoState: "idle",
    photoBlocked: false,
    beginPhotoBatch: vi.fn().mockResolvedValue(null),
    isCurrentPhotoBatch: vi.fn().mockReturnValue(false),
    recordPhotoCompletion: vi.fn().mockReturnValue(false),
    acceptPhotoCompletion: vi.fn().mockReturnValue(null),
    endPhotoBatch: vi.fn(),
    reconcilePhotoBatch: vi.fn().mockResolvedValue(null),
    reconcilePhotoTransfer: vi.fn().mockResolvedValue(null),
  } satisfies ReturnType<typeof useAccountListingDraft>);

  // Reset store state for each test
  mockStoreState = {
    saveError: null as string | null,
    restoreError: null as string | null,
    storageReadBlocked: false,
    defaultsApplied: false,
    publishedListingId: null as string | null,
    currentStep: overrides.currentStep ?? 1,
    formData: { allowOffers: true, certifications: [] },
    uploadedMediaIds: [],
    setStep: vi.fn(),
    nextStep: vi.fn(),
    prevStep: vi.fn(),
    updateFormData: vi.fn(),
    addMediaId: vi.fn(),
    removeMediaId: vi.fn(),
    setMediaIds: vi.fn(),
    reset: vi.fn().mockReturnValue(true),
    retryRestore: vi.fn().mockReturnValue(true),
    saveDraft: vi.fn().mockReturnValue(true),
    continueWithoutSaving: vi.fn(),
    completePublication: vi.fn(),
    markDefaultsApplied: vi.fn(),
  };

  return { pushFn };
}

// --- Component Tests ---

describe("CreateListingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it("renders the page heading", () => {
    render(<CreateListingPage />);

    expect(
      screen.getByRole("heading", { name: "Create a listing" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Prepare your lot. Publish when you’re ready.")
    ).toBeInTheDocument();
  });

  it("renders all 3 step indicators", () => {
    render(<CreateListingPage />);

    // Step descriptions are unique per step and only appear in the step bar
    expect(screen.getByText("Identify the material")).toBeInTheDocument();
    expect(screen.getByText("Set the lot and freight")).toBeInTheDocument();
    expect(screen.getByText("Confirm your terms")).toBeInTheDocument();
  });

  it("renders the Quantity & price forward button on step 1", () => {
    render(<CreateListingPage />);

    expect(
      screen.getByRole("button", { name: "Quantity & price" })
    ).toBeInTheDocument();
  });

  it("renders Back button disabled on step 1", () => {
    render(<CreateListingPage />);

    const backButton = screen.getByRole("button", { name: /Back/ });
    expect(backButton).toBeDisabled();
  });

  it("renders the listing title input on step 1", () => {
    render(<CreateListingPage />);

    const titleInput = screen.getByLabelText("Listing Title *");
    expect(titleInput).toBeInTheDocument();
    expect(titleInput).toHaveAttribute(
      "placeholder",
      'e.g., "Premium White Oak Hardwood - 2,500 sq ft Overstock"'
    );
  });

  it("renders material type selector on step 1 with expected options", () => {
    render(<CreateListingPage />);

    // The label "Material Type *" is present
    expect(screen.getByText("Material Type *")).toBeInTheDocument();
    // The Select trigger shows the placeholder
    expect(screen.getByText("Select material")).toBeInTheDocument();
  });

  it("renders the condition card in step 1", () => {
    setupMocks({ currentStep: 1 });

    render(<CreateListingPage />);

    expect(
      screen.getByRole("heading", { name: "Condition & Certifications" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Describe the product condition and any certifications"
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Condition *")).toBeInTheDocument();
    expect(screen.getByText("Select condition")).toBeInTheDocument();
  });

  it("renders photo upload area in step 1", () => {
    setupMocks({ currentStep: 1 });

    render(<CreateListingPage />);

    // Preserve the card description and uploader assertions in the combined first step.
    expect(
      screen.getByText(
        "Show the product, packaging and any damage."
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId("photo-upload")).toBeInTheDocument();
  });

  it("shows Publish listing on step 3 instead of a forward-step action", () => {
    setupMocks({ currentStep: 3 });

    render(<CreateListingPage />);

    expect(
      screen.getByRole("button", { name: "Publish listing" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^(Quantity & price|Review listing)$/ })
    ).not.toBeInTheDocument();
  });

  it("enables Back button on steps after step 1", () => {
    setupMocks({ currentStep: 3 });

    render(<CreateListingPage />);

    const backButton = screen.getByRole("button", { name: /Back/ });
    expect(backButton).toBeEnabled();
  });

  it("calls updateFormData and prevStep when Back is clicked", async () => {
    setupMocks({ currentStep: 3 });
    const user = userEvent.setup();

    render(<CreateListingPage />);

    const backButton = screen.getByRole("button", { name: /Back/ });
    await user.click(backButton);

    expect(mockStoreState.updateFormData).toHaveBeenCalled();
    expect(mockStoreState.prevStep).toHaveBeenCalled();
  });
});
