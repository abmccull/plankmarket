import { describe, expect, it } from "vitest";
import {
  captureTaxPolicy,
  getTaxPolicyReadinessIssues,
  isVerifiedStripeTaxCode,
  type TaxPolicy,
} from "@/lib/tax-policy";

const enabledPolicy: TaxPolicy = {
  mode: "platform_liable",
  version: 3,
  legalDecisionAcknowledged: true,
  legalDecisionReference: "counsel-memo-2026-07-30",
  shippingTaxCode: "txcd_92010001",
  buyerFeeTreatment: "excluded",
  buyerFeeTaxCode: null,
};

describe("tax policy", () => {
  it("keeps disabled environments explicit and versioned", () => {
    const snapshot = captureTaxPolicy(
      {
        ...enabledPolicy,
        mode: "disabled",
        legalDecisionAcknowledged: false,
        legalDecisionReference: null,
        shippingTaxCode: null,
        buyerFeeTreatment: "undecided",
      },
      new Date("2026-07-30T12:00:00.000Z"),
    );

    expect(snapshot).toMatchObject({
      mode: "disabled",
      liabilityOwner: "none",
      capturedAt: "2026-07-30T12:00:00.000Z",
      connectedAccountFlowStatus: "not_applicable",
    });
  });

  it("fails an enabled policy until liability, freight, and fee decisions are explicit", () => {
    const issues = getTaxPolicyReadinessIssues({
      ...enabledPolicy,
      legalDecisionAcknowledged: false,
      legalDecisionReference: null,
      shippingTaxCode: null,
      buyerFeeTreatment: "undecided",
    });

    expect(issues.join(" ")).toContain("legalDecisionAcknowledged");
    expect(issues.join(" ")).toContain("legalDecisionReference");
    expect(issues.join(" ")).toContain("shippingTaxCode");
    expect(issues.join(" ")).toContain("buyerFeeTreatment");
  });

  it("requires an explicit fee tax code when legal policy marks the fee taxable", () => {
    expect(
      getTaxPolicyReadinessIssues({
        ...enabledPolicy,
        buyerFeeTreatment: "taxable",
        buyerFeeTaxCode: null,
      }).join(" "),
    ).toContain("buyerFeeTaxCode");
  });

  it("accepts a listing code only after admin verification", () => {
    expect(
      isVerifiedStripeTaxCode({
        code: "txcd_99999999",
        status: "verified",
      }),
    ).toBe(true);
    expect(
      isVerifiedStripeTaxCode({
        code: "txcd_99999999",
        status: "pending_review",
      }),
    ).toBe(false);
    expect(
      isVerifiedStripeTaxCode({ code: "flooring", status: "verified" }),
    ).toBe(false);
  });
});
