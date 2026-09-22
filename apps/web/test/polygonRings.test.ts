import { describe, expect, it } from 'vitest';

import { areaTmm2, isSimpleRing, signedArea2, toTmm, type Point2 } from '@overlord/geo-core';

import { DEMO_ELEMENTS, type SiteElement } from '../src/site/demoSite.js';
import { elementCornersLocal } from '../src/site/placement.js';

const ROTATIONS = [0, 37, 90, 180, 271];

function asPoint2(corners: Array<{ x: number; y: number }>): Point2[] {
  return corners.map((corner) => ({ x: corner.x, y: corner.y }));
}

/** For a box the corners are the bottom ring followed by the top ring; a flat element is one ring. */
function ringsOf(element: SiteElement): Point2[][] {
  const corners = elementCornersLocal(element);
  if (element.size.z === 0) {
    return [asPoint2(corners)];
  }
  return [asPoint2(corners.slice(0, 4)), asPoint2(corners.slice(4, 8))];
}

describe('demo element footprints', () => {
  for (const element of DEMO_ELEMENTS) {
    for (const rotationDeg of ROTATIONS) {
      it(`${element.id} @ ${rotationDeg} deg is a simple CCW ring`, () => {
        const rotated: SiteElement = { ...element, rotationDeg };
        for (const ring of ringsOf(rotated)) {
          expect(isSimpleRing(ring)).toBe(true);
          expect(signedArea2(ring)).toBeGreaterThan(0);
        }
      });
    }
  }

  it('keeps the flat audience zone at exactly 200 ft x 250 ft in tmm2', () => {
    const zone = DEMO_ELEMENTS.find((element) => element.id === 'audience_zone');
    if (zone === undefined) {
      throw new Error('missing audience_zone');
    }
    const exactArea = areaTmm2(toTmm('200', 'ft'), toTmm('250', 'ft'));
    // Declared size is exact to the required 200 ft x 250 ft.
    expect(areaTmm2(zone.size.x, zone.size.y)).toBe(exactArea);

    for (const rotationDeg of ROTATIONS) {
      const ring = asPoint2(elementCornersLocal({ ...zone, rotationDeg }));
      expect(isSimpleRing(ring)).toBe(true);
      expect(signedArea2(ring)).toBeGreaterThan(0);

      const area = signedArea2(ring) / 2;
      if (rotationDeg === 0 || rotationDeg === 90 || rotationDeg === 180) {
        // Axis-aligned quarter turns keep integer corners, so the area is exact.
        expect(area).toBe(exactArea);
      } else {
        // A rotated rectangle is rounded to integer tmm, so its shoelace area can shift by up
        // to half a unit per coordinate (bounded by the perimeter).
        const perimeter = 2 * ((zone.size.x as number) + (zone.size.y as number));
        expect(Math.abs(area - exactArea)).toBeLessThanOrEqual(perimeter);
      }
    }
  });
});
