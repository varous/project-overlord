import { describe, expect, it } from 'vitest';

import { headingFromDrag, nudgeHeading, snapHeading } from '../src/site/placementMath.js';

describe('headingFromDrag', () => {
  const origin = { east: 0, north: 0 };

  it('north is 0', () => {
    expect(headingFromDrag(origin, { east: 0, north: 100 })).toBeCloseTo(0, 10);
  });

  it('east is 90', () => {
    expect(headingFromDrag(origin, { east: 100, north: 0 })).toBeCloseTo(90, 10);
  });

  it('south is 180', () => {
    expect(headingFromDrag(origin, { east: 0, north: -100 })).toBeCloseTo(180, 10);
  });

  it('west is 270', () => {
    expect(headingFromDrag(origin, { east: -100, north: 0 })).toBeCloseTo(270, 10);
  });

  it('handles a 45 degree case', () => {
    expect(headingFromDrag(origin, { east: 100, north: 100 })).toBeCloseTo(45, 10);
    expect(headingFromDrag(origin, { east: -100, north: 100 })).toBeCloseTo(315, 10);
  });

  it('uses the offset from a non-zero origin', () => {
    expect(headingFromDrag({ east: 10, north: 10 }, { east: 10, north: 110 })).toBeCloseTo(0, 10);
    expect(headingFromDrag({ east: 10, north: 10 }, { east: 110, north: 10 })).toBeCloseTo(90, 10);
  });
});

describe('snapHeading', () => {
  it('rounds to the nearest step', () => {
    expect(snapHeading(37, 5)).toBe(35);
    expect(snapHeading(38, 5)).toBe(40);
    expect(snapHeading(2, 5)).toBe(0);
  });

  it('normalises the result', () => {
    expect(snapHeading(358, 5)).toBe(0);
    expect(snapHeading(-3, 5)).toBe(355);
    expect(snapHeading(357, 5)).toBe(355);
  });

  it('returns a normalised value for a non-positive step', () => {
    expect(snapHeading(-10, 0)).toBe(350);
  });
});

describe('nudgeHeading', () => {
  it('normalises after adding', () => {
    expect(nudgeHeading(350, 15)).toBe(5);
    expect(nudgeHeading(0, -10)).toBe(350);
    expect(nudgeHeading(180, 180)).toBe(0);
    expect(nudgeHeading(1, -5)).toBe(356);
  });
});
