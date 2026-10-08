import { describe, expect, it } from "vitest";
import { haversine, makeTrack, pointAtDistance, pointSegmentDistance, segmentIndexAt } from "../src/lib/geo";

describe("haversine", () => {
  it("measures one degree of latitude as ~111.2 km", () => {
    expect(haversine([10, 50], [10, 51])).toBeCloseTo(111195, -1);
  });
  it("is zero for identical points", () => {
    expect(haversine([10, 50], [10, 50])).toBe(0);
  });
});

describe("pointAtDistance", () => {
  const track = makeTrack("t", [
    [0, 0],
    [0, 1],
    [0, 2],
  ]);
  const seg = track.dist[1];

  it("interpolates inside a segment", () => {
    const [lon, lat] = pointAtDistance(track, seg * 1.5);
    expect(lon).toBe(0);
    expect(lat).toBeCloseTo(1.5, 9);
  });
  it("clamps before the start and after the end", () => {
    expect(pointAtDistance(track, -10)).toEqual([0, 0]);
    expect(pointAtDistance(track, seg * 10)).toEqual([0, 2]);
  });
  it("finds the segment containing a distance", () => {
    expect(segmentIndexAt(track.dist, 0)).toBe(0);
    expect(segmentIndexAt(track.dist, seg)).toBe(1);
    expect(segmentIndexAt(track.dist, seg * 1.99)).toBe(1);
  });
});

describe("pointSegmentDistance", () => {
  it("uses the perpendicular inside the segment", () => {
    expect(pointSegmentDistance([5, 3], [0, 0], [10, 0])).toBe(3);
  });
  it("uses the nearest endpoint outside the segment", () => {
    expect(pointSegmentDistance([13, 4], [0, 0], [10, 0])).toBe(5);
  });
  it("handles degenerate segments", () => {
    expect(pointSegmentDistance([3, 4], [0, 0], [0, 0])).toBe(5);
  });
});
