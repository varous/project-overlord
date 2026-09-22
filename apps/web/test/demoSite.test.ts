import { describe, expect, it } from 'vitest';

import { DEMO_ELEMENTS, type SiteElement } from '../src/site/demoSite.js';

function byId(id: string): SiteElement {
  const element = DEMO_ELEMENTS.find((candidate) => candidate.id === id);
  if (element === undefined) {
    throw new Error(`missing element: ${id}`);
  }
  return element;
}

describe('demoSite', () => {
  it('uses exact integer tmm sizes built from feet', () => {
    expect(DEMO_ELEMENTS.length).toBeGreaterThan(0);
    for (const element of DEMO_ELEMENTS) {
      for (const size of [element.size.x, element.size.y, element.size.z]) {
        expect(Number.isSafeInteger(size)).toBe(true);
        expect(size % 3048).toBe(0);
      }
      expect(element.provenance).toBe('ARCHETYPE');
    }
  });

  it('sizes the main stage exactly 60 x 40 x 6 ft', () => {
    const stage = byId('main_stage');
    expect(stage.size.x).toBe(182880);
    expect(stage.size.y).toBe(121920);
    expect(stage.size.z).toBe(18288);
  });

  it('places the main stage +Y face exactly at y = 0', () => {
    const stage = byId('main_stage');
    expect((stage.center.y as number) + (stage.size.y as number) / 2).toBe(0);
  });
});
