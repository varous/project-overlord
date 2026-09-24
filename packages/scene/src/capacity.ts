/**
 * Zone-level capacity arithmetic. PURE module: no DOM, no Cesium.
 *
 * Areas are exact square feet derived from the integer tmm ring: 1 sq ft = 3048^2 sq tmm.
 */

import { signedArea2, type Sourced } from '@overlord/geo-core';

import { DEFAULT_DENSITY_SQFT_PER_PERSON } from './migration.js';
import type { Ring2, SceneDoc } from './types.js';

/** Square tmm in one square foot (3048 tmm = 1 ft). */
export const TMM2_PER_SQFT = 3048 * 3048; // 9,290,304

/** Exact area of a ring in square tmm. */
export function ringAreaTmm2(ring: Ring2): number {
  return signedArea2(ring) / 2;
}

/** Exact area of a ring in square feet. */
export function zoneAreaSqFt(ring: Ring2): number {
  return ringAreaTmm2(ring) / TMM2_PER_SQFT;
}

/** People the ring holds at the given planning density (floored). */
export function zoneCapacity(ring: Ring2, densitySqFtPerPerson: number): number {
  if (!(densitySqFtPerPerson > 0)) {
    return 0;
  }
  return Math.floor(zoneAreaSqFt(ring) / densitySqFtPerPerson);
}

export interface ZoneCapacityRow {
  id: string;
  label: string;
  areaSqFt: number;
  density: number;
  pax: number;
}

export interface SceneCapacity {
  byZone: ZoneCapacityRow[];
  totalPax: number;
}

function densityOf(density: Sourced<number> | undefined): number {
  const value = density?.value;
  return typeof value === 'number' && value > 0 ? value : DEFAULT_DENSITY_SQFT_PER_PERSON;
}

/** Per-zone and total capacity for a scene document. */
export function sceneCapacity(doc: SceneDoc): SceneCapacity {
  const byZone = doc.zones.map((zone) => {
    const areaSqFt = zoneAreaSqFt(zone.ring.value);
    const density = densityOf(zone.densitySqFtPerPerson);
    return {
      id: zone.id,
      label: zone.label,
      areaSqFt,
      density,
      pax: Math.floor(areaSqFt / density),
    };
  });
  return {
    byZone,
    totalPax: byZone.reduce((sum, row) => sum + row.pax, 0),
  };
}
