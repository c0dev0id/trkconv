# trkconv

Proof-of-concept tool that converts a GPX track into a GPX route. The
waypoint selection is controlled with sliders and checked against a real
router (OSRM) on the map before exporting.

## Usage

1. Open or drop a GPX file. All track points are shown on the map.
2. Tune the waypoint selection:
   - **Douglas-Peucker tolerance** – keeps points that deviate more than the
     tolerance from the simplified line.
   - **Corner angle / corner window** – keeps the sharpest point of every
     heading change larger than the angle, measured over the window before
     and after the point.
   - **Minimum gap** – drops waypoints too close to the previous one.
   - **Maximum gap** – inserts waypoints so no gap exceeds the value.
3. Pick a profile and press **Test Routing**. The route is drawn on the map;
   track points farther than the deviation tolerance from the route and
   route parts farther than the tolerance from the track are shown in red.
4. **Shift along track** moves all intermediate waypoints forwards or
   backwards along the track. The route is dashed until it is recomputed.
5. **Export GPX route** saves the waypoints as `<rtept>` elements.

## Services

- Basemaps: [TopPlusOpen](https://gdz.bkg.bund.de/index.php/default/wmts-topplusopen-wmts-topplus-open.html)
  (BKG, layer `web_scale`) and Esri World Imagery.
- Routing: public OSRM instances of [FOSSGIS](https://routing.openstreetmap.de)
  (car, bike, foot), limited to 500 waypoints per request.

## Development

```sh
npm install
npm run dev     # development server
npm test        # unit tests
npm run build   # type check and production build into dist/
```

## Deployment

`.github/workflows/pages.yml` tests and builds every push and pull request,
and deploys `main` to GitHub Pages. In the repository settings, set
*Pages → Build and deployment → Source* to *GitHub Actions*.
