import { describe, expect, it } from 'vitest';

import { signedArea2 } from '@overlord/geo-core';

import { difference, intersection, offsetRing, splitRing, union, type Ring } from '../src/index.js';

const M = 10000; // 1 m in tmm
const FT = 3048; // 1 ft in tmm

function rect(x: number, y: number, width: number, height: number): Ring {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function areaM2(ring: Ring): number {
  return signedArea2(ring as never) / 2 / (M * M);
}

function totalAreaM2(rings: Ring[], holes: Ring[]): number {
  return (
    rings.reduce((sum, ring) => sum + areaM2(ring), 0) -
    holes.reduce((sum, ring) => sum + areaM2(ring), 0)
  );
}

describe('boolean operations', () => {
  it('unions two overlapping rectangles to the expected area', () => {
    const a = rect(0, 0, 50 * M, 50 * M);
    const b = rect(25 * M, 25 * M, 50 * M, 50 * M);
    const result = union([a], [b]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rings).toHaveLength(1);
      expect(totalAreaM2(result.rings, result.holes)).toBeCloseTo(4375, 6); // 2*2500 - 625
    }
  });

  it('subtracts a 2 m pillar from a 50 x 50 m room, leaving a hole', () => {
    const room = rect(0, 0, 50 * M, 50 * M);
    const pillar = rect(10 * M, 10 * M, 2 * M, 2 * M);
    const result = difference([room], [pillar]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.holes.length).toBeGreaterThanOrEqual(1);
      expect(totalAreaM2(result.rings, result.holes)).toBeCloseTo(2496, 6); // 2500 - 4
    }
  });

  it('intersects two overlapping rectangles', () => {
    const a = rect(0, 0, 50 * M, 50 * M);
    const b = rect(25 * M, 25 * M, 50 * M, 50 * M);
    const result = intersection([a], [b]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(totalAreaM2(result.rings, result.holes)).toBeCloseTo(625, 6); // 25 x 25
    }
  });

  it('rejects a self-intersecting (bow-tie) input', () => {
    const bowTie: Ring = [
      { x: 0, y: 0 },
      { x: 10 * M, y: 10 * M },
      { x: 10 * M, y: 0 },
      { x: 0, y: 10 * M },
    ];
    const result = union([bowTie], [rect(0, 0, M, M)]);
    expect(result.ok).toBe(false);
  });
});

describe('offsetRing', () => {
  it('grows a 60 x 40 ft rectangle by 6 ft to exactly 72 x 52 ft', () => {
    const ring = rect(0, 0, 60 * FT, 40 * FT);
    const grown = offsetRing(ring, 6 * FT);
    expect(grown).not.toBeNull();
    if (grown === null) {
      return;
    }
    const xs = grown.map((point) => point.x);
    const ys = grown.map((point) => point.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(72 * FT);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(52 * FT);
    expect(signedArea2(grown as never)).toBe(2 * 72 * FT * (52 * FT));
  });

  it('shrinks a 20 x 20 ft rectangle by 5 ft to 10 x 10 ft', () => {
    const ring = rect(0, 0, 20 * FT, 20 * FT);
    const shrunk = offsetRing(ring, -5 * FT);
    expect(shrunk).not.toBeNull();
    if (shrunk === null) {
      return;
    }
    const xs = shrunk.map((point) => point.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(10 * FT);
  });

  it('returns null when a 2 m square shrinks by 2 m', () => {
    expect(offsetRing(rect(0, 0, 2 * M, 2 * M), -2 * M)).toBeNull();
  });
});

describe('splitRing', () => {
  it('splits a rectangle into two rings', () => {
    const ring = rect(0, 0, 40 * FT, 20 * FT);
    const parts = splitRing(ring, { x: 20 * FT, y: -1000 }, { x: 20 * FT, y: 20 * FT + 1000 });
    expect(parts).toHaveLength(2);
    const total = parts.reduce((sum, part) => sum + signedArea2(part as never) / 2, 0);
    expect(total).toBe(signedArea2(ring as never) / 2);
  });

  it('returns the ring unchanged when the line misses it', () => {
    const ring = rect(0, 0, 40 * FT, 20 * FT);
    const parts = splitRing(ring, { x: 100 * FT, y: 0 }, { x: 100 * FT, y: 10 * FT });
    expect(parts).toHaveLength(1);
  });
});
