import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

const { GET } = await import("./route");

describe("auth callback route", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.plankmarket.com");
    vi.stubEnv("NODE_ENV", "production");
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("redirects to the canonical origin after a successful code exchange", async () => {
    const response = await GET(
      new Request(
        "https://preview.plankmarket.com/auth/callback?code=test-code&next=/seller/payments",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.plankmarket.com/seller/payments",
    );
  });

  it("redirects callback failures to the canonical login origin", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: new Error("callback failed"),
    });

    const response = await GET(
      new Request("https://preview.plankmarket.com/auth/callback?code=test-code"),
    );

    expect(response.headers.get("location")).toBe(
      "https://app.plankmarket.com/login?error=auth_callback_failed",
    );
  });
});
