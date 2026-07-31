import { describe, expect, it } from "vitest";
import {
  isVerificationStatus,
  getChangedVerifiedBusinessFields,
  verificationStateUpdate,
} from "@/server/services/verification-state";

describe("verification state", () => {
  it("keeps the compatibility boolean derived from canonical status", () => {
    expect(verificationStateUpdate("verified")).toEqual({
      verificationStatus: "verified",
      verified: true,
    });
    expect(verificationStateUpdate("pending")).toEqual({
      verificationStatus: "pending",
      verified: false,
    });
    expect(verificationStateUpdate("rejected")).toEqual({
      verificationStatus: "rejected",
      verified: false,
    });
  });

  it("rejects unknown persisted status values", () => {
    expect(isVerificationStatus("verified")).toBe(true);
    expect(isVerificationStatus("approved")).toBe(false);
  });

  it("detects only submitted changes to verified business identity", () => {
    const current = {
      businessName: "Acme Floors",
      businessAddress: "1 Main St",
      businessCity: "Denver",
      businessState: "CO",
      businessZip: "80202",
    };

    expect(
      getChangedVerifiedBusinessFields(current, {
        businessName: "Acme Floors",
        businessCity: "Boulder",
      }),
    ).toEqual(["businessCity"]);
    expect(getChangedVerifiedBusinessFields(current, {})).toEqual([]);
  });
});
