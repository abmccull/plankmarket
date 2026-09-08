import { expect, it } from "vitest";
import { aggregateCentsToDollars } from "../financial-display";
it("preserves exact cent totals and rejects corrupt/unsafe aggregates", () => {
  expect(aggregateCentsToDollars("1001")).toBe(10.01);
  expect(aggregateCentsToDollars("0")).toBe(0);
  expect(() => aggregateCentsToDollars("10.2")).toThrow();
  expect(() => aggregateCentsToDollars("9007199254740993")).toThrow();
});
