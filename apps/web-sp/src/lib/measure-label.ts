import {
  formatDualLength,
  formatLength,
  pixelsToMm,
  polylineLength,
  type LengthUnit,
  type Scale,
} from "@overlord/boq";

function lengthMm(
  points: readonly { x: number; y: number }[],
  scale: Scale | null,
): number | null {
  if (points.length < 2) return null;
  return pixelsToMm(polylineLength(points), scale);
}

/** On-canvas mark. Calibration unit only — dual would jump when selected. */
export function canvasMeasureLabel(
  points: readonly { x: number; y: number }[],
  scale: Scale | null,
  unit: LengthUnit,
): string | null {
  const mm = lengthMm(points, scale);
  return mm == null ? null : formatLength(mm, unit, 1);
}

/** Inspector cross-check. Dual lives here, not on the drawing. */
export function inspectorMeasureLabel(
  points: readonly { x: number; y: number }[],
  scale: Scale | null,
  unit: LengthUnit,
): string | null {
  const mm = lengthMm(points, scale);
  return mm == null ? null : formatDualLength(mm, unit);
}
