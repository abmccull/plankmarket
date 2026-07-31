import { describe, expect, it } from "vitest";
import { verificationResultSchema } from "@/server/services/verification-result";

const validChecks = {
  einFormat: { pass: true, note: "Valid format" },
  websiteAnalysis: { pass: true, note: "Consistent" },
  documentAnalysis: { pass: true, note: "Document present" },
  crossReference: { pass: true, note: "Details match" },
  redFlags: { found: false, note: "None" },
};

describe("verificationResultSchema", () => {
  it("accepts a bounded, internally consistent advisory result", () => {
    expect(
      verificationResultSchema.parse({
        score: 95,
        approved: true,
        reasoning: "Evidence is consistent.",
        checks: validChecks,
      }),
    ).toMatchObject({ score: 95, approved: true });
  });

  it("rejects out-of-range and threshold-inconsistent model output", () => {
    expect(
      verificationResultSchema.safeParse({
        score: 101,
        approved: true,
        reasoning: "Invalid.",
        checks: validChecks,
      }).success,
    ).toBe(false);
    expect(
      verificationResultSchema.safeParse({
        score: 40,
        approved: true,
        reasoning: "Inconsistent.",
        checks: validChecks,
      }).success,
    ).toBe(false);
  });
});
