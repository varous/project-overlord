import { describe, expect, it } from 'vitest';

import { toTmm, type Tmm } from '@overlord/geo-core';
import type { Ring2 } from '../src/types.js';
import { sceneCapacity, zoneAreaSqFt, zoneCapacity } from '../src/index.js';
import { makeScene } from './fixtures.js';

const FT = 3048;

/** A CCW rectangle with the given integer-foot sides. */
function rectFt(sidesFt: { x: number; y: number }): Ring2 {
  const width = (sidesFt.x * FT) as Tmm;
  const height = (sidesFt.y * FT) as Tmm;
  return [
    { x: 0 as Tmm, y: 0 as Tmm },
    { x: width, y: 0 as Tmm },
    { x: width, y: height },
    { x: 0 as Tmm, y: height },
  ];
}

describe('zoneAreaSqFt / zoneCapacity (Aquatica benchmark)', () => {
  // The drawing states 75 pax for 380 sq ft; we floor (76) and do not pretend to match.
  const cases: Array<{ sqFt: number; sides: { x: number; y: number }; pax: number }> = [
    { sqFt: 20000, sides: { x: 200, y: 100 }, pax: 4000 },
    { sqFt: 10000, sides: { x: 100, y: 100 }, pax: 2000 },
    { sqFt: 1500, sides: { x: 30, y: 50 }, pax: 300 },
    { sqFt: 1000, sides: { x: 20, y: 50 }, pax: 200 },
    { sqFt: 380, sides: { x: 20, y: 19 }, pax: 76 },
  ];

  for (const testCase of cases) {
    it(`${testCase.sqFt} sq ft at 5 sq ft/person yields ${testCase.pax} pax`, () => {
      const ring = rectFt(testCase.sides);
      expect(zoneAreaSqFt(ring)).toBe(testCase.sqFt);
      expect(zoneCapacity(ring, 5)).toBe(testCase.pax);
    });
  }

  it('uses the stated density', () => {
    expect(zoneCapacity(rectFt({ x: 200, y: 100 }), 4)).toBe(5000);
    expect(zoneCapacity(rectFt({ x: 200, y: 100 }), 0)).toBe(0);
  });

  it('covers square metres as well as feet', () => {
    const ring = rectFt({ x: 10, y: 10 });
    expect(zoneAreaSqFt(ring)).toBe(100);
    expect((100 * (FT * FT)) / 10000 / 10000).toBeCloseTo(9.29, 2); // 100 sq ft ≈ 9.29 m²
    expect(toTmm('1', 'ft')).toBe(FT);
  });
});

describe('sceneCapacity', () => {
  it('sums the per-zone capacity', () => {
    const doc = makeScene();
    const capacity = sceneCapacity(doc);
    expect(capacity.byZone.length).toBe(doc.zones.length);
    expect(capacity.byZone[0]?.density).toBe(5);
    expect(capacity.totalPax).toBe(
      capacity.byZone.reduce((sum, row) => sum + row.pax, 0),
    );
    // The demo audience zone is 200 ft x 250 ft = 50,000 sq ft → 10,000 pax at 5.
    expect(capacity.byZone[0]?.areaSqFt).toBe(50000);
    expect(capacity.byZone[0]?.pax).toBe(10000);
  });
});
