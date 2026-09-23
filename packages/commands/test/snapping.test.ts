import { describe, expect, it } from 'vitest';

import {
  SNAP_FINE_1FT,
  SNAP_MODULE_10FT,
  SNAP_MODULE_16FT,
  SNAP_MODULES,
  normalizeAngleDeg,
  snapAngleDeg,
  snapLengthTmm,
  snapPoint,
} from '../src/snapping.js';

describe('snap modules', () => {
  it('expresses 10 ft, 16 ft and 1 ft exactly in tmm', () => {
    expect(SNAP_MODULE_10FT).toBe(30480);
    expect(SNAP_MODULE_16FT).toBe(48768);
    expect(SNAP_FINE_1FT).toBe(3048);
    expect(SNAP_MODULES).toEqual([30480, 48768]);
  });
});

describe('snapLengthTmm', () => {
  it('rounds to the nearest 10 ft multiple and stays an exact integer', () => {
    expect(snapLengthTmm(16000 as never, SNAP_MODULE_10FT)).toBe(30480);
    expect(snapLengthTmm(46000 as never, SNAP_MODULE_10FT)).toBe(60960);
    expect(Number.isSafeInteger(snapLengthTmm(46000 as never, SNAP_MODULE_10FT))).toBe(true);
  });

  it('rounds to the nearest 16 ft multiple and stays an exact integer', () => {
    expect(snapLengthTmm(50000 as never, SNAP_MODULE_16FT)).toBe(48768);
    expect(snapLengthTmm(30000 as never, SNAP_MODULE_16FT)).toBe(48768);
    expect(Number.isSafeInteger(snapLengthTmm(50000 as never, SNAP_MODULE_16FT))).toBe(true);
  });

  it('uses the 1 ft fine step', () => {
    expect(snapLengthTmm(5000 as never, SNAP_FINE_1FT)).toBe(6096);
    expect(snapLengthTmm(1 as never, SNAP_FINE_1FT)).toBe(0);
  });

  it('returns the value unchanged for a non-positive module', () => {
    expect(snapLengthTmm(1234 as never, 0 as never)).toBe(1234);
  });
});

describe('snapPoint', () => {
  it('snaps x and y and leaves z untouched', () => {
    expect(snapPoint({ x: 16000, y: 60000, z: 9144 } as never, SNAP_MODULE_10FT)).toEqual({
      x: 30480,
      y: 60960,
      z: 9144,
    });
  });
});

describe('snapAngleDeg', () => {
  it('snaps to 5 degrees and to the 1 degree fine step', () => {
    expect(snapAngleDeg(37, 5)).toBe(35);
    expect(snapAngleDeg(38, 5)).toBe(40);
    expect(snapAngleDeg(37.4, 1)).toBe(37);
  });

  it('normalises into [0, 360)', () => {
    expect(snapAngleDeg(-3, 5)).toBe(355);
    expect(snapAngleDeg(363, 5)).toBe(5);
  });

  it('falls back to normalisation for a non-positive step', () => {
    expect(snapAngleDeg(400, 0)).toBe(40);
  });
});

describe('normalizeAngleDeg', () => {
  it('normalises negatives and overshoots', () => {
    expect(normalizeAngleDeg(-90)).toBe(270);
    expect(normalizeAngleDeg(720)).toBe(0);
    expect(normalizeAngleDeg(370)).toBe(10);
  });
});
