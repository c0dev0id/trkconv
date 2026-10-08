import { describe, expect, it } from "vitest";
import { type LngLat, type XY, cumulativeDistances, makeTrack, projectAll } from "../src/lib/geo";
import { detectCorners, fillGaps, mergeClose, rdp, selectWaypoints, shiftAlong } from "../src/lib/waypoints";

/** Distances along a planar polyline. */
function planarDist(xy: XY[]): number[] {
  const d = [0];
  for (let i = 1; i < xy.length; i++) d.push(d[i - 1] + Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]));
  return d;
}

/** L-shaped polyline: 100 m east in 1 m steps, then 100 m north. */
const L: XY[] = [
  ...Array.from({ length: 101 }, (_, i): XY => [i, 0]),
  ...Array.from({ length: 100 }, (_, i): XY => [100, i + 1]),
];

describe("rdp", () => {
  it("reduces a straight line to its endpoints", () => {
    const line = Array.from({ length: 50 }, (_, i): XY => [i, 0]);
    expect(rdp(line, 1)).toEqual([0, 49]);
  });
  it("keeps the corner of an L", () => {
    expect(rdp(L, 1)).toEqual([0, 100, 200]);
  });
  it("keeps everything with zero tolerance on a noisy line", () => {
    const zigzag: XY[] = [[0, 0], [1, 1], [2, 0], [3, 1]];
    expect(rdp(zigzag, 0)).toEqual([0, 1, 2, 3]);
  });
  it("handles tiny inputs", () => {
    expect(rdp([], 1)).toEqual([]);
    expect(rdp([[0, 0]], 1)).toEqual([0]);
  });
});

describe("detectCorners", () => {
  const dist = planarDist(L);
  it("finds exactly the 90 degree corner", () => {
    expect(detectCorners(L, dist, 45, 10)).toEqual([100]);
  });
  it("finds nothing above the corner angle", () => {
    expect(detectCorners(L, dist, 95, 10)).toEqual([]);
  });
  it("reports separate corners of a U-turn", () => {
    const U: XY[] = [
      ...Array.from({ length: 101 }, (_, i): XY => [i, 0]),
      ...Array.from({ length: 100 }, (_, i): XY => [100, i + 1]),
      ...Array.from({ length: 100 }, (_, i): XY => [99 - i, 100]),
    ];
    expect(detectCorners(U, planarDist(U), 45, 10)).toEqual([100, 200]);
  });
});

describe("mergeClose", () => {
  it("drops points closer than minGap and keeps endpoints", () => {
    expect(mergeClose([0, 10, 50, 55, 100], 20)).toEqual([0, 50, 100]);
  });
  it("drops inner points too close to the end", () => {
    expect(mergeClose([0, 50, 95, 100], 20)).toEqual([0, 50, 100]);
  });
  it("is a no-op when disabled", () => {
    expect(mergeClose([0, 1, 2], 0)).toEqual([0, 1, 2]);
  });
});

describe("fillGaps", () => {
  it("splits long gaps evenly", () => {
    expect(fillGaps([0, 300], 100)).toEqual([0, 100, 200, 300]);
    expect(fillGaps([0, 250], 100)).toEqual([0, 250 / 3, 500 / 3, 250]);
  });
  it("leaves short gaps alone", () => {
    expect(fillGaps([0, 80, 160], 100)).toEqual([0, 80, 160]);
  });
});

describe("shiftAlong", () => {
  it("moves inner points and keeps endpoints", () => {
    expect(shiftAlong([0, 40, 60, 100], 10, 100)).toEqual([0, 50, 70, 100]);
    expect(shiftAlong([0, 40, 60, 100], -10, 100)).toEqual([0, 30, 50, 100]);
  });
  it("drops points pushed past an endpoint", () => {
    expect(shiftAlong([0, 40, 60, 100], 50, 100)).toEqual([0, 90, 100]);
    expect(shiftAlong([0, 40, 60, 100], -40, 100)).toEqual([0, 20, 100]);
  });
});

describe("selectWaypoints", () => {
  // ~1 km east, then ~1 km north, sampled every ~10 m.
  const coords: LngLat[] = [
    ...Array.from({ length: 101 }, (_, i): LngLat => [i * 0.00014, 0]),
    ...Array.from({ length: 100 }, (_, i): LngLat => [100 * 0.00014, (i + 1) * 0.00009]),
  ];
  const track = makeTrack("t", coords);
  const xy = projectAll(coords);
  const base = { rdpTolerance: 0, cornerAngle: 0, cornerWindow: 30, minGap: 0, maxGap: 0, shift: 0 };

  it("returns only the endpoints with everything disabled", () => {
    expect(selectWaypoints(track, xy, base)).toEqual([0, track.dist[200]]);
  });
  it("adds the corner via corner detection", () => {
    expect(selectWaypoints(track, xy, { ...base, cornerAngle: 45 })).toEqual([0, track.dist[100], track.dist[200]]);
  });
  it("adds the corner via Douglas-Peucker", () => {
    expect(selectWaypoints(track, xy, { ...base, rdpTolerance: 20 })).toEqual([0, track.dist[100], track.dist[200]]);
  });
  it("applies the shift after filling gaps", () => {
    const total = track.dist[200];
    const ds = selectWaypoints(track, xy, { ...base, maxGap: total / 2, shift: 5 });
    expect(ds).toEqual([0, total / 2 + 5, total]);
  });
  it("produces strictly increasing distances", () => {
    const ds = selectWaypoints(track, xy, { ...base, rdpTolerance: 5, cornerAngle: 30, minGap: 25, maxGap: 300, shift: -15 });
    for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeGreaterThan(ds[i - 1]);
  });
  it("matches cumulativeDistances for the track length", () => {
    expect(track.dist).toEqual(cumulativeDistances(coords));
  });
});
