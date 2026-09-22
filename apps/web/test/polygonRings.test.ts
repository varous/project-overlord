import { describe, expect, it } from 'vitest';

import { areaTmm2, isSimpleRing, signedArea2, toTmm, type Point2 } from '@overlord/geo-core';

import { demoScene, elementPlaceable } from '../src/site/demoSite.js';
import { elementCornersLocal, type Placeable } from '../src/site/placement.js';

const ROTATIONS = [0, 37, 90, 180, 271];

function asPoint2(corners: Array<{ x: number; y: number }>): Point2[] {
  return corners.map((corner) => ({ x: corner.x, y: corner.y }));
}

/** For a box the corners are the bottom ring followed by the top ring; a flat element is one ring. */
function ringsOf(placeable: Placeable): Point2[][] {
  const corners = elementCornersLocal(placeable);
  if (placeable.size.z === 0) {
    return [asPoint2(corners)];
  }
  return [asPoint2(corners.slice(0, 4)), asPoint2(corners.slice(4, 8))];
}

describe('demo element footprints', () => {
  for (const element of demoScene.elements) {
    for (const rotationDeg of ROTATIONS) {
      it(`${element.id} @ ${rotationDeg} deg is a simple CCW ring`, () => {
        const placeable: Placeable = { ...elementPlaceable(element), rotationDeg };
        for (const ring of ringsOf(placeable)) {
          expect(isSimpleRing(ring)).toBe(true);
          expect(signedArea2(ring)).toBeGreaterThan(0);
        }
      });
    }
  }

  it('keeps the flat audience zone at exactly 200 ft x 250 ft in tmm2', () => {
    const zone = demoScene.zones.find((candidate) => candidate.kind === 'AUDIENCE');
    if (zone === undefined) {
      throw new Error('missing AUDIENCE zone');
    }
    const ring = asPoint2(zone.ring.value);
    expect(isSimpleRing(ring)).toBe(true);
    expect(signedArea2(ring)).toBeGreaterThan(0);
    expect(signedArea2(ring) / 2).toBe(areaTmm2(toTmm('200', 'ft'), toTmm('250', 'ft')));
  });
});
