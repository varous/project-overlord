import { describe, expect, it } from 'vitest';

import { pathLengthFt, pathLengthTmm, segmentCount } from '../src/index.js';
import type { Ring2 } from '../src/types.js';

const M = 10000;
const FT = 3048;

function path(points: Array<[number, number]>): Ring2 {
  return points.map(([x, y]) => ({ x, y })) as unknown as Ring2;
}

describe('path maths (Aquatica barricade run)', () => {
  it('measures a 632 m path and its 1.00 m segments', () => {
    const barricadeRun = path([
      [0, 0],
      [632 * M, 0],
    ]);
    // The Aquatica V5 drawing places 632 mojo straights, each 1.00 m: a 632 m run.
    expect(pathLengthTmm(barricadeRun)).toBe(632 * M);
    expect(Math.round(pathLengthFt(barricadeRun))).toBe(2073);
    expect(segmentCount(barricadeRun, M as never)).toBe(632);
  });

  it('sums a multi-segment open polyline', () => {
    const bent = path([
      [0, 0],
      [3 * FT, 0],
      [3 * FT, 4 * FT],
    ]);
    expect(pathLengthTmm(bent)).toBe(7 * FT);
    expect(pathLengthFt(bent)).toBeCloseTo(7, 9);
  });

  it('rounds the segment count up', () => {
    const short = path([
      [0, 0],
      [1 * FT, 0],
    ]);
    expect(segmentCount(short, (2 * FT) as never)).toBe(1);
    expect(segmentCount(short, 0 as never)).toBe(0);
    expect(segmentCount(path([]), M as never)).toBe(0);
  });
});
