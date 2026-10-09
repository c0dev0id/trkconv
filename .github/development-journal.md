# Development Journal

## Overview and intent

GPX tracks recorded or drawn as dense point sequences do not navigate well:
devices either follow them blindly or choke on the point count. A route with
a few well-placed waypoints lets the navigation device recalculate along
the same roads. trkconv is a proof of concept for that conversion. It
selects waypoints from the track with tunable algorithms, routes them with
OSRM, shows where the route diverges from the track, and exports the
waypoints as a GPX route.

## Software stack

- SolidJS 1.9 with TypeScript, built with Vite.
- MapLibre GL JS 6 for the map with the OpenFreeMap Positron vector style
  as the only basemap.
- Vitest for unit tests of the framework-free modules in `src/lib`
  (happy-dom only where DOMParser is needed).
- GitHub Actions deploys `dist/` to GitHub Pages.

## Key decisions

- **Waypoints are distances along the track**, not track point indices.
  This lets gap filling and shifting place waypoints between recorded
  points; coordinates are interpolated only for display, routing and export.
- **Selection pipeline order**: union of Douglas-Peucker and corner
  detection, then minimum gap, then maximum gap, then shift. Gap filling
  runs after thinning so an explicit maximum gap is always honoured.
  Endpoints are fixed; shifted points that pass an endpoint are dropped.
- **Waypoint attribution**: every selected point records which step picked
  it (endpoint, Douglas-Peucker, corner, gap filler). Points dropped by the
  minimum gap are kept in the selection with a `removed` flag so the map
  can show them faded; only non-removed points are routed and exported.
  Douglas-Peucker's implicit endpoints are attributed to "endpoint" only.
  Only Douglas-Peucker and corner detection can pick the same track point,
  so one fill colour plus one ring colour is enough to show both.
- **Corner detection** measures the heading change between the positions
  one window before and after each point, which suppresses GPS jitter
  better than the angle between adjacent points. Clusters of candidates are
  reduced to their sharpest point.
- **Distances** use haversine for track length and an equirectangular
  projection around the mean latitude for geometric operations.
- **Deviation** is measured in both directions with a grid index (cell size
  equals the cap): track → route colours track points, route → track
  marks detours. Route length relative to track length is shown because
  out-and-back spurs on the same road are invisible to both checks.
- **Routing service**: FOSSGIS OSRM (`routing.openstreetmap.de`) because it
  offers car, bike and foot profiles with CORS. Limit is 500 coordinates.
  `continue_straight` is left at the profile default; forcing it made bike
  routes longer in tests.
- **MapLibre worker**: MapLibre 6 resolves its worker relative to its own
  module, which breaks after bundling. The worker is imported with Vite's
  `?url` suffix and passed to `setWorkerUrl`.
- **Basemap**: OpenFreeMap Positron replaced the earlier TopPlusOpen and
  Esri satellite toggle. Its muted greys keep the coloured track, waypoint
  and route layers readable, and it needs no API key.
- **Map layers are added on `style.load`**, not `load`, which would wait
  for every initial tile and delay showing a loaded track.
- **Vite base `./`** so the build works under any Pages sub-path.

## Core features

- Load GPX via file picker or drag and drop (track points, falling back to
  route points).
- OpenFreeMap Positron basemap.
- Sliders for Douglas-Peucker tolerance, corner angle and window, minimum
  and maximum waypoint gap, each with a colour swatch matching the markers
  it produces. Track points stay visible as small dots underneath.
- Test routing with OSRM (car, bike, foot); stale routes are dashed.
- Shift all intermediate waypoints along the track.
- Deviation tolerance slider with red highlighting and off-route share.
- Export waypoints as a GPX 1.1 route.
