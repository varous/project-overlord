import { describe, expect, it } from 'vitest';

import { elementTypeRegistry, validateScene } from '@overlord/scene';

import { DEMO_ANCHOR, demoScene, elementPlaceable } from '../src/site/demoSite.js';

function element(id: string) {
  const found = demoScene.elements.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`missing element ${id}`);
  }
  return found;
}

describe('demoScene', () => {
  it('is a valid scene document', () => {
    const result = validateScene(demoScene, elementTypeRegistry);
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('has the demo anchor', () => {
    expect(DEMO_ANCHOR).toMatchObject({ latDeg: 22.5579, lonDeg: 88.3439, heightM: 0, headingDeg: 0 });
  });

  it('uses ARCHETYPE provenance throughout', () => {
    expect(demoScene.site.anchor.provenance).toBe('ARCHETYPE');
    for (const item of demoScene.elements) {
      expect(item.placement.provenance).toBe('ARCHETYPE');
      expect(item.size.provenance).toBe('ARCHETYPE');
    }
    for (const zone of demoScene.zones) {
      expect(zone.ring.provenance).toBe('ARCHETYPE');
    }
  });

  it('sizes the main stage exactly 60 x 40 x 6 ft', () => {
    expect(element('main_stage').size.value).toEqual({ x: 182880, y: 121920, z: 18288 });
  });

  it('places the main stage +Y face exactly at y = 0', () => {
    const placeable = elementPlaceable(element('main_stage'));
    expect((placeable.center.y as number) + (placeable.size.y as number) / 2).toBe(0);
  });

  it('represents the audience area as an AUDIENCE zone, not an element', () => {
    expect(demoScene.zones.map((zone) => zone.kind)).toContain('AUDIENCE');
    expect(demoScene.elements.find((item) => item.id === 'audience_zone')).toBeUndefined();
  });
});
