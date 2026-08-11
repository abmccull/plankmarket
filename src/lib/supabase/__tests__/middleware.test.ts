import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.SKIP_ENV_VALIDATION = "1";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mocks.getUser,
      mfa: {
        getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel,
      },
    },
  })),
}));

const { updateSession } = await import("@/lib/supabase/middleware");

describe("updateSession", () => {
  it("redirects anonymous private dashboard routes to login", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await updateSession(
      new NextRequest("https://plankmarket.test/messages?tab=unread"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://plankmarket.test/login?redirect=%2Fmessages%3Ftab%3Dunread",
    );
  });

  it("allows authenticated role users to access explicit MFA recovery", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "auth-seller-1",
          app_metadata: { role: "seller" },
        },
      },
    });

    const response = await updateSession(
      new NextRequest("https://plankmarket.test/account-recovery?reason=mfa"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("still redirects authenticated role users away from non-MFA recovery", async () => {
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "auth-seller-1",
          app_metadata: { role: "seller" },
        },
      },
    });

    const response = await updateSession(
      new NextRequest("https://plankmarket.test/account-recovery"),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://plankmarket.test/seller",
    );
  });
});
