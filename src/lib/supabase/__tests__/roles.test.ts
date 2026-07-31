import { describe, expect, it } from "vitest";
import { resolveRole } from "@/lib/supabase/roles";

describe("resolveRole", () => {
  it("uses only server-controlled app_metadata", () => {
    expect(
      resolveRole({
        app_metadata: { role: "seller" },
      }),
    ).toBe("seller");

    expect(
      resolveRole({
        app_metadata: {},
        // Deliberately supplied through structural typing to prove it is ignored.
        user_metadata: { role: "admin" },
      } as { app_metadata: Record<string, unknown> }),
    ).toBeNull();
  });

  it("fails closed for unknown app roles", () => {
    expect(resolveRole({ app_metadata: { role: "superadmin" } })).toBeNull();
    expect(resolveRole({ app_metadata: {} })).toBeNull();
    expect(resolveRole(null)).toBeNull();
  });
});
