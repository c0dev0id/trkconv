import { describe, expect, it } from "vitest";
import { routeUrl } from "../src/lib/osrm";

describe("routeUrl", () => {
  it("joins lon,lat pairs with semicolons", () => {
    expect(routeUrl("bike", [[8.1, 50.1], [8.2, 50.2]])).toBe(
      "https://routing.openstreetmap.de/routed-bike/route/v1/driving/8.100000,50.100000;8.200000,50.200000?overview=full&geometries=geojson",
    );
  });
});
