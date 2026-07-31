import { describe, expect, it, vi } from "vitest";
import { validateThenCompareDeletePair } from "@/server/services/verified-artifact-consumption";

describe("validateThenCompareDeletePair", () => {
  it("does not consume either shipping artifact when tax validation fails", async () => {
    const evalCall = vi.fn(async () => 1);
    const taxFailure = new Error("No active Stripe Tax registration");

    await expect(
      validateThenCompareDeletePair({
        redisClient: { eval: evalCall },
        firstKey: "shipping-quote-token:quote-token",
        firstExpectedValue: '{"quote":1}',
        secondKey: "shipping-booking:quote-1",
        secondExpectedValue: '{"snapshot":1}',
        validate: async () => {
          throw taxFailure;
        },
      }),
    ).rejects.toBe(taxFailure);

    expect(evalCall).not.toHaveBeenCalled();
  });

  it("returns validation output only after the compare-and-delete succeeds", async () => {
    const evalCall = vi.fn(async () => 1);

    const result = await validateThenCompareDeletePair({
      redisClient: { eval: evalCall },
      firstKey: "quote",
      firstExpectedValue: "quote-value",
      secondKey: "snapshot",
      secondExpectedValue: "snapshot-value",
      validate: async () => ({ taxCalculationId: "taxcalc_123" }),
    });

    expect(result).toEqual({
      consumed: true,
      validationResult: { taxCalculationId: "taxcalc_123" },
    });
    expect(evalCall).toHaveBeenCalledOnce();
  });
});
