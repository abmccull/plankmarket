import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  initPostHog: vi.fn(),
  useAuthStore: vi.fn(),
  usePreferencesQuery: vi.fn(),
  usePreferencesMutation: vi.fn(),
  mutateAsync: vi.fn().mockResolvedValue(undefined),
  refetch: vi.fn().mockResolvedValue(undefined),
  posthogClient: {
    opt_in_capturing: vi.fn(),
    reset: vi.fn(),
    opt_out_capturing: vi.fn(),
  },
}));

vi.mock("@/lib/analytics/posthog-client", () => ({
  initPostHog: mocks.initPostHog,
}));

vi.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: mocks.useAuthStore,
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    preferences: {
      get: {
        useQuery: mocks.usePreferencesQuery,
      },
      setAnalyticsConsent: {
        useMutation: mocks.usePreferencesMutation,
      },
    },
  },
}));

vi.mock("@vercel/analytics/react", () => ({
  Analytics: () => <div data-testid="vercel-analytics" />,
}));

vi.mock("posthog-js/react", () => ({
  PostHogProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="posthog-provider">{children}</div>
  ),
}));

const { PostHogAnalyticsProvider } = await import("../provider");

describe("PostHogAnalyticsProvider", () => {
  let currentUser:
    | {
        id: string;
        role: "buyer" | "seller" | "admin";
      }
    | null;
  let currentPreference: boolean | null | undefined;
  let currentIsFetched: boolean;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    currentUser = null;
    currentPreference = undefined;
    currentIsFetched = true;

    mocks.initPostHog.mockReturnValue(mocks.posthogClient);
    mocks.useAuthStore.mockImplementation(
      (selector: (state: { user: typeof currentUser }) => unknown) =>
        selector({ user: currentUser }),
    );
    mocks.usePreferencesQuery.mockImplementation(() => ({
      isFetched: currentIsFetched,
      data:
        currentPreference === undefined
          ? undefined
          : { analyticsTrackingEnabled: currentPreference },
      refetch: mocks.refetch,
    }));
    mocks.usePreferencesMutation.mockReturnValue({
      mutateAsync: mocks.mutateAsync,
      isPending: false,
      isError: false,
    });
  });

  it("does not initialize analytics before consent", () => {
    render(
      <PostHogAnalyticsProvider>
        <div>child</div>
      </PostHogAnalyticsProvider>,
    );

    const consentRegion = screen.getByRole("complementary", {
      name: "Help improve PlankMarket",
    });
    expect(consentRegion).toBeInTheDocument();
    expect(consentRegion).not.toHaveClass("fixed");
    expect(
      consentRegion.compareDocumentPosition(screen.getByText("child")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mocks.initPostHog).not.toHaveBeenCalled();
    expect(screen.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
  });

  it("initializes PostHog and Vercel analytics only after consent is granted", async () => {
    window.localStorage.setItem("plankmarket.analytics-consent", "granted");

    render(
      <PostHogAnalyticsProvider>
        <div>child</div>
      </PostHogAnalyticsProvider>,
    );

    await waitFor(() => {
      expect(mocks.initPostHog).toHaveBeenCalledTimes(1);
      expect(mocks.posthogClient.opt_in_capturing).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("vercel-analytics")).toBeInTheDocument();
    expect(screen.getByTestId("posthog-provider")).toBeInTheDocument();
  });

  it("does not trust a stale local grant for authenticated users before preferences load", () => {
    currentUser = {
      id: "buyer-1",
      role: "buyer",
    };
    currentIsFetched = false;
    window.localStorage.setItem("plankmarket.analytics-consent", "granted");

    render(
      <PostHogAnalyticsProvider>
        <div>child</div>
      </PostHogAnalyticsProvider>,
    );

    expect(
      screen.getByRole("complementary", {
        name: "Help improve PlankMarket",
      }),
    ).toBeInTheDocument();
    expect(mocks.initPostHog).not.toHaveBeenCalled();
    expect(screen.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
  });

  it("revokes analytics when fetched server preferences override consent to denied", async () => {
    currentUser = {
      id: "buyer-1",
      role: "buyer",
    };
    currentPreference = true;
    currentIsFetched = true;

    const { rerender } = render(
      <PostHogAnalyticsProvider>
        <div>child</div>
      </PostHogAnalyticsProvider>,
    );

    await waitFor(() => {
      expect(mocks.initPostHog).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("vercel-analytics")).toBeInTheDocument();

    currentPreference = false;
    rerender(
      <PostHogAnalyticsProvider>
        <div>child</div>
      </PostHogAnalyticsProvider>,
    );

    await waitFor(() => {
      expect(mocks.posthogClient.reset).toHaveBeenCalledTimes(1);
      expect(mocks.posthogClient.opt_out_capturing).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("vercel-analytics")).not.toBeInTheDocument();
  });

  it("persists explicit consent for signed-in users without sharing it through the browser", async () => {
    currentUser = {
      id: "seller-1",
      role: "seller",
    };

    render(
      <PostHogAnalyticsProvider>
        <div>child</div>
      </PostHogAnalyticsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Allow analytics" }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        enabled: true,
      });
      expect(mocks.refetch).toHaveBeenCalledTimes(1);
    });
    expect(window.localStorage.getItem("plankmarket.analytics-consent")).toBeNull();
  });

  it("ignores shared-browser consent and persists an admin decision to the account", async () => {
    currentUser = {
      id: "admin-1",
      role: "admin",
    };
    currentPreference = null;
    window.localStorage.setItem("plankmarket.analytics-consent", "granted");

    render(
      <PostHogAnalyticsProvider>
        <div>admin child</div>
      </PostHogAnalyticsProvider>,
    );

    expect(mocks.initPostHog).not.toHaveBeenCalled();
    window.localStorage.removeItem("plankmarket.analytics-consent");
    fireEvent.click(screen.getByRole("button", { name: "Allow analytics" }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        enabled: true,
      });
      expect(mocks.refetch).toHaveBeenCalledTimes(1);
    });
    expect(window.localStorage.getItem("plankmarket.analytics-consent")).toBeNull();
  });

  it("does not persist a local grant when the account preference save fails", async () => {
    currentUser = {
      id: "buyer-1",
      role: "buyer",
    };
    mocks.mutateAsync.mockRejectedValueOnce(new Error("save failed"));
    mocks.usePreferencesMutation.mockReturnValue({
      mutateAsync: mocks.mutateAsync,
      isPending: false,
      isError: true,
    });

    render(
      <PostHogAnalyticsProvider>
        <div>child</div>
      </PostHogAnalyticsProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Allow analytics" }));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(window.localStorage.getItem("plankmarket.analytics-consent")).toBe(
      null,
    );
    expect(
      screen.getByText("We could not save that choice. Please try again."),
    ).toBeInTheDocument();
    expect(mocks.initPostHog).not.toHaveBeenCalled();
  });
});
