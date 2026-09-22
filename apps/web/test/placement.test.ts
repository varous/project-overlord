import { describe, expect, it } from 'vitest';

import { localToGeodetic, type SiteAnchor } from '@overlord/geo-core';

import { DEMO_ANCHOR, DEMO_ELEMENTS, type SiteElement } from '../src/site/demoSite.js';
import { elementCornersGeodetic, elementCornersLocal } from '../src/site/placement.js';

function byId(id: string): SiteElement {
  const element = DEMO_ELEMENTS.find((candidate) => candidate.id === id);
  if (element === undefined) {
    throw new Error(`missing element: ${id}`);
  }
  return element;
}

describe('elementCornersLocal', () => {
  it('matches expected tmm corners for main_stage at 0 degrees', () => {
    const stage = byId('main_stage');
    expect(elementCornersLocal(stage)).toEqual([
      { x: -91440, y: -121920, z: 0 },
      { x: 91440, y: -121920, z: 0 },
      { x: -91440, y: 0, z: 0 },
      { x: 91440, y: 0, z: 0 },
      { x: -91440, y: -121920, z: 18288 },
      { x: 91440, y: -121920, z: 18288 },
      { x: -91440, y: 0, z: 18288 },
      { x: 91440, y: 0, z: 18288 },
    ]);
  });

  it('swaps x/y extents for main_stage at 90 degrees', () => {
    const stage = byId('main_stage');
    const rotated: SiteElement = { ...stage, rotationDeg: 90 };
    const corners = elementCornersLocal(rotated);
    const xs = corners.map((corner) => corner.x as number);
    const ys = corners.map((corner) => corner.y as number);

    // 60 ft = 182880 tmm, 40 ft = 121920 tmm; after a quarter turn they swap.
    expect(Math.max(...xs) - Math.min(...xs)).toBe(121920);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(182880);
  });

  it('returns 4 corners at z = 0 for the flat audience zone', () => {
    const zone = byId('audience_zone');
    const corners = elementCornersLocal(zone);
    expect(corners).toHaveLength(4);
    for (const corner of corners) {
      expect(corner.z).toBe(0);
    }
  });
});

describe('audience zone geodetic placement', () => {
  it('lies north of the anchor when heading is 0', () => {
    const zone = byId('audience_zone');
    const anchor: SiteAnchor = { ...DEMO_ANCHOR, headingDeg: 0 };
    const geodetic = localToGeodetic(anchor, zone.center);
    expect(geodetic.latDeg).toBeGreaterThan(DEMO_ANCHOR.latDeg);
  });

  it('lies east of the anchor when heading is 90', () => {
    const zone = byId('audience_zone');
    const anchor: SiteAnchor = { ...DEMO_ANCHOR, headingDeg: 90 };
    const geodetic = localToGeodetic(anchor, zone.center);
    expect(geodetic.lonDeg).toBeGreaterThan(DEMO_ANCHOR.lonDeg);
  });

  it('projects flat-zone corners to geodetic', () => {
    const zone = byId('audience_zone');
    expect(elementCornersGeodetic(DEMO_ANCHOR, zone)).toHaveLength(4);
  });
});
