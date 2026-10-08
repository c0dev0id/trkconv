import type { LngLat } from "./geo";

export interface ParsedGpx {
  name: string;
  coords: LngLat[];
}

function readPoints(doc: Document, tag: string): LngLat[] {
  const out: LngLat[] = [];
  // Match on localName so namespace prefixes (e.g. <gpx:trkpt>) do not matter.
  for (const el of Array.from(doc.getElementsByTagName("*"))) {
    if (el.localName !== tag) continue;
    const lat = parseFloat(el.getAttribute("lat") ?? "");
    const lon = parseFloat(el.getAttribute("lon") ?? "");
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.push([lon, lat]);
  }
  return out;
}

/**
 * Reads all track points (all tracks and segments, in document order). Falls
 * back to route points when the file contains no track.
 */
export function parseGpx(text: string): ParsedGpx {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Not a valid XML file");
  if (doc.documentElement.localName !== "gpx") throw new Error("Not a GPX file");

  let coords = readPoints(doc, "trkpt");
  let container = "trk";
  if (coords.length < 2) {
    coords = readPoints(doc, "rtept");
    container = "rte";
  }
  if (coords.length < 2) throw new Error("GPX file contains no track with at least two points");

  const nameEl =
    doc.querySelector(`${container} > name`) ?? doc.querySelector("metadata > name");
  return { name: nameEl?.textContent?.trim() ?? "", coords };
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Serialises waypoints as a GPX 1.1 route (<rte>/<rtept>). */
export function routeToGpx(name: string, points: LngLat[]): string {
  const rtepts = points
    .map(([lon, lat]) => `    <rtept lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="trkconv" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>${escapeXml(name)}</name>
${rtepts}
  </rte>
</gpx>
`;
}
