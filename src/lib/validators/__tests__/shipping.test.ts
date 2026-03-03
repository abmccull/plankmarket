import { describe, it, expect } from "vitest";
import { getShippingQuotesSchema } from "../shipping";
import {
  createShippingAddressSchema,
  updateShippingAddressSchema,
} from "../shipping-address";

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

describe("getShippingQuotesSchema", () => {
  it("accepts valid input with required fields only", () => {
    const result = getShippingQuotesSchema.safeParse({
      listingId: VALID_UUID,
      destinationZip: "90210",
      quantitySqFt: 100,
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID listingId", () => {
    const result = getShippingQuotesSchema.safeParse({
      listingId: "not-a-uuid",
      destinationZip: "90210",
      quantitySqFt: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects destinationZip shorter than 5 characters", () => {
    const result = getShippingQuotesSchema.safeParse({
      listingId: VALID_UUID,
      destinationZip: "9021",
      quantitySqFt: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantitySqFt", () => {
    const result = getShippingQuotesSchema.safeParse({
      listingId: VALID_UUID,
      destinationZip: "90210",
      quantitySqFt: -5,
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid input with manual overrides", () => {
    const result = getShippingQuotesSchema.safeParse({
      listingId: VALID_UUID,
      destinationZip: "90210",
      quantitySqFt: 250,
      overrideOriginZip: "30301",
      overridePalletWeight: 1200,
      overridePalletLength: 48,
      overridePalletWidth: 40,
      overridePalletHeight: 60,
    });
    expect(result.success).toBe(true);
  });
});

describe("createShippingAddressSchema", () => {
  const validAddress = {
    label: "Home",
    name: "John Doe",
    address: "123 Main Street",
    city: "Atlanta",
    state: "GA",
    zip: "30301",
  };

  it("accepts valid input with all required fields", () => {
    const result = createShippingAddressSchema.safeParse(validAddress);
    expect(result.success).toBe(true);
  });

  it("rejects missing label", () => {
    const { label: _, ...withoutLabel } = validAddress;
    const result = createShippingAddressSchema.safeParse(withoutLabel);
    expect(result.success).toBe(false);
  });

  it("rejects state that is not exactly 2 characters", () => {
    const result = createShippingAddressSchema.safeParse({
      ...validAddress,
      state: "Georgia",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateShippingAddressSchema", () => {
  it("accepts a partial update with only label", () => {
    const result = updateShippingAddressSchema.safeParse({
      id: VALID_UUID,
      label: "Office",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID id", () => {
    const result = updateShippingAddressSchema.safeParse({
      id: "bad-id",
      label: "Office",
    });
    expect(result.success).toBe(false);
  });
});
