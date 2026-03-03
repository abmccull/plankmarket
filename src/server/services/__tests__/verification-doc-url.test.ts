// src/server/services/__tests__/verification-doc-url.test.ts
//
// Tests the verification document URL validation logic.
// Covers protocol enforcement, credential blocking, port restrictions,
// wildcard host matching, and allowlist enforcement.

import { describe, it, expect, vi } from "vitest";

vi.mock("@/env", () => ({
  env: {
    VERIFICATION_DOC_ALLOWED_HOSTS:
      "s3.amazonaws.com,*.supabase.co,example.com",
  },
}));

import {
  getAllowedVerificationDocHosts,
  validateVerificationDocUrl,
} from "../verification-doc-url";

// ---------------------------------------------------------------------------
// getAllowedVerificationDocHosts
// ---------------------------------------------------------------------------
describe("getAllowedVerificationDocHosts", () => {
  it("returns the parsed list of allowed hosts", () => {
    const hosts = getAllowedVerificationDocHosts();
    expect(hosts).toEqual([
      "s3.amazonaws.com",
      "*.supabase.co",
      "example.com",
    ]);
  });
});

// ---------------------------------------------------------------------------
// validateVerificationDocUrl — valid URLs
// ---------------------------------------------------------------------------
describe("validateVerificationDocUrl — valid URLs", () => {
  it("accepts a valid HTTPS URL from an allowed host", () => {
    const result = validateVerificationDocUrl(
      "https://s3.amazonaws.com/bucket/doc.pdf",
    );
    expect(result.ok).toBe(true);
    expect(result.parsedUrl).toBeDefined();
    expect(result.parsedUrl!.hostname).toBe("s3.amazonaws.com");
  });

  it("accepts a valid HTTPS URL on an exact allowed host", () => {
    const result = validateVerificationDocUrl(
      "https://example.com/docs/file.pdf",
    );
    expect(result.ok).toBe(true);
    expect(result.parsedUrl).toBeDefined();
  });

  it("accepts a wildcard subdomain match (foo.supabase.co)", () => {
    const result = validateVerificationDocUrl(
      "https://foo.supabase.co/storage/v1/object/doc.pdf",
    );
    expect(result.ok).toBe(true);
    expect(result.parsedUrl).toBeDefined();
  });

  it("accepts the root domain for a wildcard entry (supabase.co)", () => {
    const result = validateVerificationDocUrl(
      "https://supabase.co/some/path",
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a URL with explicit port 443", () => {
    const result = validateVerificationDocUrl(
      "https://s3.amazonaws.com:443/bucket/doc.pdf",
    );
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateVerificationDocUrl — rejected URLs
// ---------------------------------------------------------------------------
describe("validateVerificationDocUrl — rejected URLs", () => {
  it("rejects an HTTP URL", () => {
    const result = validateVerificationDocUrl(
      "http://s3.amazonaws.com/bucket/doc.pdf",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/HTTPS/i);
  });

  it("rejects a URL with credentials", () => {
    const result = validateVerificationDocUrl(
      "https://user:pass@s3.amazonaws.com/bucket/doc.pdf",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/credentials/i);
  });

  it("rejects a URL with a non-443 port", () => {
    const result = validateVerificationDocUrl(
      "https://s3.amazonaws.com:8443/bucket/doc.pdf",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/port/i);
  });

  it("rejects a non-allowlisted host", () => {
    const result = validateVerificationDocUrl(
      "https://evil.com/malware.exe",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not allowed/i);
  });

  it("rejects an empty string", () => {
    const result = validateVerificationDocUrl("");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Invalid/i);
  });

  it("rejects a malformed URL (not a URL)", () => {
    const result = validateVerificationDocUrl("not-a-url-at-all");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Invalid/i);
  });

  it("rejects a relative path", () => {
    const result = validateVerificationDocUrl("/some/relative/path");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Invalid/i);
  });

  it("rejects localhost (not in allowlist)", () => {
    const result = validateVerificationDocUrl(
      "https://localhost/doc.pdf",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not allowed/i);
  });

  it("rejects a subdomain of a non-wildcard host (sub.example.com)", () => {
    const result = validateVerificationDocUrl(
      "https://sub.example.com/doc.pdf",
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not allowed/i);
  });
});

// ---------------------------------------------------------------------------
// validateVerificationDocUrl — empty allowlist
// ---------------------------------------------------------------------------
describe("validateVerificationDocUrl — empty allowlist", () => {
  it("rejects when no allowlist is configured", async () => {
    // Reset module registry so the re-import evaluates fresh
    vi.resetModules();

    vi.doMock("@/env", () => ({
      env: {
        VERIFICATION_DOC_ALLOWED_HOSTS: "",
      },
    }));

    const { validateVerificationDocUrl: validate } = await import(
      "../verification-doc-url"
    );
    const result = validate("https://s3.amazonaws.com/bucket/doc.pdf");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not configured/i);
  });
});
