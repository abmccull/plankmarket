import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "@/server/services/audit-ledger";

describe("audit ledger metadata", () => {
  it("redacts common credentials recursively", () => {
    expect(
      sanitizeAuditMetadata({
        provider: "stripe",
        authorization: "Bearer secret",
        nested: {
          apiKey: "secret",
          outcome: "accepted",
        },
      }),
    ).toEqual({
      provider: "stripe",
      authorization: "[redacted]",
      nested: {
        apiKey: "[redacted]",
        outcome: "accepted",
      },
    });
  });

  it("preserves useful error identity without persisting stack traces", () => {
    expect(
      sanitizeAuditMetadata({
        error: new TypeError("provider response was invalid"),
      }),
    ).toEqual({
      error: {
        name: "TypeError",
        message: "provider response was invalid",
      },
    });
  });

  it("rejects oversized metadata", () => {
    expect(() =>
      sanitizeAuditMetadata({ payload: "x".repeat(40_000) }),
    ).toThrow("Audit metadata exceeds the 32 KB safety limit.");
  });
});
