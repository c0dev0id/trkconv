import { describe, expect, it } from "vitest";
import { type LngLat, type XY, cumulativeDistances, makeTrack, projectAll } from "../src/lib/geo";
import { type Waypoint, activeDistances, detectCorners, gapFillers, minGapMask, rdp, selectWaypoints, shiftAlong } from "../src/lib/waypoints";

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

describe("minGapMask", () => {
  it("drops points closer than minGap and keeps endpoints", () => {
    expect(minGapMask([0, 10, 50, 55, 100], 20)).toEqual([true, false, true, false, true]);
  });
  it("measures from the last kept point, not the last dropped one", () => {
    expect(minGapMask([0, 15, 25, 100], 20)).toEqual([true, false, true, true]);
  });
  it("drops inner points too close to the end", () => {
    expect(minGapMask([0, 50, 95, 100], 20)).toEqual([true, true, false, true]);
  });
  it("keeps everything when disabled", () => {
    expect(minGapMask([0, 1, 2], 0)).toEqual([true, true, true]);
  });
});

describe("gapFillers", () => {
  it("splits long gaps evenly", () => {
    expect(gapFillers([0, 300], 100)).toEqual([100, 200]);
    expect(gapFillers([0, 250], 100)).toEqual([250 / 3, 500 / 3]);
  });
  it("leaves short gaps alone", () => {
    expect(gapFillers([0, 80, 160], 100)).toEqual([]);
  });
  it("is empty when disabled", () => {
    expect(gapFillers([0, 1000], 0)).toEqual([]);
  });
});

describe("shiftAlong", () => {
  const wp = (d: number, source: Waypoint["sources"][number] = "rdp"): Waypoint => ({ d, sources: [source], removed: false });
  const wps = [wp(0, "endpoint"), wp(40), wp(60, "gap"), wp(100, "endpoint")];
  const ds = (list: Waypoint[]) => list.map((w) => w.d);

  it("moves inner points and keeps endpoints", () => {
    expect(ds(shiftAlong(wps, 10, 100))).toEqual([0, 50, 70, 100]);
    expect(ds(shiftAlong(wps, -10, 100))).toEqual([0, 30, 50, 100]);
  });
  it("drops points pushed past an endpoint", () => {
    expect(ds(shiftAlong(wps, 50, 100))).toEqual([0, 90, 100]);
    expect(ds(shiftAlong(wps, -40, 100))).toEqual([0, 20, 100]);
  });
  it("keeps the sources of moved points", () => {
    expect(shiftAlong(wps, 10, 100)[2].sources).toEqual(["gap"]);
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
  const total = track.dist[200];
  const corner = track.dist[100];
  const base = { rdpTolerance: 0, cornerAngle: 0, cornerWindow: 30, minGap: 0, maxGap: 0, shift: 0 };
  const select = (s: Partial<typeof base>) => selectWaypoints(track, xy, { ...base, ...s });

  it("returns only the endpoints with everything disabled", () => {
    expect(select({})).toEqual([
      { d: 0, sources: ["endpoint"], removed: false },
      { d: total, sources: ["endpoint"], removed: false },
    ]);
  });
  it("attributes the corner to corner detection", () => {
    expect(select({ cornerAngle: 45 })[1]).toEqual({ d: corner, sources: ["corner"], removed: false });
  });
  it("attributes the corner to Douglas-Peucker without claiming the endpoints", () => {
    const wps = select({ rdpTolerance: 20 });
    expect(wps.map((w) => w.sources)).toEqual([["endpoint"], ["rdp"], ["endpoint"]]);
  });
  it("lists both sources when both methods pick the same point", () => {
    expect(select({ rdpTolerance: 20, cornerAngle: 45 })[1].sources).toEqual(["rdp", "corner"]);
  });
  it("marks points within the minimum gap as removed instead of dropping them", () => {
    const wps = select({ cornerAngle: 45, minGap: total });
    expect(wps.map((w) => w.removed)).toEqual([false, true, false]);
    expect(activeDistances(wps)).toEqual([0, total]);
  });
  it("fills gaps between kept points only and attributes the fillers", () => {
    // The east leg is ~1.56 km, so the filler at half the length precedes the corner.
    const wps = select({ cornerAngle: 45, minGap: total, maxGap: total / 2 });
    expect(wps.map((w) => [w.sources[0], w.removed])).toEqual([
      ["endpoint", false],
      ["gap", false],
      ["corner", true],
      ["endpoint", false],
    ]);
  });
  it("applies the shift after filling gaps", () => {
    expect(activeDistances(select({ maxGap: total / 2, shift: 5 }))).toEqual([0, total / 2 + 5, total]);
  });
  it("produces strictly increasing active distances", () => {
    const ds = activeDistances(select({ rdpTolerance: 5, cornerAngle: 30, minGap: 25, maxGap: 300, shift: -15 }));
    for (let i = 1; i < ds.length; i++) expect(ds[i]).toBeGreaterThan(ds[i - 1]);
  });
  it("matches cumulativeDistances for the track length", () => {
    expect(track.dist).toEqual(cumulativeDistances(coords));
  });
});
