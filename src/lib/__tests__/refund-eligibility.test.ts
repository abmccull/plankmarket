import { describe, expect, it } from "vitest";
import { getRefundEligibility } from "../refund-eligibility";
const order = { paymentStatus: "succeeded", stripePaymentIntentId: "pi_1", stripeTransferId: null as string | null, totalPrice: 10.10, refundedAmount: 0.10 };
describe("recorded refund eligibility", () => {
  it("permits only full remaining refunds before payout", () => { expect(getRefundEligibility(order)).toMatchObject({ canRefund: true, canPartialRefund: false, remainingCents: 1000 }); });
  it("allows partial after recorded transfer and rejects unpaid or fully refunded balances", () => {
    expect(getRefundEligibility({ ...order, stripeTransferId: "tr_1" }).canPartialRefund).toBe(true);
    expect(getRefundEligibility({ ...order, paymentStatus: "pending" }).canRefund).toBe(false);
    expect(getRefundEligibility({ ...order, refundedAmount: 10.10 }).canRefund).toBe(false);
  });
});
