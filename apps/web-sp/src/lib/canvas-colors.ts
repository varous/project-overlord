/**
 * Konva draws to a bitmap and cannot resolve `var(--bg-canvas)`. The kickoff
 * brief requires canvas colours to be read from CSS at draw time and re-read
 * on theme change — this is the one place that happens.
 *
 * Rule from tokens.json: `--selection` (blue) is canvas-only, never chrome.
 */

export interface CanvasPalette {
  bg: string;
  grid: string;
  selection: string;
  selectionSoft: string;
  axisX: string;
  axisY: string;
  axisZ: string;
  text: string;
  border: string;
}

function read(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function readCanvasPalette(): CanvasPalette {
  return {
    bg: read("--bg-canvas"),
    grid: read("--canvas-grid"),
    selection: read("--selection"),
    selectionSoft: read("--selection-soft"),
    axisX: read("--axis-x"),
    axisY: read("--axis-y"),
    axisZ: read("--axis-z"),
    text: read("--text-primary"),
    border: read("--border-default"),
  };
}

/** Subscribe to theme changes; returns an unsubscribe function. */
export function onPaletteChange(cb: (p: CanvasPalette) => void): () => void {
  const handler = () => cb(readCanvasPalette());
  window.addEventListener("showplan:themechange", handler);
  return () => window.removeEventListener("showplan:themechange", handler);
}
