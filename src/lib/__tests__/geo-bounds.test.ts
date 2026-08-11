import { describe, expect, it } from "vitest";
import { getBoundingBoxForRadius } from "../geo-bounds";

describe("getBoundingBoxForRadius", () => {
  it("returns a single longitude range for ordinary searches", () => {
    const bounds = getBoundingBoxForRadius(
      { latitude: 39.7392, longitude: -104.9903 },
      100,
    );

    expect(bounds.minLatitude).toBeLessThan(39.7392);
    expect(bounds.maxLatitude).toBeGreaterThan(39.7392);
    expect(bounds.longitudeRanges).toHaveLength(1);
    expect(bounds.longitudeRanges[0]!.minLongitude).toBeLessThan(-104.9903);
    expect(bounds.longitudeRanges[0]!.maxLongitude).toBeGreaterThan(-104.9903);
  });

  it("splits longitude ranges when the box crosses the antimeridian eastward", () => {
    const bounds = getBoundingBoxForRadius(
      { latitude: 0, longitude: 179.6 },
      150,
    );

    expect(bounds.longitudeRanges).toEqual([
      expect.objectContaining({
        minLongitude: expect.any(Number),
        maxLongitude: 180,
      }),
      expect.objectContaining({
        minLongitude: -180,
        maxLongitude: expect.any(Number),
      }),
    ]);
    expect(bounds.longitudeRanges[0]!.minLongitude).toBeGreaterThan(170);
    expect(bounds.longitudeRanges[1]!.maxLongitude).toBeLessThan(-170);
  });

  it("drops longitude filtering when the search radius reaches a pole", () => {
    const bounds = getBoundingBoxForRadius(
      { latitude: 89.7, longitude: 45 },
      100,
    );

    expect(bounds.maxLatitude).toBe(90);
    expect(bounds.longitudeRanges).toEqual([
      { minLongitude: -180, maxLongitude: 180 },
    ]);
  });

  it("covers the full globe for very large radii", () => {
    const bounds = getBoundingBoxForRadius(
      { latitude: 12, longitude: -45 },
      20_000,
    );

    expect(bounds).toEqual({
      minLatitude: -90,
      maxLatitude: 90,
      longitudeRanges: [{ minLongitude: -180, maxLongitude: 180 }],
    });
  });
});
