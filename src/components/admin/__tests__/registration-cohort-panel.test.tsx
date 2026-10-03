import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RegistrationCohortPanel } from "../registration-cohort-panel";
afterEach(cleanup);
describe("registration cohort presentation", () => {
  it("labels confirmed and unknown completion without claiming conversion", () => {
    render(<RegistrationCohortPanel cohort={{ windowDays: 30, profilesCreated: 5, receiptConfirmed: 2, completionUnknown: 3, originalBuyers: 1, originalSellers: 1 }} />);
    expect(screen.getByRole("heading", { name: "Registration coverage" })).toBeInTheDocument();
    expect(screen.getByText("Profiles created")).toBeInTheDocument();
    expect(screen.getByText("Registration confirmed")).toBeInTheDocument();
    expect(screen.getByText("Completion unknown")).toBeInTheDocument();
    expect(screen.getByText(/legacy profiles or unresolved account setup/i)).toBeInTheDocument();
    expect(screen.queryByText(/conversion rate/i)).not.toBeInTheDocument();
  });
  it("shows an empty cohort without manufacturing a success rate", () => {
    render(<RegistrationCohortPanel cohort={{ windowDays: 30, profilesCreated: 0, receiptConfirmed: 0, completionUnknown: 0, originalBuyers: 0, originalSellers: 0 }} />);
    expect(screen.getByText("No new profiles in this period.")).toBeInTheDocument();
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  });
});
