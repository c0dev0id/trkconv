import type { Source } from "../lib/waypoints";

/** Marker colour per selection step; slider swatches use the same values. */
export const SOURCE_COLORS: Record<Source, string> = {
  endpoint: "#111827",
  rdp: "#0d9488",
  corner: "#f59e0b",
  gap: "#65a30d",
};

/** Swatch for the minimum gap, whose removed points are drawn muted. */
export const REMOVED_COLOR = "#9ca3af";

/** Off-route track points and route detours. */
export const DEVIATION_COLOR = "#ef4444";
