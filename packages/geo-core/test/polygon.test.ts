import { describe, expect, it } from 'vitest';

import { isSimpleRing, signedArea2, type Point2 } from '../src/index.js';

const p = (x: number, y: number): Point2 => ({ x, y });

describe('signedArea2', () => {
  it('is positive for a counter-clockwise unit square', () => {
    expect(signedArea2([p(0, 0), p(1, 0), p(1, 1), p(0, 1)])).toBe(2);
  });

  it('is negative for a clockwise unit square', () => {
    expect(signedArea2([p(0, 0), p(0, 1), p(1, 1), p(1, 0)])).toBe(-2);
  });

  it('is exact for large integer coordinates', () => {
    // 2 km x 2 km in tmm: 20,000,000 x 20,000,000.
    const side = 20_000_000;
    expect(signedArea2([p(0, 0), p(side, 0), p(side, side), p(0, side)])).toBe(2 * side * side);
  });

  it('treats a triangle as a ring', () => {
    expect(signedArea2([p(0, 0), p(4, 0), p(0, 3)])).toBe(12);
  });

  it('returns 0 for fewer than three points', () => {
    expect(signedArea2([])).toBe(0);
    expect(signedArea2([p(0, 0)])).toBe(0);
    expect(signedArea2([p(0, 0), p(1, 1)])).toBe(0);
  });
});

describe('isSimpleRing', () => {
  it('accepts a convex CCW ring', () => {
    expect(isSimpleRing([p(0, 0), p(4, 0), p(4, 4), p(0, 4)])).toBe(true);
  });

  it('accepts a simple clockwise ring too (orientation is not required)', () => {
    expect(isSimpleRing([p(0, 0), p(0, 4), p(4, 4), p(4, 0)])).toBe(true);
  });

  it('accepts a concave L-shape', () => {
    expect(isSimpleRing([p(0, 0), p(4, 0), p(4, 1), p(1, 1), p(1, 4), p(0, 4)])).toBe(true);
  });

  it('rejects the classic symmetric bow-tie', () => {
    expect(isSimpleRing([p(0, 0), p(1, 1), p(1, 0), p(0, 1)])).toBe(false);
  });

  it('rejects an asymmetric bow-tie with non-zero area', () => {
    const bowTie = [p(0, 0), p(4, 1), p(4, 0), p(0, 2)];
    expect(signedArea2(bowTie)).not.toBe(0);
    expect(isSimpleRing(bowTie)).toBe(false);
  });

  it('rejects a vertex lying on a non-adjacent edge', () => {
    expect(isSimpleRing([p(0, 0), p(4, 0), p(4, 4), p(2, 0), p(0, 4)])).toBe(false);
  });

  it('rejects a repeated non-adjacent vertex', () => {
    expect(isSimpleRing([p(0, 0), p(4, 0), p(4, 4), p(0, 0)])).toBe(false);
  });

  it('rejects collinear rings', () => {
    expect(isSimpleRing([p(0, 0), p(1, 0), p(2, 0)])).toBe(false);
    expect(isSimpleRing([p(0, 0), p(2, 0), p(4, 0), p(6, 0)])).toBe(false);
  });

  it('rejects degenerate rings', () => {
    expect(isSimpleRing([])).toBe(false);
    expect(isSimpleRing([p(1, 1)])).toBe(false);
    expect(isSimpleRing([p(1, 1), p(1, 1)])).toBe(false);
    expect(isSimpleRing([p(0, 0), p(0, 0), p(0, 0)])).toBe(false);
  });

  it('rejects collinear overlapping edges', () => {
    // Edge (0,0)-(4,0) overlaps edge (2,0)-(6,0) on a degenerate ring.
    expect(isSimpleRing([p(0, 0), p(4, 0), p(6, 0), p(2, 0)])).toBe(false);
  });
});
