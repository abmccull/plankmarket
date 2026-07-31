import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCanonicalAppUrl } from "@/lib/auth/canonical-app-url";

describe("buildCanonicalAppUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the configured deployment origin and ignores any configured path", () => {
    expect(
      buildCanonicalAppUrl(
        "/reset-password",
        "https://app.plankmarket.com/untrusted-base",
      ),
    ).toBe("https://app.plankmarket.com/reset-password");
  });

  it.each(["//evil.example/reset", "https://evil.example/reset", "\\evil"])(
    "rejects non-local callback path %s",
    (path) => {
      expect(() =>
        buildCanonicalAppUrl(path, "https://app.plankmarket.com"),
      ).toThrow(/same-origin absolute path/);
    },
  );

  it("fails closed when production has no canonical origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    expect(() => buildCanonicalAppUrl("/reset-password", undefined)).toThrow(
      /NEXT_PUBLIC_APP_URL is required/,
    );
  });

  it("requires HTTPS in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() =>
      buildCanonicalAppUrl("/reset-password", "http://plankmarket.com"),
    ).toThrow(/trusted application origin/);
  });
});
