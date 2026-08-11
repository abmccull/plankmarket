import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsConsentContext } from "../consent-context";
import { useTrack } from "../use-track";

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));

vi.mock("posthog-js", () => ({
  default: { capture: mocks.capture },
}));

function TrackingHarness() {
  const track = useTrack();
  return (
    <button
      type="button"
      onClick={() =>
        track("search_performed", {
          query: "buyer@example.com",
          results_count: 3,
        })
      }
    >
      Track search
    </button>
  );
}

describe("useTrack", () => {
  it("uses resolved account consent instead of browser storage", () => {
    window.localStorage.setItem("plankmarket.analytics-consent", "granted");

    const { rerender } = render(
      <AnalyticsConsentContext.Provider value="denied">
        <TrackingHarness />
      </AnalyticsConsentContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Track search" }));
    expect(mocks.capture).not.toHaveBeenCalled();

    rerender(
      <AnalyticsConsentContext.Provider value="granted">
        <TrackingHarness />
      </AnalyticsConsentContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Track search" }));

    expect(mocks.capture).toHaveBeenCalledWith("search_performed", {
      query: "[redacted]",
      results_count: 3,
    });
  });
});
