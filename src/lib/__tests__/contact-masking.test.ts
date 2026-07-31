import { describe, expect, it } from "vitest";
import { maskUserForOrder } from "../contact-masking";

const counterparty = {
  id: "user-1",
  name: "Real Person",
  businessName: "Private Business",
  email: "real@example.com",
  phone: "555-123-4567",
  role: "seller",
  businessCity: "Portland",
  businessState: "OR",
};

describe("maskUserForOrder", () => {
  it("does not return a counterparty's real identity before delivery", () => {
    const masked = maskUserForOrder(counterparty, "confirmed", false);
    expect(masked.name).not.toBe(counterparty.name);
    expect(masked.businessName).toBeNull();
    expect(masked.email).toBeNull();
    expect(masked.phone).toBeNull();
  });

  it("reveals identity after delivery and to admins", () => {
    expect(maskUserForOrder(counterparty, "delivered", false)).toMatchObject({
      name: counterparty.name,
      businessName: counterparty.businessName,
      email: counterparty.email,
      phone: counterparty.phone,
    });
    expect(maskUserForOrder(counterparty, "pending", true).name).toBe(
      counterparty.name,
    );
  });
});
