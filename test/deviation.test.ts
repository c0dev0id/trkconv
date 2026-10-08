import { describe, expect, it } from "vitest";
import { deviations, offRouteShare, offRuns } from "../src/lib/deviation";
import type { LngLat } from "../src/lib/geo";

describe("deviations", () => {
  // Route along the equator, ~1.1 km long.
  const route: LngLat[] = [[0, 0], [0.01, 0]];

  it("is ~0 for points on the route", () => {
    const dev = deviations([[0.005, 0]], route, 200);
    expect(dev[0]).toBeLessThan(0.01);
  });
  it("measures perpendicular offsets", () => {
    // 0.0005 deg of latitude is ~55.6 m.
    const dev = deviations([[0.005, 0.0005]], route, 200);
    expect(dev[0]).toBeCloseTo(55.6, 0);
  });
  it("caps far points", () => {
    expect(deviations([[0.005, 0.01]], route, 200)).toEqual([200]);
  });
  it("finds long segments spanning many grid cells", () => {
    const long: LngLat[] = [[0, 0], [1, 0]];
    expect(deviations([[0.5, 0.0001]], long, 50)[0]).toBeCloseTo(11.1, 0);
  });
  it("returns the cap without a route", () => {
    expect(deviations([[0, 0]], [], 100)).toEqual([100]);
  });
});

describe("offRouteShare", () => {
  it("counts segments whose both ends are off-route", () => {
    expect(offRouteShare([0, 10, 20, 30, 40], [0, 50, 50, 0, 0], 25)).toBeCloseTo(0.25);
  });
  it("is zero for an empty track", () => {
    expect(offRouteShare([0], [0], 25)).toBe(0);
  });
});

describe("offRuns", () => {
  it("returns the segments touching an off point", () => {
    expect(offRuns(["a", "b", "c", "d", "e", "f", "g"], [0, 50, 50, 0, 0, 50, 0], 25)).toEqual([
      ["a", "b", "c", "d"],
      ["e", "f", "g"],
    ]);
  });
  it("catches a spur with a single off vertex", () => {
    expect(offRuns(["a", "b", "a"], [0, 50, 0], 25)).toEqual([["a", "b", "a"]]);
  });
  it("returns nothing when everything is within tolerance", () => {
    expect(offRuns(["a", "b"], [0, 10], 25)).toEqual([]);
  });
});
