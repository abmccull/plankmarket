import { describe, expect, it } from "vitest";
import { shouldAutoRedirectFromMfa } from "@/lib/auth/mfa-page-state";

describe("shouldAutoRedirectFromMfa", () => {
  it("redirects when the page is satisfying an assurance redirect with fresh AAL2", () => {
    expect(
      shouldAutoRedirectFromMfa({
        currentLevel: "aal2",
        recentVerificationSatisfied: true,
        next: "/seller/payments",
        intent: null,
      }),
    ).toBe(true);
  });

  it("does not redirect when the recent-auth window has expired", () => {
    expect(
      shouldAutoRedirectFromMfa({
        currentLevel: "aal2",
        recentVerificationSatisfied: false,
        next: "/seller/payments",
        intent: null,
      }),
    ).toBe(false);
  });

  it("does not redirect explicit manage visits even when AAL2 is fresh", () => {
    expect(
      shouldAutoRedirectFromMfa({
        currentLevel: "aal2",
        recentVerificationSatisfied: true,
        next: "/seller/settings",
        intent: "manage",
      }),
    ).toBe(false);
  });

  it("does not redirect when the session is not yet AAL2", () => {
    expect(
      shouldAutoRedirectFromMfa({
        currentLevel: "aal1",
        recentVerificationSatisfied: false,
        next: "/admin",
        intent: null,
      }),
    ).toBe(false);
  });
});
