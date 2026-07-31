import { describe, expect, it } from "vitest";
import {
  isPathWithin,
  isProtectedAppPath,
} from "@/lib/supabase/middleware-paths";

describe("middleware route boundaries", () => {
  it.each([
    ["/seller", true],
    ["/seller/orders", true],
    ["/seller-guide", false],
    ["/sellers", false],
    ["/sellers/11111111-1111-4111-8111-111111111111", false],
    ["/buyer", true],
    ["/buyer/orders", true],
    ["/buyers-guide", false],
    ["/admin", true],
    ["/admin/finance", true],
    ["/administrator", false],
  ])("classifies %s without prefix collisions", (pathname, expected) => {
    expect(isProtectedAppPath(pathname)).toBe(expected);
  });

  it("matches only exact route segments", () => {
    expect(isPathWithin("/seller/listings", "/seller")).toBe(true);
    expect(isPathWithin("/seller-guide", "/seller")).toBe(false);
  });
});
