import { type Track, type XY, pointSegmentDistance, trackLength, xyAtDistance } from "./geo";

/**
 * Waypoint selection parameters. Every value is in metres or degrees;
 * 0 disables the respective step (except cornerWindow and shift).
 */
export interface SelectionSettings {
  /** Douglas-Peucker tolerance. */
  rdpTolerance: number;
  /** Minimum heading change that counts as a corner. */
  cornerAngle: number;
  /** Distance before and after a point used to measure its heading change. */
  cornerWindow: number;
  /** Drop waypoints closer than this to the previous one. */
  minGap: number;
  /** Insert waypoints so that no gap exceeds this. */
  maxGap: number;
  /** Move all intermediate waypoints along the track by this offset. */
  shift: number;
}

/**
 * Ramer-Douglas-Peucker simplification. Returns the sorted indices of the
 * points to keep, always including the first and last.
 */
export function rdp(xy: XY[], tolerance: number): number[] {
  const n = xy.length;
  if (n <= 2) return [...Array(n).keys()];
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDist = -1;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = pointSegmentDistance(xy[i], xy[first], xy[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > tolerance) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

function headingDelta(back: XY, at: XY, ahead: XY): number {
  const inbound = Math.atan2(at[1] - back[1], at[0] - back[0]);
  const outbound = Math.atan2(ahead[1] - at[1], ahead[0] - at[0]);
  let delta = Math.abs(outbound - inbound);
  if (delta > Math.PI) delta = 2 * Math.PI - delta;
  return (delta * 180) / Math.PI;
}

/**
 * Corner detection. For every point the heading change is measured between
 * the positions `window` metres before and after it. Points exceeding
 * `angle` degrees are candidates; within each cluster of candidates (gaps no
 * longer than `window`) only the sharpest one is returned.
 */
export function detectCorners(xy: XY[], dist: number[], angle: number, window: number): number[] {
  const n = xy.length;
  if (n < 3 || window <= 0) return [];
  const total = dist[n - 1];
  const corners: number[] = [];
  let best = -1;
  let bestTurn = 0;
  for (let i = 1; i < n - 1; i++) {
    if (dist[i] < window || dist[i] > total - window) continue;
    const turn = headingDelta(
      xyAtDistance(xy, dist, dist[i] - window),
      xy[i],
      xyAtDistance(xy, dist, dist[i] + window),
    );
    if (turn < angle) continue;
    if (best !== -1 && dist[i] - dist[best] > window) {
      corners.push(best);
      best = -1;
    }
    if (best === -1 || turn > bestTurn) {
      best = i;
      bestTurn = turn;
    }
  }
  if (best !== -1) corners.push(best);
  return corners;
}

/** Which step of the selection pipeline produced a waypoint. */
export type Source = "endpoint" | "rdp" | "corner" | "gap";

/** Fixed order used when a waypoint has several sources. */
export const SOURCES: Source[] = ["endpoint", "rdp", "corner", "gap"];

export interface Waypoint {
  /** Distance along the track in metres. */
  d: number;
  /** Selection steps that picked this point, in SOURCES order. */
  sources: Source[];
  /** Dropped by the minimum gap; kept for display only. */
  removed: boolean;
}

/**
 * Marks which waypoints survive the minimum gap: a point is dropped when it
 * is closer than minGap to the previously kept one or to the last point. The
 * first and last entries of `ds` are endpoints and always survive.
 */
export function minGapMask(ds: number[], minGap: number): boolean[] {
  const keep = ds.map(() => true);
  if (ds.length <= 2 || minGap <= 0) return keep;
  const last = ds[ds.length - 1];
  let prev = ds[0];
  for (let i = 1; i < ds.length - 1; i++) {
    keep[i] = ds[i] - prev >= minGap && last - ds[i] >= minGap;
    if (keep[i]) prev = ds[i];
  }
  return keep;
}

/** Evenly spaced distances to insert so that no gap in `ds` exceeds maxGap. */
export function gapFillers(ds: number[], maxGap: number): number[] {
  if (maxGap <= 0) return [];
  const out: number[] = [];
  for (let i = 1; i < ds.length; i++) {
    const gap = ds[i] - ds[i - 1];
    const parts = Math.ceil(gap / maxGap);
    for (let k = 1; k < parts; k++) out.push(ds[i - 1] + (gap * k) / parts);
  }
  return out;
}

/**
 * Moves all non-endpoint waypoints by `offset` metres along the track.
 * Points pushed onto or past an endpoint are dropped.
 */
export function shiftAlong(wps: Waypoint[], offset: number, total: number): Waypoint[] {
  if (offset === 0) return wps;
  return wps
    .map((w) => (w.sources.includes("endpoint") ? w : { ...w, d: w.d + offset }))
    .filter((w) => w.sources.includes("endpoint") || (w.d > 0 && w.d < total));
}

/**
 * Selects waypoints along the track, annotated with the step that picked
 * them. Douglas-Peucker and corner detection are combined with the
 * endpoints; the result is thinned (minGap, marking points as removed),
 * densified (maxGap) and shifted, in that order.
 */
export function selectWaypoints(track: Track, xy: XY[], s: SelectionSettings): Waypoint[] {
  const n = track.coords.length;
  if (n < 2) return [];
  const picked = new Map<number, Set<Source>>();
  const pick = (i: number, source: Source) => {
    const set = picked.get(i) ?? new Set<Source>();
    picked.set(i, set.add(source));
  };
  pick(0, "endpoint");
  pick(n - 1, "endpoint");
  if (s.rdpTolerance > 0) {
    // Douglas-Peucker always keeps both ends; those count as endpoints only.
    for (const i of rdp(xy, s.rdpTolerance)) if (i !== 0 && i !== n - 1) pick(i, "rdp");
  }
  if (s.cornerAngle > 0) {
    for (const i of detectCorners(xy, track.dist, s.cornerAngle, s.cornerWindow)) pick(i, "corner");
  }

  const candidates: Waypoint[] = [...picked]
    .sort((a, b) => a[0] - b[0])
    .map(([i, set]) => ({ d: track.dist[i], sources: SOURCES.filter((x) => set.has(x)), removed: false }));
  const keep = minGapMask(candidates.map((w) => w.d), s.minGap);
  candidates.forEach((w, i) => (w.removed = !keep[i]));

  const kept = candidates.filter((w) => !w.removed).map((w) => w.d);
  const fillers: Waypoint[] = gapFillers(kept, s.maxGap).map((d) => ({ d, sources: ["gap"], removed: false }));
  const all = [...candidates, ...fillers].sort((a, b) => a.d - b.d);
  return shiftAlong(all, s.shift, trackLength(track));
}

/** The waypoints that are actually routed and exported. */
export function activeDistances(wps: Waypoint[]): number[] {
  return wps.filter((w) => !w.removed).map((w) => w.d);
}
