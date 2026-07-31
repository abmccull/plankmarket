import { describe, expect, it } from "vitest";
import { sanitizeRedirectPath } from "../safe-redirect";

describe("sanitizeRedirectPath", () => {
  it("preserves a valid same-origin path without normalizing nested query data", () => {
    const path =
      "/buyer/requests/new?notes=Shaw%20Floorte&next=https%3A%2F%2Fdocs.example.com%2Fguide%3Fa%3D1%25202";

    expect(sanitizeRedirectPath(path, null)).toBe(path);
    expect(sanitizeRedirectPath("/account/user@example.com", null)).toBe(
      "/account/user@example.com",
    );
  });

  it.each([
    "https://evil.example/path",
    "javascript:alert(1)",
    "//evil.example/path",
    "///evil.example/path",
    "%2F%2Fevil.example/path",
    "/%2F%2Fevil.example/path",
    "/%252F%252Fevil.example/path",
  ])("rejects external or protocol-relative destination %s", (path) => {
    expect(sanitizeRedirectPath(path, null)).toBeNull();
  });

  it.each([
    "/\\evil.example/path",
    "/path\\segment",
    "/%5Cevil.example/path",
    "/%255Cevil.example/path",
  ])("rejects raw or encoded backslashes in %s", (path) => {
    expect(sanitizeRedirectPath(path, null)).toBeNull();
  });

  it.each([
    "/path\u0000tail",
    "/path\ntail",
    "/path%0Atail",
    "/path%250Atail",
    "/path%7Ftail",
  ])("rejects raw or encoded control characters in %s", (path) => {
    expect(sanitizeRedirectPath(path, null)).toBeNull();
  });

  it("rejects malformed encoding and oversized destinations", () => {
    expect(sanitizeRedirectPath("/path/%E0%A4%A", null)).toBeNull();
    expect(sanitizeRedirectPath(`/${"a".repeat(2_048)}`, null)).toBeNull();
  });

  it("uses the caller-provided fallback", () => {
    expect(sanitizeRedirectPath(null)).toBe("/");
    expect(sanitizeRedirectPath("//evil.example", "/listings")).toBe(
      "/listings",
    );
  });
});
