import { For, Show, batch, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import MapView, { type Basemap } from "./components/MapView";
import Slider from "./components/Slider";
import { deviations, offRouteShare, offRuns } from "./lib/deviation";
import { type LngLat, type Track, makeTrack, pointAtDistance, projectAll, trackLength } from "./lib/geo";
import { parseGpx, routeToGpx } from "./lib/gpx";
import { MAX_WAYPOINTS, PROFILES, type Profile, type RouteResult, fetchRoute } from "./lib/osrm";
import { type SelectionSettings, selectWaypoints } from "./lib/waypoints";

/** Deviations beyond this are not measured exactly; must exceed the tolerance slider maximum. */
const DEVIATION_CAP = 250;

interface Routed extends RouteResult {
  /** The waypoints the route was computed from. */
  waypoints: LngLat[];
}

function sameCoords(a: LngLat[], b: LngLat[]): boolean {
  return a.length === b.length && a.every((c, i) => c[0] === b[i][0] && c[1] === b[i][1]);
}

function km(m: number): string {
  return `${(m / 1000).toFixed(2)} km`;
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/gpx+xml" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [basemap, setBasemap] = createSignal<Basemap>("topplus");
  const [track, setTrack] = createSignal<Track | null>(null);
  const [loadError, setLoadError] = createSignal("");
  const [settings, setSettings] = createStore<SelectionSettings>({
    rdpTolerance: 0,
    cornerAngle: 45,
    cornerWindow: 20,
    minGap: 50,
    maxGap: 0,
    shift: 0,
  });
  const [profile, setProfile] = createSignal<Profile>("bike");
  const [routed, setRouted] = createSignal<Routed | null>(null);
  const [routing, setRouting] = createSignal(false);
  const [routeError, setRouteError] = createSignal("");
  const [tolerance, setTolerance] = createSignal(25);

  const projected = createMemo(() => {
    const t = track();
    return t ? projectAll(t.coords) : [];
  });

  const waypoints = createMemo<LngLat[]>(() => {
    const t = track();
    if (!t) return [];
    return selectWaypoints(t, projected(), { ...settings }).map((d) => pointAtDistance(t, d));
  });

  const stale = createMemo(() => {
    const r = routed();
    return !!r && !sameCoords(r.waypoints, waypoints());
  });

  const devs = createMemo(() => {
    const t = track();
    const r = routed();
    return t && r ? deviations(t.coords, r.coords, DEVIATION_CAP) : null;
  });

  const routeDevs = createMemo(() => {
    const t = track();
    const r = routed();
    return t && r ? deviations(r.coords, t.coords, DEVIATION_CAP) : null;
  });

  const detours = createMemo(() => {
    const r = routed();
    const d = routeDevs();
    return r && d ? offRuns(r.coords, d, tolerance()) : [];
  });

  const offRoute = createMemo(() => {
    const t = track();
    const d = devs();
    return t && d ? offRouteShare(t.dist, d, tolerance()) : null;
  });

  async function loadFile(file: File) {
    try {
      const gpx = parseGpx(await file.text());
      batch(() => {
        setTrack(makeTrack(gpx.name || file.name.replace(/\.gpx$/i, ""), gpx.coords));
        setRouted(null);
        setRouteError("");
        setLoadError("");
        setSettings("shift", 0);
      });
    } catch (e) {
      setLoadError(`${file.name}: ${(e as Error).message}`);
    }
  }

  let routeAbort: AbortController | undefined;

  async function testRouting() {
    routeAbort?.abort();
    routeAbort = new AbortController();
    const wps = waypoints();
    setRouting(true);
    setRouteError("");
    try {
      const result = await fetchRoute(profile(), wps, routeAbort.signal);
      setRouted({ ...result, waypoints: wps });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setRouteError((e as Error).message);
    } finally {
      setRouting(false);
    }
  }

  function lengthDelta(routeLength: number): string {
    const pct = (routeLength / trackLength(track()!) - 1) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  }

  function exportGpx() {
    const t = track()!;
    download(`${t.name || "route"}-route.gpx`, routeToGpx(t.name, waypoints()));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) loadFile(file);
  }

  return (
    <div class="app" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <aside class="panel">
        <h1>trkconv</h1>
        <p class="hint">GPX track to route converter</p>

        <section>
          <h2>Track</h2>
          <input
            type="file"
            accept=".gpx,application/gpx+xml"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) loadFile(file);
              e.currentTarget.value = "";
            }}
          />
          <Show when={loadError()}>
            <p class="error">{loadError()}</p>
          </Show>
          <Show when={track()} fallback={<p class="hint">Open or drop a GPX file.</p>}>
            {(t) => (
              <p class="stats">
                {t().name || "Unnamed"} · {t().coords.length} points · {km(trackLength(t()))}
              </p>
            )}
          </Show>
        </section>

        <section>
          <h2>Basemap</h2>
          <div class="toggle">
            <For each={[["topplus", "TopPlusOpen"], ["satellite", "Satellite"]] as const}>
              {([id, label]) => (
                <label>
                  <input
                    type="radio"
                    name="basemap"
                    checked={basemap() === id}
                    onChange={() => setBasemap(id)}
                  />
                  {label}
                </label>
              )}
            </For>
          </div>
        </section>

        <fieldset disabled={!track()}>
          <section>
            <h2>Waypoints</h2>
            <Slider
              label="Douglas-Peucker tolerance"
              hint="Keeps points deviating more than this from the simplified line."
              min={0} max={200} step={1} unit="m" offAtZero
              value={settings.rdpTolerance}
              onInput={(v) => setSettings("rdpTolerance", v)}
            />
            <Slider
              label="Corner angle"
              hint="Heading change that marks a corner."
              min={0} max={180} step={1} unit="°" offAtZero
              value={settings.cornerAngle}
              onInput={(v) => setSettings("cornerAngle", v)}
            />
            <Slider
              label="Corner window"
              hint="Heading is measured this far before and after each point."
              min={5} max={200} step={5} unit="m"
              value={settings.cornerWindow}
              onInput={(v) => setSettings("cornerWindow", v)}
            />
            <Slider
              label="Minimum gap"
              hint="Drops waypoints closer than this to the previous one."
              min={0} max={1000} step={10} unit="m" offAtZero
              value={settings.minGap}
              onInput={(v) => setSettings("minGap", v)}
            />
            <Slider
              label="Maximum gap"
              hint="Inserts waypoints so no gap is longer than this."
              min={0} max={20000} step={250} unit="m" offAtZero
              value={settings.maxGap}
              onInput={(v) => setSettings("maxGap", v)}
            />
            <p class="stats" classList={{ error: waypoints().length > MAX_WAYPOINTS }}>
              {waypoints().length} waypoints
              {waypoints().length > MAX_WAYPOINTS ? ` (server limit ${MAX_WAYPOINTS})` : ""}
            </p>
          </section>

          <section>
            <h2>Routing</h2>
            <div class="row">
              <select value={profile()} onChange={(e) => setProfile(e.currentTarget.value as Profile)}>
                <For each={Object.keys(PROFILES)}>{(p) => <option value={p}>{p}</option>}</For>
              </select>
              <button onClick={testRouting} disabled={routing() || waypoints().length < 2}>
                {routing() ? "Routing…" : "Test Routing"}
              </button>
            </div>
            <Show when={routeError()}>
              <p class="error">{routeError()}</p>
            </Show>
            <Slider
              label="Shift along track"
              hint="Moves all intermediate waypoints forwards or backwards along the track."
              min={-500} max={500} step={5} unit="m"
              value={settings.shift}
              onInput={(v) => setSettings("shift", v)}
            />
            <Slider
              label="Deviation tolerance"
              hint="Track points farther than this from the route, and route parts farther than this from the track, are shown in red."
              min={5} max={200} step={5} unit="m"
              value={tolerance()}
              onInput={setTolerance}
            />
            <Show when={routed()}>
              {(r) => (
                <p class="stats">
                  Route {km(r().distance)} ({lengthDelta(r().distance)}) · off-route{" "}
                  {((offRoute() ?? 0) * 100).toFixed(1)}%
                  <Show when={stale()}>
                    <span class="stale"> · outdated</span>
                  </Show>
                </p>
              )}
            </Show>
          </section>

          <section>
            <h2>Export</h2>
            <button onClick={exportGpx} disabled={waypoints().length < 2}>
              Export GPX route
            </button>
          </section>
        </fieldset>

      </aside>

      <MapView
        basemap={basemap()}
        track={track()}
        waypoints={waypoints()}
        route={routed()?.coords ?? null}
        routeStale={stale()}
        detours={detours()}
        deviations={devs()}
        tolerance={tolerance()}
      />
    </div>
  );
}
