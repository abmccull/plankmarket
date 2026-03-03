import { describe, it, expect } from "vitest";
import {
  createOrderSchema,
  updateOrderStatusSchema,
  createOrderFromOfferSchema,
} from "../order";

const VALID_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const validCreateOrderInput = {
  listingId: VALID_UUID,
  quantitySqFt: 100,
  shippingName: "John Doe",
  shippingAddress: "123 Main Street",
  shippingCity: "Portland",
  shippingState: "OR",
  shippingZip: "97201",
};

describe("createOrderSchema", () => {
  it("accepts valid input", () => {
    const result = createOrderSchema.safeParse(validCreateOrderInput);
    expect(result.success).toBe(true);
  });

  it("rejects missing listingId", () => {
    const { listingId: _, ...input } = validCreateOrderInput;
    const result = createOrderSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID listingId", () => {
    const result = createOrderSchema.safeParse({
      ...validCreateOrderInput,
      listingId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero quantity", () => {
    const result = createOrderSchema.safeParse({
      ...validCreateOrderInput,
      quantitySqFt: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = createOrderSchema.safeParse({
      ...validCreateOrderInput,
      quantitySqFt: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects shipping name shorter than 2 characters", () => {
    const result = createOrderSchema.safeParse({
      ...validCreateOrderInput,
      shippingName: "J",
    });
    expect(result.success).toBe(false);
  });

  it("rejects state that is not exactly 2 characters", () => {
    const tooShort = createOrderSchema.safeParse({
      ...validCreateOrderInput,
      shippingState: "O",
    });
    expect(tooShort.success).toBe(false);

    const tooLong = createOrderSchema.safeParse({
      ...validCreateOrderInput,
      shippingState: "ORE",
    });
    expect(tooLong.success).toBe(false);
  });
});

describe("updateOrderStatusSchema", () => {
  it("accepts valid input", () => {
    const result = updateOrderStatusSchema.safeParse({
      orderId: VALID_UUID,
      status: "shipped",
      trackingNumber: "1Z999AA10123456784",
      carrier: "UPS",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status value", () => {
    const result = updateOrderStatusSchema.safeParse({
      orderId: VALID_UUID,
      status: "refunded",
    });
    expect(result.success).toBe(false);
  });
});

describe("createOrderFromOfferSchema", () => {
  it("accepts valid input", () => {
    const result = createOrderFromOfferSchema.safeParse({
      offerId: VALID_UUID,
      shippingName: "Jane Smith",
      shippingAddress: "456 Oak Avenue",
      shippingCity: "Seattle",
      shippingState: "WA",
      shippingZip: "98101",
    });
    expect(result.success).toBe(true);
  });
});
