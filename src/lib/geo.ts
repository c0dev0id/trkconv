/** [longitude, latitude] in degrees, matching GeoJSON order. */
export type LngLat = [number, number];

/** Planar coordinates in metres. */
export type XY = [number, number];

export interface Track {
  name: string;
  coords: LngLat[];
  /** Cumulative distance along the track in metres; dist[0] === 0. */
  dist: number[];
}

const EARTH_RADIUS = 6371008.8;
const RAD = Math.PI / 180;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function cumulativeDistances(coords: LngLat[]): number[] {
  const dist = new Array<number>(coords.length);
  if (coords.length === 0) return dist;
  dist[0] = 0;
  for (let i = 1; i < coords.length; i++) {
    dist[i] = dist[i - 1] + haversine(coords[i - 1], coords[i]);
  }
  return dist;
}

export function makeTrack(name: string, coords: LngLat[]): Track {
  return { name, coords, dist: cumulativeDistances(coords) };
}

export function trackLength(track: Track): number {
  return track.dist.length ? track.dist[track.dist.length - 1] : 0;
}

/**
 * Equirectangular projection around a reference latitude. Accurate enough
 * for distance comparisons within the extent of a single track.
 */
export function localProjection(refLat: number): (p: LngLat) => XY {
  const kx = EARTH_RADIUS * RAD * Math.cos(refLat * RAD);
  const ky = EARTH_RADIUS * RAD;
  return (p) => [p[0] * kx, p[1] * ky];
}

export function meanLatitude(coords: LngLat[]): number {
  let sum = 0;
  for (const c of coords) sum += c[1];
  return coords.length ? sum / coords.length : 0;
}

export function projectAll(coords: LngLat[]): XY[] {
  const project = localProjection(meanLatitude(coords));
  return coords.map(project);
}

/** Index i of the segment [i, i+1] that contains distance d. */
export function segmentIndexAt(dist: number[], d: number): number {
  let lo = 0;
  let hi = dist.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (dist[mid] <= d) lo = mid;
    else hi = mid;
  }
  return lo;
}

function lerp<T extends [number, number]>(points: T[], dist: number[], d: number): T {
  const last = points.length - 1;
  if (d <= 0 || last === 0) return points[0];
  if (d >= dist[last]) return points[last];
  const i = segmentIndexAt(dist, d);
  const span = dist[i + 1] - dist[i];
  const t = span > 0 ? (d - dist[i]) / span : 0;
  const a = points[i];
  const b = points[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as T;
}

/** Position on the track at distance d (metres), clamped to the track ends. */
export function pointAtDistance(track: Track, d: number): LngLat {
  return lerp(track.coords, track.dist, d);
}

/** Same as pointAtDistance, but on pre-projected coordinates. */
export function xyAtDistance(xy: XY[], dist: number[], d: number): XY {
  return lerp(xy, dist, d);
}

/** Shortest distance from p to the segment ab, all in planar metres. */
export function pointSegmentDistance(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
