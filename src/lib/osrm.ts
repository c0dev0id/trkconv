import type { LngLat } from "./geo";

/** Public OSRM instances operated by FOSSGIS, one per profile. */
export const PROFILES = {
  car: "https://routing.openstreetmap.de/routed-car",
  bike: "https://routing.openstreetmap.de/routed-bike",
  foot: "https://routing.openstreetmap.de/routed-foot",
} as const;

export type Profile = keyof typeof PROFILES;

/** Coordinate limit of the FOSSGIS instances. */
export const MAX_WAYPOINTS = 500;

export interface RouteResult {
  coords: LngLat[];
  /** Route length in metres. */
  distance: number;
  /** Waypoint positions after OSRM snapped them to the road network. */
  snapped: LngLat[];
}

export function routeUrl(profile: Profile, points: LngLat[]): string {
  const coords = points.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(";");
  return `${PROFILES[profile]}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
}

export async function fetchRoute(
  profile: Profile,
  points: LngLat[],
  signal?: AbortSignal,
): Promise<RouteResult> {
  if (points.length < 2) throw new Error("At least two waypoints are required");
  if (points.length > MAX_WAYPOINTS) {
    throw new Error(`${points.length} waypoints exceed the server limit of ${MAX_WAYPOINTS}`);
  }
  const res = await fetch(routeUrl(profile, points), { signal });
  const body = await res.json().catch(() => null);
  if (!body || body.code !== "Ok") {
    throw new Error(body?.message ?? `Routing failed (HTTP ${res.status})`);
  }
  const route = body.routes[0];
  return {
    coords: route.geometry.coordinates,
    distance: route.distance,
    snapped: body.waypoints.map((w: { location: LngLat }) => w.location),
  };
}
