import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { FeatureCollection, GeoJsonProperties } from "geojson";
import {
  type GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LngLat, Track } from "../lib/geo";
import type { Source } from "../lib/waypoints";
import { DEVIATION_COLOR, SOURCE_COLORS } from "./colors";

export interface Marker {
  coord: LngLat;
  sources: Source[];
  removed: boolean;
}

export interface MapViewProps {
  track: Track | null;
  waypoints: Marker[];
  route: LngLat[] | null;
  routeStale: boolean;
  /** Route parts beyond the tolerance from the track. */
  detours: LngLat[][];
  /** Per track point deviation from the route in metres, if routed. */
  deviations: number[] | null;
  tolerance: number;
}

// MapLibre locates its worker relative to its own module, which does not
// survive bundling. Vite emits the worker as an asset and provides its URL.
setWorkerUrl(workerUrl);

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

// The basemap style already credits OpenStreetMap.
const ROUTING_ATTRIBUTION = 'Routing <a href="https://routing.openstreetmap.de">FOSSGIS OSRM</a>';

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

function lines(parts: LngLat[][]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: parts
      .filter((coords) => coords.length > 1)
      .map((coords) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } })),
  };
}

function points(coords: LngLat[], props: (i: number) => GeoJsonProperties): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: coords.map((c, i) => ({
      type: "Feature",
      properties: props(i),
      geometry: { type: "Point", coordinates: c },
    })),
  };
}

export default function MapView(props: MapViewProps) {
  let container!: HTMLDivElement;
  let map: MapLibreMap | undefined;
  const [ready, setReady] = createSignal(false);

  const source = (id: string) => map!.getSource(id) as GeoJSONSource;

  onMount(() => {
    map = new MapLibreMap({ container, style: STYLE_URL, center: [10.4, 51.2], zoom: 5 });
    map.addControl(new NavigationControl(), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-right");
    // "style.load" fires as soon as layers can be added; "load" would also wait for all tiles.
    map.once("style.load", () => {
      for (const id of ["track", "trackpoints", "route", "detours", "waypoints"]) {
        map!.addSource(id, {
          type: "geojson",
          data: EMPTY,
          attribution: id === "route" ? ROUTING_ATTRIBUTION : undefined,
        });
      }
      map!.addLayer({
        id: "track",
        type: "line",
        source: "track",
        paint: { "line-color": "#1d4ed8", "line-width": 2, "line-opacity": 0.6 },
      });
      map!.addLayer({
        id: "trackpoints",
        type: "circle",
        source: "trackpoints",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 16, 3.5],
          "circle-color": "#1d4ed8",
        },
      });
      map!.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#9333ea", "line-width": 4, "line-opacity": 0.8 },
      });
      map!.addLayer({
        id: "detours",
        type: "line",
        source: "detours",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": DEVIATION_COLOR, "line-width": 5 },
      });
      map!.addLayer({
        id: "waypoints",
        type: "circle",
        source: "waypoints",
        paint: {
          "circle-radius": 6,
          "circle-color": ["get", "fill"],
          "circle-stroke-color": ["get", "ring"],
          "circle-stroke-width": ["get", "ringWidth"],
          "circle-opacity": ["case", ["get", "removed"], 0.35, 1],
          "circle-stroke-opacity": ["case", ["get", "removed"], 0.35, 1],
        },
      });
      setReady(true);
    });
  });

  onCleanup(() => map?.remove());

  createEffect(() => {
    if (!ready()) return;
    const track = props.track;
    source("track").setData(lines(track ? [track.coords] : []));
    if (!track) return;
    const bounds = new LngLatBounds();
    for (const c of track.coords) bounds.extend(c);
    map!.fitBounds(bounds, { padding: 40, duration: 0 });
  });

  createEffect(() => {
    if (!ready()) return;
    const coords = props.track?.coords ?? [];
    const dev = props.deviations;
    source("trackpoints").setData(points(coords, (i) => ({ dev: dev ? dev[i] : 0 })));
  });

  createEffect(() => {
    if (!ready()) return;
    map!.setPaintProperty("trackpoints", "circle-color", [
      "case",
      [">", ["get", "dev"], props.tolerance],
      DEVIATION_COLOR,
      "#1d4ed8",
    ]);
  });

  createEffect(() => {
    if (!ready()) return;
    // Removed markers first so active ones are drawn on top.
    const markers = [...props.waypoints].sort((a, b) => Number(b.removed) - Number(a.removed));
    source("waypoints").setData(
      points(
        markers.map((m) => m.coord),
        (i) => {
          const [first, second] = markers[i].sources;
          return {
            fill: SOURCE_COLORS[first],
            // A second source is shown as a ring around the first.
            ring: second ? SOURCE_COLORS[second] : "#ffffff",
            ringWidth: second ? 3 : 1.5,
            removed: markers[i].removed,
          };
        },
      ),
    );
  });

  createEffect(() => {
    if (!ready()) return;
    source("route").setData(lines(props.route ? [props.route] : []));
    map!.setPaintProperty("route", "line-dasharray", props.routeStale ? [1, 1.5] : [1, 0]);
    map!.setPaintProperty("route", "line-opacity", props.routeStale ? 0.5 : 0.8);
  });

  createEffect(() => {
    if (!ready()) return;
    source("detours").setData(lines(props.detours));
  });

  return <div ref={container} class="map" />;
}
