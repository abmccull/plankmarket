import { describe, expect, it } from "vitest";
import { isTrustedUploadThingFileUrl } from "@/server/security/uploadthing";

describe("isTrustedUploadThingFileUrl", () => {
  it("accepts current and legacy UploadThing CDN URLs matching the key", () => {
    expect(
      isTrustedUploadThingFileUrl(
        "https://example-app.ufs.sh/f/abc123",
        "abc123",
      ),
    ).toBe(true);
    expect(
      isTrustedUploadThingFileUrl("https://utfs.io/f/abc123", "abc123"),
    ).toBe(true);
  });

  it("rejects foreign hosts, insecure URLs, credentials, and key mismatches", () => {
    expect(
      isTrustedUploadThingFileUrl("https://evil.example/f/abc123", "abc123"),
    ).toBe(false);
    expect(
      isTrustedUploadThingFileUrl("http://example-app.ufs.sh/f/abc123", "abc123"),
    ).toBe(false);
    expect(
      isTrustedUploadThingFileUrl(
        "https://user:pass@example-app.ufs.sh/f/abc123",
        "abc123",
      ),
    ).toBe(false);
    expect(
      isTrustedUploadThingFileUrl(
        "https://example-app.ufs.sh/f/other",
        "abc123",
      ),
    ).toBe(false);
  });
});
