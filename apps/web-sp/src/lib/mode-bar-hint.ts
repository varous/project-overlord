import type { MapState } from "./api.js";
import type { CanvasMode } from "./canvas-mode.js";

/** Mode-bar instruction line — derived from the exclusive canvas mode (QA-06, QA-19). */
export function modeBarHint(args: {
  canvasMode: CanvasMode;
  mapState: MapState;
  placingName?: string | null;
}): string {
  const { canvasMode, mapState, placingName } = args;
  switch (canvasMode.kind) {
    case "place":
      return `Click to place ${placingName ?? "package"} · Esc to cancel`;
    case "calibrate":
      if (canvasMode.phase === "a") {
        return "Click the first point of a known distance · Esc to cancel";
      }
      if (canvasMode.phase === "b") {
        return "Click the second point · Esc to cancel · scroll to zoom, Pan tool to pan";
      }
      return "Enter the real distance and confirm";
    case "measure":
      return "Click two points · Esc to cancel";
    case "tool":
      switch (canvasMode.tool) {
        case "Pan":
          return "Drag to pan · scroll to zoom";
        case "Zoom":
          return "Scroll to zoom · drag with Pan to move";
        case "Select":
          if (mapState === "no_map") {
            return "Place packages from Assets · upload a plan when you need measured areas";
          }
          if (mapState === "map_uncalibrated") {
            return "Place packages from Assets · set scale for area and length quantities";
          }
          return "Click to select · pick a package in Assets to place";
        default:
          return "Select a tool";
      }
  }
}

export function isPositiveDistance(raw: string): boolean {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0;
}
