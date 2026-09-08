import { describe, it, expect } from "vitest";
import { checkoutAttemptKey, persistCheckoutAttempt, readCheckoutAttempt, type CheckoutAttempt } from "../checkout-attempt";
const id = "11111111-1111-4111-8111-111111111111";
const attempt: CheckoutAttempt = { mode: "direct", input: { requestId: id, listingId: id, quantitySqFt: 100,
  shippingName: "Buyer Name", shippingAddress: "123 Main Street", shippingCity: "Denver", shippingState: "CO", shippingZip: "80202", selectedQuoteToken: "verified-token" } };
function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
describe("saved checkout recovery", () => {
  it("recovers the exact payload after reload and retains it across retries", () => {
    const s = storage(); const key = checkoutAttemptKey("buyer", id, null);
    expect(persistCheckoutAttempt(s, key, attempt)).toEqual(attempt);
    expect(readCheckoutAttempt(s, key)).toEqual(attempt);
    expect(persistCheckoutAttempt(s, key, { ...attempt, input: { ...attempt.input, quantitySqFt: 200 } })).toEqual(attempt);
  });
  it("isolates buyers and direct versus accepted-offer attempts", () => {
    const s = storage(); persistCheckoutAttempt(s, checkoutAttemptKey("buyer-a", id, null), attempt);
    expect(readCheckoutAttempt(s, checkoutAttemptKey("buyer-b", id, null))).toBeNull();
    expect(readCheckoutAttempt(s, checkoutAttemptKey("buyer-a", id, id))).toBeNull();
  });
  it("fails visibly instead of starting a new order when saved data is corrupt", () => {
    const s = storage(); s.setItem("key", "invalid");
    expect(() => readCheckoutAttempt(s, "key")).toThrow();
  });
  it("does not return a submit-ready attempt if durable local saving fails", () => {
    expect(() => persistCheckoutAttempt({ getItem: () => null, setItem: () => { throw new Error("storage unavailable"); } }, "key", attempt)).toThrow("storage unavailable");
  });
});
