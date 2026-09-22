import { describe, expect, it } from 'vitest';

import { localToGeodetic, type SiteAnchor } from '@overlord/geo-core';

import { DEMO_ANCHOR, demoScene, elementPlaceable } from '../src/site/demoSite.js';
import { elementCornersGeodetic, elementCornersLocal } from '../src/site/placement.js';

function element(id: string) {
  const found = demoScene.elements.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`missing element ${id}`);
  }
  return found;
}

describe('elementCornersLocal', () => {
  it('matches expected tmm corners for main_stage at 0 degrees', () => {
    expect(elementCornersLocal(elementPlaceable(element('main_stage')))).toEqual([
      { x: -91440, y: -121920, z: 0 },
      { x: 91440, y: -121920, z: 0 },
      { x: 91440, y: 0, z: 0 },
      { x: -91440, y: 0, z: 0 },
      { x: -91440, y: -121920, z: 18288 },
      { x: 91440, y: -121920, z: 18288 },
      { x: 91440, y: 0, z: 18288 },
      { x: -91440, y: 0, z: 18288 },
    ]);
  });

  it('swaps x/y extents for main_stage at 90 degrees', () => {
    const placeable = { ...elementPlaceable(element('main_stage')), rotationDeg: 90 };
    const corners = elementCornersLocal(placeable);
    const xs = corners.map((corner) => corner.x as number);
    const ys = corners.map((corner) => corner.y as number);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(121920);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(182880);
  });

  it('produces geodetic corners for a box element', () => {
    expect(elementCornersGeodetic(DEMO_ANCHOR, elementPlaceable(element('main_stage')))).toHaveLength(8);
  });
});

describe('audience zone placement', () => {
  function zoneCentroid(): { x: number; y: number } {
    const ring = demoScene.zones[0]?.ring.value ?? [];
    const sum = ring.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
    return { x: sum.x / ring.length, y: sum.y / ring.length };
  }

  it('lies north of the anchor when heading is 0', () => {
    const anchor: SiteAnchor = { ...DEMO_ANCHOR, headingDeg: 0 };
    const centroid = zoneCentroid();
    const geodetic = localToGeodetic(anchor, { x: centroid.x, y: centroid.y, z: 0 } as never);
    expect(geodetic.latDeg).toBeGreaterThan(DEMO_ANCHOR.latDeg);
  });

  it('lies east of the anchor when heading is 90', () => {
    const anchor: SiteAnchor = { ...DEMO_ANCHOR, headingDeg: 90 };
    const centroid = zoneCentroid();
    const geodetic = localToGeodetic(anchor, { x: centroid.x, y: centroid.y, z: 0 } as never);
    expect(geodetic.lonDeg).toBeGreaterThan(DEMO_ANCHOR.lonDeg);
  });
});
