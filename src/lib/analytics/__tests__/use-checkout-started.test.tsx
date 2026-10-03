import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AnalyticsConsentContext } from "../consent-context";
import { useCheckoutStartedAnalytics } from "../use-checkout-started";
const mocks = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { capture: mocks.capture } }));
function Harness({ attempt = "attempt-a", quantity = 960 }: { attempt?: string; quantity?: number }) {
  const record = useCheckoutStartedAnalytics();
  return <button onClick={() => record(attempt, { listing_id: "private-listing", seller_id: "private-seller", quantity_sqft: quantity, lot_value: 2400 })}>Continue to freight</button>;
}
describe("checkout started telemetry", () => {
  beforeEach(() => mocks.capture.mockReset());
  it("requires resolved consent and counts an attempt once", () => {
    const { rerender } = render(<AnalyticsConsentContext.Provider value="denied"><Harness /></AnalyticsConsentContext.Provider>);
    fireEvent.click(screen.getByRole("button"));
    expect(mocks.capture).not.toHaveBeenCalled();
    rerender(<AnalyticsConsentContext.Provider value="granted"><Harness /></AnalyticsConsentContext.Provider>);
    fireEvent.click(screen.getByRole("button")); fireEvent.click(screen.getByRole("button"));
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    expect(mocks.capture).toHaveBeenCalledWith("checkout_started", { listing_id: "[redacted]", seller_id: "[redacted]", quantity_sqft: 960, lot_value: 2400 });
    rerender(<AnalyticsConsentContext.Provider value="granted"><Harness attempt="attempt-b" /></AnalyticsConsentContext.Provider>);
    fireEvent.click(screen.getByRole("button"));
    expect(mocks.capture).toHaveBeenCalledTimes(2);
  });
  it("ignores uninitialized quantities", () => {
    render(<AnalyticsConsentContext.Provider value="granted"><Harness quantity={0} /></AnalyticsConsentContext.Provider>);
    fireEvent.click(screen.getByRole("button")); expect(mocks.capture).not.toHaveBeenCalled();
  });
});
