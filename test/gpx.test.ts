// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { parseGpx, routeToGpx } from "../src/lib/gpx";

const TRACK = `<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Meta</name></metadata>
  <trk><name>Tour</name>
    <trkseg><trkpt lat="50.1" lon="8.1"/><trkpt lat="50.2" lon="8.2"/></trkseg>
    <trkseg><trkpt lat="50.3" lon="8.3"/></trkseg>
  </trk>
</gpx>`;

describe("parseGpx", () => {
  it("reads all segments in order as [lon, lat]", () => {
    const gpx = parseGpx(TRACK);
    expect(gpx.name).toBe("Tour");
    expect(gpx.coords).toEqual([[8.1, 50.1], [8.2, 50.2], [8.3, 50.3]]);
  });
  it("falls back to route points", () => {
    const gpx = parseGpx(`<gpx><rte><name>R</name><rtept lat="1" lon="2"/><rtept lat="3" lon="4"/></rte></gpx>`);
    expect(gpx).toEqual({ name: "R", coords: [[2, 1], [4, 3]] });
  });
  it("rejects non-GPX input", () => {
    expect(() => parseGpx("<kml/>")).toThrow("Not a GPX file");
    expect(() => parseGpx("<gpx><trk><trkseg><trkpt lat='1' lon='2'/></trkseg></trk></gpx>")).toThrow(/at least two/);
  });
});

describe("routeToGpx", () => {
  it("round-trips through parseGpx", () => {
    const xml = routeToGpx("A & B", [[8.123456789, 50.5], [9, 51]]);
    expect(xml).toContain("<name>A &#38; B</name>");
    expect(parseGpx(xml)).toEqual({ name: "A & B", coords: [[8.123457, 50.5], [9, 51]] });
  });
});
