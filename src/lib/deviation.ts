import { type LngLat, type XY, localProjection, meanLatitude, pointSegmentDistance } from "./geo";

/**
 * Distance from every track point to the nearest point of the route, in
 * metres, capped at `cap`. Route segments are bucketed into a grid with cell
 * size `cap`, so each lookup only inspects the 3x3 neighbourhood.
 */
export function deviations(track: LngLat[], route: LngLat[], cap: number): number[] {
  if (route.length === 0) return track.map(() => cap);
  const project = localProjection(meanLatitude(track));
  const r = route.map(project);
  const cell = (v: number) => Math.floor(v / cap);
  const grid = new Map<string, number[]>();

  for (let i = 0; i < r.length - 1; i++) {
    const [ax, ay] = r[i];
    const [bx, by] = r[i + 1];
    for (let cx = cell(Math.min(ax, bx)); cx <= cell(Math.max(ax, bx)); cx++) {
      for (let cy = cell(Math.min(ay, by)); cy <= cell(Math.max(ay, by)); cy++) {
        const key = `${cx},${cy}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(i);
        else grid.set(key, [i]);
      }
    }
  }

  return track.map((c) => {
    const p: XY = project(c);
    if (r.length === 1) return Math.min(cap, Math.hypot(p[0] - r[0][0], p[1] - r[0][1]));
    let best = cap;
    const px = cell(p[0]);
    const py = cell(p[1]);
    for (let cx = px - 1; cx <= px + 1; cx++) {
      for (let cy = py - 1; cy <= py + 1; cy++) {
        for (const i of grid.get(`${cx},${cy}`) ?? []) {
          best = Math.min(best, pointSegmentDistance(p, r[i], r[i + 1]));
        }
      }
    }
    return best;
  });
}

/** Share (0..1) of the track length whose both endpoints deviate more than tolerance. */
export function offRouteShare(dist: number[], dev: number[], tolerance: number): number {
  const total = dist[dist.length - 1];
  if (!(total > 0)) return 0;
  let off = 0;
  for (let i = 1; i < dist.length; i++) {
    if (dev[i - 1] > tolerance && dev[i] > tolerance) off += dist[i] - dist[i - 1];
  }
  return off / total;
}

/**
 * Splits a line into runs of consecutive segments with at least one endpoint
 * deviating more than tolerance. "Either endpoint" catches spurs whose only
 * off-track vertex is the tip. Used to highlight route detours.
 */
export function offRuns<T>(coords: T[], dev: number[], tolerance: number): T[][] {
  const runs: T[][] = [];
  let run: T[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    if (dev[i] > tolerance || dev[i + 1] > tolerance) {
      if (run.length === 0) run.push(coords[i]);
      run.push(coords[i + 1]);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}
