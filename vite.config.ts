import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  // Relative base so the build works under any GitHub Pages sub-path.
  base: "./",
  plugins: [solid()],
  // maplibre-gl alone is ~1 MB minified; splitting it would not reduce load time.
  build: { chunkSizeWarningLimit: 1500 },
});
