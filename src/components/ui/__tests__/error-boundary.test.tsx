import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  readAnalyticsConsent: vi.fn(),
  sanitizeAnalyticsProperties: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: {
    captureException: mocks.captureException,
  },
}));

vi.mock("@/lib/analytics/privacy", () => ({
  readAnalyticsConsent: mocks.readAnalyticsConsent,
  sanitizeAnalyticsProperties: mocks.sanitizeAnalyticsProperties,
}));

const { ErrorBoundary } = await import("../error-boundary");

function Thrower(): ReactNode {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    mocks.sanitizeAnalyticsProperties.mockReturnValue({
      componentStack: "[redacted]",
    });
  });

  it("does not capture exceptions when analytics consent is not granted", async () => {
    mocks.readAnalyticsConsent.mockReturnValue("denied");

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("captures sanitized exception details only after explicit analytics consent", async () => {
    mocks.readAnalyticsConsent.mockReturnValue("granted");

    render(
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    expect(mocks.sanitizeAnalyticsProperties).toHaveBeenCalledWith({
      componentStack: expect.any(String),
    });
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "boom" }),
      {
        componentStack: "[redacted]",
      },
    );
  });
});
