/**
 * Path maths for LINEAR elements. PURE module. A path is an open polyline of integer tmm points.
 */

import type { Tmm } from '@overlord/geo-core';
import type { Ring2 } from './types.js';

const TMM_PER_FT = 3048;

/** Total length of an open polyline in tmm. */
export function pathLengthTmm(path: Ring2): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1];
    const current = path[index];
    if (previous === undefined || current === undefined) {
      continue;
    }
    total += Math.hypot(
      (current.x as number) - (previous.x as number),
      (current.y as number) - (previous.y as number),
    );
  }
  return total;
}

/** Total length of an open polyline in feet. */
export function pathLengthFt(path: Ring2): number {
  return pathLengthTmm(path) / TMM_PER_FT;
}

/** Number of whole segments needed to cover the path: ceil(length / segmentLength). */
export function segmentCount(path: Ring2, segmentLengthTmm: Tmm): number {
  const segment = segmentLengthTmm as number;
  if (!(segment > 0)) {
    return 0;
  }
  return Math.ceil(pathLengthTmm(path) / segment);
}
