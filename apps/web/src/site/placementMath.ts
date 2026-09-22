/**
 * Placement math. PURE module: no Cesium, no DOM.
 */

import { normalizeHeading } from './urlState.js';

export interface EnuPoint {
  east: number;
  north: number;
}

/**
 * Heading in degrees [0, 360) of the vector from `originEnu` to `pointerEnu`, clockwise from
 * north (0 = north, 90 = east).
 */
export function headingFromDrag(originEnu: EnuPoint, pointerEnu: EnuPoint): number {
  const east = pointerEnu.east - originEnu.east;
  const north = pointerEnu.north - originEnu.north;
  return normalizeHeading((Math.atan2(east, north) * 180) / Math.PI);
}

/** Round to the nearest multiple of `stepDeg`, normalised to [0, 360). */
export function snapHeading(deg: number, stepDeg: number): number {
  if (!(stepDeg > 0)) {
    return normalizeHeading(deg);
  }
  return normalizeHeading(Math.round(deg / stepDeg) * stepDeg);
}

/** Add `deltaDeg` and normalise to [0, 360). */
export function nudgeHeading(deg: number, deltaDeg: number): number {
  return normalizeHeading(deg + deltaDeg);
}
