/**
 * Measurement types - the industry calls these "takeoff types". We use the
 * industry word deliberately; estimators already know it.
 * See docs/10-head-start-analysis.md, recommendation 2.
 */

import { area, perimeter, polylineLength, type Point } from "./geometry.js";
import { sqPixelsToSqMm, pixelsToMm, type Scale } from "./scale.js";

export type MeasurementType =
  | "count"
  | "length"
  | "area"
  | "perimeter"
  | "deduct"
  | "manual";

export interface Measurement {
  readonly type: MeasurementType;
  /** Base-map pixel coordinates. Empty for count and manual. */
  readonly points: readonly Point[];
  /** Used by count and manual only. */
  readonly explicitValue?: number;
}

/**
 * The canonical value of a measurement.
 *   count / manual -> dimensionless number
 *   length / perimeter -> millimetres
 *   area -> square millimetres
 *   deduct -> NEGATIVE square millimetres, so it sums naturally with area
 *
 * Returns null when a geometric measurement is attempted without calibration.
 * Count and manual do not need a scale and always resolve.
 */
export function resolveMeasurement(
  m: Measurement,
  scale: Scale | null,
): number | null {
  switch (m.type) {
    case "count":
    case "manual":
      return m.explicitValue ?? 0;
    case "length":
      return pixelsToMm(polylineLength(m.points), scale);
    case "perimeter":
      return pixelsToMm(perimeter(m.points), scale);
    case "area":
      return sqPixelsToSqMm(area(m.points), scale);
    case "deduct": {
      const a = sqPixelsToSqMm(area(m.points), scale);
      return a === null ? null : -a;
    }
  }
}

/** True when this measurement type cannot resolve without a calibrated scale. */
export function requiresScale(type: MeasurementType): boolean {
  return type !== "count" && type !== "manual";
}
