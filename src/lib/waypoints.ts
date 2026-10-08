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

/**
 * Drops waypoints closer than minGap to the previously kept one. The first
 * and last entries of `ds` are endpoints and always survive.
 */
export function mergeClose(ds: number[], minGap: number): number[] {
  if (ds.length <= 2 || minGap <= 0) return ds;
  const last = ds[ds.length - 1];
  const out = [ds[0]];
  for (let i = 1; i < ds.length - 1; i++) {
    if (ds[i] - out[out.length - 1] >= minGap && last - ds[i] >= minGap) out.push(ds[i]);
  }
  out.push(last);
  return out;
}

/** Inserts evenly spaced waypoints into every gap longer than maxGap. */
export function fillGaps(ds: number[], maxGap: number): number[] {
  if (maxGap <= 0 || ds.length === 0) return ds;
  const out = [ds[0]];
  for (let i = 1; i < ds.length; i++) {
    const gap = ds[i] - ds[i - 1];
    const parts = Math.ceil(gap / maxGap);
    for (let k = 1; k < parts; k++) out.push(ds[i - 1] + (gap * k) / parts);
    out.push(ds[i]);
  }
  return out;
}

/**
 * Moves intermediate waypoints by `offset` metres along the track. Points
 * pushed onto or past an endpoint are dropped; the endpoints stay fixed.
 */
export function shiftAlong(ds: number[], offset: number, total: number): number[] {
  if (ds.length <= 2 || offset === 0) return ds;
  const inner = ds
    .slice(1, -1)
    .map((d) => d + offset)
    .filter((d) => d > 0 && d < total);
  return [0, ...inner, total];
}

/**
 * Selects waypoints along the track and returns them as distances in metres.
 * Douglas-Peucker and corner detection are combined; the result is then
 * thinned (minGap), densified (maxGap) and shifted, in that order.
 */
export function selectWaypoints(track: Track, xy: XY[], s: SelectionSettings): number[] {
  const n = track.coords.length;
  if (n < 2) return [];
  const total = trackLength(track);
  const indices = new Set<number>([0, n - 1]);
  if (s.rdpTolerance > 0) for (const i of rdp(xy, s.rdpTolerance)) indices.add(i);
  if (s.cornerAngle > 0) {
    for (const i of detectCorners(xy, track.dist, s.cornerAngle, s.cornerWindow)) indices.add(i);
  }
  let ds = [...indices].sort((a, b) => a - b).map((i) => track.dist[i]);
  ds = mergeClose(ds, s.minGap);
  ds = fillGaps(ds, s.maxGap);
  return shiftAlong(ds, s.shift, total);
}
