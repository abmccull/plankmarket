import { describe, expect, it } from "vitest";
import {
  maskEmail,
  maskPhone,
  maskUserForOrder,
} from "../contact-masking";

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
  it("fully redacts legacy partial-contact helpers", () => {
    expect(maskEmail(counterparty.email)).toBe("Hidden until delivery");
    expect(maskPhone(counterparty.phone)).toBe("Hidden until delivery");
  });

  it.each([
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "cancelled",
    "refunded",
  ])("does not leak identity or contact in the %s state", (status) => {
    const masked = maskUserForOrder(counterparty, status, false);

    expect(masked).toEqual({
      id: counterparty.id,
      name: expect.stringMatching(/^Verified Seller PM-[A-Z0-9]{5}$/),
      businessName: null,
      email: null,
      phone: null,
    });
    expect(JSON.stringify(masked)).not.toContain("Real");
    expect(JSON.stringify(masked)).not.toContain("Portland");
    expect(JSON.stringify(masked)).not.toContain("example.com");
    expect(JSON.stringify(masked)).not.toContain("4567");
  });

  it("uses a platform label for admins without exposing their profile", () => {
    expect(
      maskUserForOrder({ ...counterparty, role: "admin" }, "pending", false),
    ).toMatchObject({
      name: "PlankMarket Support",
      email: null,
      phone: null,
    });
  });

  it("gives different pending counterparties stable opaque labels", () => {
    const first = maskUserForOrder(counterparty, "pending", false);
    const second = maskUserForOrder(
      { ...counterparty, id: "user-2" },
      "pending",
      false,
    );

    expect(first.name).toBe(
      maskUserForOrder(counterparty, "pending", false).name,
    );
    expect(first.name).not.toBe(second.name);
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
