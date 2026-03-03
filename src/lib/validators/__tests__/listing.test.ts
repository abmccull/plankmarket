import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/content-filter/index", () => ({
  analyzeContent: () => ({
    allowed: true,
    detections: [],
    highConfidenceDetections: [],
  }),
  getBlockedContentMessage: () => "Blocked",
}));

import { listingFormSchema, listingFilterSchema } from "../listing";
import {
  step1Schema,
  step2Schema,
  step3Schema,
  step5Schema,
  validateStep,
} from "../listing-steps";

// ---------------------------------------------------------------------------
// step1Schema
// ---------------------------------------------------------------------------
describe("step1Schema", () => {
  const validStep1 = {
    title: "Red Oak Hardwood Flooring",
    materialType: "hardwood" as const,
  };

  it("accepts valid input", () => {
    const result = step1Schema.safeParse(validStep1);
    expect(result.success).toBe(true);
  });

  it("rejects a title shorter than 5 characters", () => {
    const result = step1Schema.safeParse({ ...validStep1, title: "Oak" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const titleError = result.error.issues.find((i) =>
        i.path.includes("title"),
      );
      expect(titleError).toBeDefined();
    }
  });

  it("rejects an invalid material type", () => {
    const result = step1Schema.safeParse({
      ...validStep1,
      materialType: "marble",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// step2Schema
// ---------------------------------------------------------------------------
describe("step2Schema", () => {
  const validStep2 = {
    totalSqFt: 5000,
    totalPallets: 10,
    palletWeight: 2000,
    palletLength: 48,
    palletWidth: 40,
    palletHeight: 60,
  };

  it("accepts valid input", () => {
    const result = step2Schema.safeParse(validStep2);
    expect(result.success).toBe(true);
  });

  it("rejects zero totalSqFt", () => {
    const result = step2Schema.safeParse({ ...validStep2, totalSqFt: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects palletWeight exceeding 5000", () => {
    const result = step2Schema.safeParse({
      ...validStep2,
      palletWeight: 5001,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const weightError = result.error.issues.find((i) =>
        i.path.includes("palletWeight"),
      );
      expect(weightError).toBeDefined();
    }
  });

  it("rejects palletHeight exceeding 120", () => {
    const result = step2Schema.safeParse({
      ...validStep2,
      palletHeight: 121,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const heightError = result.error.issues.find((i) =>
        i.path.includes("palletHeight"),
      );
      expect(heightError).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// step3Schema
// ---------------------------------------------------------------------------
describe("step3Schema", () => {
  const validStep3 = {
    askPricePerSqFt: 3.5,
  };

  it("accepts valid input", () => {
    const result = step3Schema.safeParse(validStep3);
    expect(result.success).toBe(true);
  });

  it("rejects price exceeding 1000", () => {
    const result = step3Schema.safeParse({ askPricePerSqFt: 1001 });
    expect(result.success).toBe(false);
  });

  it("rejects zero price", () => {
    const result = step3Schema.safeParse({ askPricePerSqFt: 0 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// step5Schema
// ---------------------------------------------------------------------------
describe("step5Schema", () => {
  it("rejects an empty photos array", () => {
    const result = step5Schema.safeParse({ photos: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const photosError = result.error.issues.find((i) =>
        i.path.includes("photos"),
      );
      expect(photosError).toBeDefined();
    }
  });

  it("rejects more than 20 photos", () => {
    const photos = Array.from({ length: 21 }, (_, i) => `photo-${i}.jpg`);
    const result = step5Schema.safeParse({ photos });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateStep()
// ---------------------------------------------------------------------------
describe("validateStep", () => {
  it("returns success for valid step 1 data", () => {
    const result = validateStep(1, {
      title: "Red Oak Hardwood Flooring",
      materialType: "hardwood",
    });
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it("returns field-level errors for invalid step 1 data", () => {
    const result = validateStep(1, {
      title: "Oak",
      materialType: "marble",
    });
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.title).toBeDefined();
    expect(result.errors!.materialType).toBeDefined();
  });

  it("returns an error for an invalid step number", () => {
    const result = validateStep(99, {});
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.general).toBe("Invalid step number");
  });
});
