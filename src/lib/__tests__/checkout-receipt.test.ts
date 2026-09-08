import { describe, expect, it } from "vitest";
import { checkoutReceiptState } from "../checkout-receipt";

describe("authoritative checkout receipt", () => {
  it.each(["pending", "processing", "failed", "reconciliation_required", "refund_pending", "partially_refunded", "refunded", "paid"])("does not claim %s is confirmed payment", (paymentStatus) => {
    expect(checkoutReceiptState({status: "pending", paymentStatus}).paid).toBe(false);
  });
  it("confirms only succeeded and stops polling", () => {
    expect(checkoutReceiptState({status: "confirmed", paymentStatus: "succeeded"})).toMatchObject({paid: true, poll: false});
  });
  it("does not celebrate a cancelled or reconciliation order", () => {
    expect(checkoutReceiptState({status: "cancelled", paymentStatus: "succeeded"}).paid).toBe(false);
    expect(checkoutReceiptState({status: "confirmed", paymentStatus: "succeeded", taxStatus: "reconciliation_required"}).paid).toBe(false);
  });
  it.each(["pending", "processing"])("polls unresolved %s", paymentStatus => {
    expect(checkoutReceiptState({status: "pending", paymentStatus}).poll).toBe(true);
  });
});
