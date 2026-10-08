import { defineConfig } from "vitest/config";

// Tests cover the framework-free modules in src/lib only, so the Solid
// plugin (which would force a jsdom environment) is not loaded here.
export default defineConfig({
  test: { environment: "node" },
});
