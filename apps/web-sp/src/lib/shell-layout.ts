/**
 * Shell layout constants — the 1366×768 contract.
 * At the minimum viewport only the canvas shrinks; side panels keep token widths.
 */
export const SHELL = {
  minViewportWidth: 1366,
  minViewportHeight: 768,
  menubarH: 40,
  viewbarH: 44,
  modebarH: 36,
  statusbarH: 32,
  leftPanelW: 296,
  toolRailW: 48,
  rightPanelW: 300,
} as const;

/** Canvas width when the window is exactly the minimum width. */
export function canvasWidthAt(viewportWidth: number): number {
  return Math.max(0, viewportWidth - SHELL.leftPanelW - SHELL.rightPanelW);
}

export function shellFitsMinimum(viewportWidth: number): boolean {
  return (
    viewportWidth >= SHELL.minViewportWidth &&
    canvasWidthAt(viewportWidth) ===
      SHELL.minViewportWidth - SHELL.leftPanelW - SHELL.rightPanelW
  );
}
