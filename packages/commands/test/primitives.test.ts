import { describe, expect, it } from 'vitest';

import { signedArea2 } from '@overlord/geo-core';

import { arrayAlongLine, arrayAlongRing, gridFill, polygonRing, rectRing } from '../src/primitives.js';

const M = 10000;
const FT = 3048;

const t = (value: unknown): never => value as never;

describe('rectRing', () => {
  it('builds an exact CCW rectangle', () => {
    const ring = rectRing(t({ x: 0, y: 0, z: 0 }), t(60 * FT), t(40 * FT), 0);
    expect(ring).toEqual([
      { x: -30 * FT, y: -20 * FT },
      { x: 30 * FT, y: -20 * FT },
      { x: 30 * FT, y: 20 * FT },
      { x: -30 * FT, y: 20 * FT },
    ]);
    expect(signedArea2(t(ring))).toBe(2 * 60 * FT * 40 * FT);
  });

  it('rotates 90 degrees without changing the extents', () => {
    const ring = rectRing(t({ x: 0, y: 0, z: 0 }), t(60 * FT), t(40 * FT), 90);
    const xs = ring.map((point) => point.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(40 * FT);
  });
});

describe('polygonRing', () => {
  it('keeps a CCW polygon and reverses a CW one', () => {
    const ccw = t([
      { x: 0, y: 0 },
      { x: 10 * M, y: 0 },
      { x: 10 * M, y: 10 * M },
    ]);
    expect(polygonRing(ccw)).toEqual(ccw);
    const cw = [ccw[0], ccw[2], ccw[1]];
    expect(signedArea2(t(polygonRing(t(cw))))).toBeGreaterThan(0);
  });

  it('rejects a self-intersecting polygon and a tiny one', () => {
    expect(() =>
      polygonRing(
        t([
          { x: 0, y: 0 },
          { x: 10 * M, y: 10 * M },
          { x: 10 * M, y: 0 },
          { x: 0, y: 10 * M },
        ]),
      ),
    ).toThrow(/self-intersect/);
    expect(() => polygonRing(t([{ x: 0, y: 0 }]))).toThrow(/at least 3/);
  });
});

describe('arrayAlongLine', () => {
  it('gives 632 segments (633 points) at 1.00 m along a 632 m line', () => {
    const points = arrayAlongLine(t({ x: 0, y: 0, z: 0 }), t({ x: 632 * M, y: 0, z: 0 }), t(M));
    expect(points).toHaveLength(633);
    expect(points[1]?.point.x).toBe(M);
    expect(points[0]?.headingDeg).toBe(90);
  });

  it('supports inset and excluding the ends', () => {
    const points = arrayAlongLine(
      t({ x: 0, y: 0, z: 0 }),
      t({ x: 10 * M, y: 0, z: 0 }),
      t(M),
      { includeEnds: false, insetTmm: t(M) },
    );
    expect(points).toHaveLength(8);
    expect(points[0]?.point.x).toBe(1.5 * M);
  });
});

describe('arrayAlongRing', () => {
  it('arrays 20 points at 10 ft around a 60 x 40 ft rectangle', () => {
    const ring = rectRing(t({ x: 0, y: 0, z: 0 }), t(60 * FT), t(40 * FT), 0);
    expect(arrayAlongRing(ring, t(10 * FT))).toHaveLength(20);
  });
});

describe('gridFill', () => {
  const concave = polygonRing(
    t([
      { x: 0, y: 0 },
      { x: 30 * M, y: 0 },
      { x: 30 * M, y: 10 * M },
      { x: 10 * M, y: 10 * M },
      { x: 10 * M, y: 30 * M },
      { x: 0, y: 30 * M },
    ]),
  );

  it('places nothing outside a concave L-shape', () => {
    const points = gridFill(concave, t(5 * M), t(5 * M), t(M));
    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      const inArmA = point.x >= M && point.x <= 29 * M && point.y >= M && point.y <= 9 * M;
      const inArmB = point.x >= M && point.x <= 9 * M && point.y >= M && point.y <= 29 * M;
      expect(inArmA || inArmB, `${point.x},${point.y}`).toBe(true);
    }
    expect(points.some((point) => point.x > 11 * M && point.y > 11 * M)).toBe(false);
  });
});
