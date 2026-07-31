import { describe, expect, it } from "vitest";
import { parseMutablePlatformSetting } from "@/server/services/platform-settings-policy";

describe("admin platform setting policy", () => {
  it("normalizes supported settings", () => {
    expect(
      parseMutablePlatformSetting("platformName", "  PlankMarket  "),
    ).toBe("PlankMarket");
    expect(
      parseMutablePlatformSetting("escrowReleaseDays", 3),
    ).toBe(3);
  });

  it("rejects unsafe or out-of-range values", () => {
    expect(() =>
      parseMutablePlatformSetting("escrowReleaseDays", 0),
    ).toThrow("Invalid escrowReleaseDays setting");
    expect(() =>
      parseMutablePlatformSetting("supportEmail", "not-an-email"),
    ).toThrow("Invalid supportEmail setting");
  });
});
