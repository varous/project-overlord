/**
 * Snapping helpers. PURE module: no DOM, no Cesium.
 *
 * The corpus module sizes are 10 ft and 16 ft, with 1 ft as the fine step. There is exactly one
 * angle-snapping implementation in the product: `snapAngleDeg` here; the web placement code reuses it.
 */

import { toTmm, type LocalPoint, type Tmm } from '@overlord/geo-core';

/** Corpus modules in tmm. */
export const SNAP_MODULE_10FT: Tmm = toTmm('10', 'ft');
export const SNAP_MODULE_16FT: Tmm = toTmm('16', 'ft');
/** Fine step in tmm. */
export const SNAP_FINE_1FT: Tmm = toTmm('1', 'ft');

export const SNAP_MODULES: readonly Tmm[] = [SNAP_MODULE_10FT, SNAP_MODULE_16FT];

/** Normalise any finite angle to [0, 360). */
export function normalizeAngleDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Nearest multiple of `moduleTmm`, returned as an exact tmm integer. */
export function snapLengthTmm(value: Tmm, moduleTmm: Tmm): Tmm {
  if (!(moduleTmm > 0)) {
    return value;
  }
  return (Math.round(value / moduleTmm) * moduleTmm) as Tmm;
}

/** Snap X and Y to the module; Z is left untouched. */
export function snapPoint(point: LocalPoint, moduleTmm: Tmm): LocalPoint {
  return {
    x: snapLengthTmm(point.x, moduleTmm),
    y: snapLengthTmm(point.y, moduleTmm),
    z: point.z,
  };
}

/** Nearest multiple of `stepDeg`, normalised to [0, 360). */
export function snapAngleDeg(deg: number, stepDeg: number): number {
  if (!(stepDeg > 0)) {
    return normalizeAngleDeg(deg);
  }
  return normalizeAngleDeg(Math.round(deg / stepDeg) * stepDeg);
}
