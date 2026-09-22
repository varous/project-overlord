import { describe, expect, it } from 'vitest';
import {
  areaTmm2,
  fromTmm,
  formatLength,
  LENGTH_FACTORS,
  toDecimalString,
  toTmm,
  UnitError,
  type LengthUnit,
  type Tmm,
} from '../src/index.js';

/** Test helper: brand a plain number as tmm. */
const t = (n: number): Tmm => n as Tmm;

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof UnitError ? error.code : undefined;
  }
  return undefined;
}

describe('LENGTH_FACTORS', () => {
  it('uses the exact canonical factors', () => {
    expect(LENGTH_FACTORS).toEqual({ m: 10000, cm: 100, mm: 10, ft: 3048, in: 254 });
  });
});

describe('toTmm', () => {
  it('converts exact whole values', () => {
    expect(toTmm('60', 'ft')).toBe(182880);
    expect(toTmm('61', 'ft')).toBe(185928);
    expect(toTmm('18.288', 'm')).toBe(182880);
    expect(toTmm('1', 'in')).toBe(254);
    expect(toTmm('0.1', 'mm')).toBe(1);
  });

  it('accepts an explicit plus sign and bare fractions', () => {
    expect(toTmm('+60', 'ft')).toBe(182880);
    expect(toTmm('.5', 'm')).toBe(5000);
  });

  it('throws INVALID_DECIMAL for non-decimal strings', () => {
    expect(errorCode(() => toTmm('abc', 'm'))).toBe('INVALID_DECIMAL');
    expect(errorCode(() => toTmm('', 'm'))).toBe('INVALID_DECIMAL');
    expect(errorCode(() => toTmm('1,5', 'm'))).toBe('INVALID_DECIMAL');
    expect(errorCode(() => toTmm('1 2', 'm'))).toBe('INVALID_DECIMAL');
  });

  it('throws NOT_EXACT when the result is not a whole number of tmm', () => {
    expect(errorCode(() => toTmm('0.00001', 'm'))).toBe('NOT_EXACT');
  });

  it('throws NEGATIVE unless allowNegative is set', () => {
    expect(errorCode(() => toTmm('-5', 'm'))).toBe('NEGATIVE');
    expect(toTmm('-5', 'm', { allowNegative: true })).toBe(-50000);
  });

  it('throws UNSAFE_INTEGER beyond the safe integer range', () => {
    expect(errorCode(() => toTmm('1000000000000000', 'm'))).toBe('UNSAFE_INTEGER');
  });
});

describe('round trips', () => {
  const cases: Array<[string, LengthUnit]> = [
    ['61', 'ft'],
    ['18.288', 'm'],
    ['2500', 'mm'],
  ];

  it('toTmm -> toDecimalString returns the canonical input', () => {
    for (const [input, unit] of cases) {
      expect(toDecimalString(toTmm(input, unit), unit)).toBe(input);
    }
  });

  it('handles negatives symmetrically', () => {
    const value = toTmm('-18.288', 'm', { allowNegative: true });
    expect(toDecimalString(value, 'm')).toBe('-18.288');
  });
});

describe('toDecimalString', () => {
  it('returns null for non-terminating values', () => {
    expect(toDecimalString(t(1), 'ft')).toBeNull();
  });

  it('is exact for terminating values', () => {
    expect(toDecimalString(toTmm('0.1', 'mm'), 'mm')).toBe('0.1');
    expect(toDecimalString(t(0), 'm')).toBe('0');
  });
});

describe('fromTmm', () => {
  it('reduces exactly by GCD with den > 0', () => {
    expect(fromTmm(t(182880), 'ft')).toEqual({ num: 60n, den: 1n });
    expect(fromTmm(t(182880), 'm')).toEqual({ num: 2286n, den: 125n });
    expect(fromTmm(t(-182880), 'ft')).toEqual({ num: -60n, den: 1n });
  });

  it('normalises zero to { 0, 1 }', () => {
    expect(fromTmm(t(0), 'in')).toEqual({ num: 0n, den: 1n });
  });
});

describe('formatLength', () => {
  it('renders display units with a unit suffix', () => {
    expect(formatLength(t(182900), 'm', 2)).toBe('18.29 m');
    expect(formatLength(t(182880), 'ft', 0)).toBe('60 ft');
  });
});

describe('areaTmm2', () => {
  it('multiplies side lengths exactly', () => {
    const a = toTmm('60', 'ft');
    const b = toTmm('40', 'ft');
    expect(areaTmm2(a, b)).toBe(182880 * 121920);
  });

  it('allows a 2 km by 2 km area', () => {
    expect(areaTmm2(toTmm('2000', 'm'), toTmm('2000', 'm'))).toBe(400000000000000);
  });

  it('throws UNSAFE_INTEGER for a 20 km by 20 km area', () => {
    expect(errorCode(() => areaTmm2(toTmm('20000', 'm'), toTmm('20000', 'm')))).toBe(
      'UNSAFE_INTEGER',
    );
  });
});
