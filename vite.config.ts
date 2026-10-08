import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  // Relative base so the build works under any GitHub Pages sub-path.
  base: "./",
  plugins: [solid()],
});
